import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  ERROR_CODES,
  MeasurementSnapshot,
  OrderCreateRequest,
  OrderDto,
  OrderEventDto,
  OrderListQuery,
  OrderShipRequest,
  OrderStatus,
  OrderStatusUpdateRequest,
  ORDER_STATUS_LABELS,
  Paginated,
  ProductSnapshot,
  QuoteStatus,
  REQUEST_STATUS_LABELS,
  RequestStatus,
} from '@qinyang/contracts';
import { randomBytes } from 'node:crypto';
import { In, Repository } from 'typeorm';
import { CustomizationRequest } from '../../database/entities/customization-request.entity';
import { Order } from '../../database/entities/order.entity';
import { OrderEvent } from '../../database/entities/order-event.entity';
import { Quote } from '../../database/entities/quote.entity';
import { BusinessException } from '../../common/errors/business.exception';
import { AuditService } from '../audit/audit.service';
import type { AdminPrincipal } from '../../common/decorators/current-admin.decorator';

@Injectable()
export class OrdersService {
  constructor(
    @InjectRepository(Order)
    private readonly orders: Repository<Order>,
    @InjectRepository(OrderEvent)
    private readonly events: Repository<OrderEvent>,
    @InjectRepository(Quote)
    private readonly quotes: Repository<Quote>,
    @InjectRepository(CustomizationRequest)
    private readonly requests: Repository<CustomizationRequest>,
    private readonly audit: AuditService,
  ) {}

  // ───────────────────────── 管理端 ─────────────────────────

  /** 由已确认定制申请生成订单，商品与量体快照自报价继承 */
  async create(dto: OrderCreateRequest, admin: AdminPrincipal): Promise<OrderDto> {
    const request = await this.requests.findOne({ where: { id: dto.requestId } });
    if (!request) throw BusinessException.notFound('定制申请不存在');
    if (request.status !== RequestStatus.CONFIRMED) {
      throw BusinessException.conflict(
        `定制申请当前为「${REQUEST_STATUS_LABELS[request.status]}」，只有已确认报价的申请才能转订单`,
        ERROR_CODES.INVALID_STATUS_TRANSITION,
      );
    }

    const quote = await this.quotes.findOne({ where: { id: dto.quoteId } });
    if (!quote || quote.requestId !== request.id) {
      throw BusinessException.notFound('报价不存在');
    }
    if (quote.status !== QuoteStatus.ACTIVE) {
      throw BusinessException.conflict(
        '只能使用当前有效报价创建订单',
        ERROR_CODES.QUOTE_NOT_ACTIVE,
      );
    }

    const existing = await this.orders.findOne({ where: { requestId: request.id } });
    if (existing) {
      throw BusinessException.conflict('该申请已生成订单', ERROR_CODES.INVALID_STATUS_TRANSITION);
    }

    const entity = this.orders.create({
      orderNo: this.generateOrderNo(),
      requestId: request.id,
      quoteId: quote.id,
      quoteVersion: quote.version,
      status: OrderStatus.CONFIRMED,
      productSnapshot: quote.productSnapshot,
      measurementSnapshot: quote.measurementSnapshot,
      contact: request.contact,
      remark: request.remark,
      amountCents: quote.amountCents,
      freightCents: quote.freightCents,
      totalCents: quote.amountCents + quote.freightCents,
      currency: quote.currency,
      productionDays: quote.productionDays,
    });
    const saved = await this.orders.save(entity);

    await this.events.save(
      this.events.create({
        orderId: saved.id,
        fromStatus: null,
        toStatus: OrderStatus.CONFIRMED,
        operatorId: admin.id,
        operatorName: admin.displayName,
        note: `由定制申请 ${request.requestNo} 转为订单`,
      }),
    );

    await this.audit.record({
      actorId: admin.id,
      actorName: admin.displayName,
      actorRole: admin.role,
      action: 'order.create',
      targetType: 'order',
      targetId: saved.id,
      after: {
        orderNo: saved.orderNo,
        requestId: saved.requestId,
        quoteVersion: saved.quoteVersion,
        totalCents: saved.totalCents,
      },
      ip: null,
    });

    return this.toDto(saved, []);
  }

  async listAdmin(query: OrderListQuery): Promise<Paginated<OrderDto>> {
    const page = Math.max(1, Number(query.page ?? 1));
    const pageSize = Math.min(100, Math.max(1, Number(query.pageSize ?? 20)));

    const qb = this.orders.createQueryBuilder('o');
    if (query.status) qb.andWhere('o.status = :status', { status: query.status });
    if (query.keyword) {
      qb.andWhere('(o.orderNo LIKE :kw OR o.requestId LIKE :kw)', {
        kw: `%${query.keyword}%`,
      });
    }
    qb.orderBy('o.createdAt', 'DESC').skip((page - 1) * pageSize).take(pageSize);

    const [items, total] = await qb.getManyAndCount();
    return {
      items: await Promise.all(items.map((item) => this.toDto(item, []))),
      total,
      page,
      pageSize,
    };
  }

  async getAdmin(id: string): Promise<OrderDto> {
    const order = await this.orders.findOne({ where: { id } });
    if (!order) throw BusinessException.notFound('订单不存在');
    const events = await this.events.find({
      where: { orderId: id },
      order: { createdAt: 'ASC' },
    });
    return this.toDto(order, events);
  }

  /** 更新制作状态 */
  async updateStatus(
    id: string,
    dto: OrderStatusUpdateRequest,
    admin: AdminPrincipal,
  ): Promise<OrderDto> {
    const order = await this.orders.findOne({ where: { id } });
    if (!order) throw BusinessException.notFound('订单不存在');

    const allowed = this.allowedTransitions(order.status, dto.status);
    if (!allowed) {
      throw BusinessException.conflict(
        `不允许从「${ORDER_STATUS_LABELS[order.status]}」变更为「${ORDER_STATUS_LABELS[dto.status]}」`,
        ERROR_CODES.INVALID_STATUS_TRANSITION,
      );
    }

    const before = order.status;
    order.status = dto.status;
    if (dto.status === OrderStatus.COMPLETED) {
      order.completedAt = new Date();
    }
    const saved = await this.orders.save(order);

    await this.events.save(
      this.events.create({
        orderId: saved.id,
        fromStatus: before,
        toStatus: dto.status,
        operatorId: admin.id,
        operatorName: admin.displayName,
        note: dto.note ?? null,
      }),
    );

    await this.syncRequestStatus(saved.requestId, dto.status);
    await this.audit.record({
      actorId: admin.id,
      actorName: admin.displayName,
      actorRole: admin.role,
      action: `order.status.${dto.status.toLowerCase()}`,
      targetType: 'order',
      targetId: saved.id,
      before: { status: before },
      after: { status: saved.status },
      ip: null,
    });

    return this.getAdmin(saved.id);
  }

  /** 填写物流并发货 */
  async ship(id: string, dto: OrderShipRequest, admin: AdminPrincipal): Promise<OrderDto> {
    const order = await this.orders.findOne({ where: { id } });
    if (!order) throw BusinessException.notFound('订单不存在');
    if (order.status !== OrderStatus.IN_PRODUCTION) {
      throw BusinessException.conflict(
        `只有制作中的订单可以发货，当前状态「${ORDER_STATUS_LABELS[order.status]}」`,
        ERROR_CODES.INVALID_STATUS_TRANSITION,
      );
    }
    if (!dto.carrier?.trim() || !dto.trackingNo?.trim()) {
      throw BusinessException.badRequest('物流公司与物流单号都不能为空');
    }

    const before = order.status;
    order.status = OrderStatus.SHIPPED;
    order.carrier = dto.carrier.trim();
    order.trackingNo = dto.trackingNo.trim();
    order.shippedAt = new Date();
    const saved = await this.orders.save(order);

    await this.events.save(
      this.events.create({
        orderId: saved.id,
        fromStatus: before,
        toStatus: OrderStatus.SHIPPED,
        operatorId: admin.id,
        operatorName: admin.displayName,
        note: dto.note ?? `物流：${order.carrier} ${order.trackingNo}`,
      }),
    );

    await this.syncRequestStatus(saved.requestId, OrderStatus.SHIPPED);
    await this.audit.record({
      actorId: admin.id,
      actorName: admin.displayName,
      actorRole: admin.role,
      action: 'order.ship',
      targetType: 'order',
      targetId: saved.id,
      before: { status: before },
      after: { status: saved.status, carrier: saved.carrier, trackingNo: saved.trackingNo },
      ip: null,
    });

    return this.getAdmin(saved.id);
  }

  async cancel(id: string, note: string | undefined, admin: AdminPrincipal): Promise<OrderDto> {
    const order = await this.orders.findOne({ where: { id } });
    if (!order) throw BusinessException.notFound('订单不存在');
    if (!this.allowedTransitions(order.status, OrderStatus.CANCELLED)) {
      throw BusinessException.conflict(
        `当前状态「${ORDER_STATUS_LABELS[order.status]}」不能取消`,
        ERROR_CODES.INVALID_STATUS_TRANSITION,
      );
    }
    if (!note?.trim()) {
      throw BusinessException.badRequest('取消订单必须填写原因');
    }

    const before = order.status;
    order.status = OrderStatus.CANCELLED;
    const saved = await this.orders.save(order);

    await this.events.save(
      this.events.create({
        orderId: saved.id,
        fromStatus: before,
        toStatus: OrderStatus.CANCELLED,
        operatorId: admin.id,
        operatorName: admin.displayName,
        note: note.trim(),
      }),
    );

    await this.syncRequestStatus(saved.requestId, OrderStatus.CANCELLED);
    await this.audit.record({
      actorId: admin.id,
      actorName: admin.displayName,
      actorRole: admin.role,
      action: 'order.cancel',
      targetType: 'order',
      targetId: saved.id,
      before: { status: before },
      after: { status: saved.status },
      ip: null,
    });

    return this.getAdmin(saved.id);
  }

  // ───────────────────────── 顾客端 ─────────────────────────

  async listMine(
    customerId: string,
    query: OrderListQuery,
  ): Promise<Paginated<OrderDto>> {
    const page = Math.max(1, Number(query.page ?? 1));
    const pageSize = Math.min(100, Math.max(1, Number(query.pageSize ?? 20)));

    const qb = this.orders
      .createQueryBuilder('o')
      .innerJoin(
        'customization_requests',
        'r',
        'r.id = o.requestId AND r.customerId = :customerId',
        { customerId },
      );
    if (query.status) qb.andWhere('o.status = :status', { status: query.status });
    qb.orderBy('o.createdAt', 'DESC').skip((page - 1) * pageSize).take(pageSize);

    const [items, total] = await qb.getManyAndCount();
    return {
      items: await Promise.all(items.map((item) => this.toDto(item, []))),
      total,
      page,
      pageSize,
    };
  }

  /** 顾客只能看自己的订单；越权返回 404 */
  async getMine(id: string, customerId: string): Promise<OrderDto> {
    const order = await this.orders.findOne({ where: { id } });
    if (!order) throw BusinessException.notFound('订单不存在');
    const request = await this.requests.findOne({ where: { id: order.requestId } });
    if (!request || request.customerId !== customerId) {
      throw BusinessException.notFound('订单不存在');
    }
    const events = await this.events.find({
      where: { orderId: order.id },
      order: { createdAt: 'ASC' },
    });
    return this.toDto(order, events);
  }

  // ───────────────────────── 内部实现 ─────────────────────────

  private allowedTransitions(from: OrderStatus, to: OrderStatus): boolean {
    const map: Record<OrderStatus, OrderStatus[]> = {
      [OrderStatus.CONFIRMED]: [OrderStatus.IN_PRODUCTION, OrderStatus.CANCELLED],
      [OrderStatus.IN_PRODUCTION]: [OrderStatus.SHIPPED, OrderStatus.CANCELLED],
      [OrderStatus.SHIPPED]: [OrderStatus.COMPLETED],
      [OrderStatus.COMPLETED]: [],
      [OrderStatus.CANCELLED]: [],
    };
    return map[from]?.includes(to) ?? false;
  }

  /** 订单状态推进时同步定制申请状态，两者始终一致 */
  private async syncRequestStatus(
    requestId: string,
    orderStatus: OrderStatus,
  ): Promise<void> {
    const mapping: Partial<Record<OrderStatus, RequestStatus>> = {
      [OrderStatus.IN_PRODUCTION]: RequestStatus.IN_PRODUCTION,
      [OrderStatus.SHIPPED]: RequestStatus.SHIPPED,
      [OrderStatus.COMPLETED]: RequestStatus.COMPLETED,
      [OrderStatus.CANCELLED]: RequestStatus.CANCELLED,
    };
    const target = mapping[orderStatus];
    if (!target) return;
    const request = await this.requests.findOne({ where: { id: requestId } });
    if (!request || request.status === target) return;
    request.status = target;
    await this.requests.save(request);
  }

  private generateOrderNo(): string {
    const now = new Date();
    const stamp =
      `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(
        now.getDate(),
      ).padStart(2, '0')}`;
    return `QO-${stamp}-${randomBytes(3).toString('hex').toUpperCase()}`;
  }

  private toDto(order: Order, events: OrderEvent[]): OrderDto {
    return {
      id: order.id,
      orderNo: order.orderNo,
      requestId: order.requestId,
      requestNo: '',
      quoteId: order.quoteId,
      quoteVersion: order.quoteVersion,
      status: order.status,
      statusLabel: ORDER_STATUS_LABELS[order.status],
      amountCents: order.amountCents,
      freightCents: order.freightCents,
      totalCents: order.totalCents,
      currency: order.currency,
      productionDays: order.productionDays,
      productSnapshot: order.productSnapshot as ProductSnapshot,
      measurementSnapshot: order.measurementSnapshot as MeasurementSnapshot,
      contact: order.contact as never,
      remark: order.remark,
      carrier: order.carrier,
      trackingNo: order.trackingNo,
      shippedAt: order.shippedAt ? order.shippedAt.toISOString() : null,
      completedAt: order.completedAt ? order.completedAt.toISOString() : null,
      events: events.map((event) => this.toEventDto(event)),
      createdAt: order.createdAt.toISOString(),
      updatedAt: order.updatedAt.toISOString(),
    };
  }

  private toEventDto(event: OrderEvent): OrderEventDto {
    return {
      id: event.id,
      fromStatus: event.fromStatus,
      toStatus: event.toStatus,
      operatorName: event.operatorName ?? '系统',
      note: event.note,
      createdAt: event.createdAt.toISOString(),
    };
  }

  /** 批量取订单事件，供列表页展示最近一条进度 */
  async findEvents(orderIds: string[]): Promise<OrderEvent[]> {
    if (orderIds.length === 0) return [];
    return this.events.find({ where: { orderId: In(orderIds) }, order: { createdAt: 'ASC' } });
  }
}
