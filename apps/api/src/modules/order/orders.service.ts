import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  ERROR_CODES,
  MeasurementSnapshot,
  OrderCreateRequest,
  OrderDto,
  OrderEventDto,
  OrderListItemDto,
  OrderListQuery,
  OrderShipRequest,
  OrderStatus,
  OrderStatusUpdateRequest,
  PricingMode,
  CustomerContact,
  ORDER_STATUS_LABELS,
  Paginated,
  ProductSnapshot,
  ProductSnapshotSummary,
  QuoteStatus,
  REQUEST_STATUS_LABELS,
  RequestStatus,
} from '@qinyang/contracts';
import { randomBytes } from 'node:crypto';
import { DataSource, EntityManager, In, Repository, SelectQueryBuilder } from 'typeorm';
import { CustomizationRequest } from '../../database/entities/customization-request.entity';
import { Order } from '../../database/entities/order.entity';
import { OrderEvent } from '../../database/entities/order-event.entity';
import { Quote } from '../../database/entities/quote.entity';
import { BusinessException } from '../../common/errors/business.exception';
import { AuditService } from '../audit/audit.service';
import type { AdminPrincipal } from '../../common/decorators/current-admin.decorator';
import { buildCsv } from '../../common/csv';
import { maskPhone } from '../../common/mask';
import { isDuplicateKey } from '../../common/errors/duplicate-key';

/** 单次导出上限：防止误操作把整库拖成一份大文件 */
const EXPORT_LIMIT = 5000;

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
    private readonly dataSource: DataSource,
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
    /*
     * 报价必须是**顾客确认过**的那一版。
     *
     * 此前只校验「申请状态 = 已确认」+「报价有效」，
     * 但申请状态本身可以被管理端接口手工改成 CONFIRMED ——
     * 于是「顾客没点头也能建单」。这里直接看报价自己的确认时间戳：
     * confirmedAt 为空 = 顾客从未确认过这份报价。
     */
    if (!quote.confirmedAt) {
      throw BusinessException.conflict(
        '该报价尚未经顾客确认，不能生成订单',
        ERROR_CODES.INVALID_STATUS_TRANSITION,
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
    /*
     * 订单 + 订单事件必须同生共死：
     * 此前分两步写，若事件写入失败就会出现「有订单但没有任何进度记录」的订单，
     * 顾客端看到的订单时间线是空的，商家也无从追溯。
     *
     * 并发建单由数据库唯一索引（orders.requestId）兜底：
     * 两个店员同时点「创建订单」，后者会拿到重复键错误，
     * 这里翻译成 409，而不是让它变成 500。
     */
    let saved: Order;
    try {
      saved = await this.dataSource.transaction(async (manager) => {
        const orderRepo = manager.getRepository(Order);
        const eventRepo = manager.getRepository(OrderEvent);
        const created = await orderRepo.save(entity);
        await eventRepo.save(
          eventRepo.create({
            orderId: created.id,
            fromStatus: null,
            toStatus: OrderStatus.CONFIRMED,
            operatorId: admin.id,
            operatorName: admin.displayName,
            note: `由定制申请 ${request.requestNo} 转为订单`,
          }),
        );
        return created;
      });
    } catch (error) {
      if (isDuplicateKey(error)) {
        throw BusinessException.conflict(
          '该申请已生成订单，请勿重复创建',
          ERROR_CODES.INVALID_STATUS_TRANSITION,
        );
      }
      throw error;
    }

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

    return this.toDto(saved, [], request.requestNo);
  }

  async listAdmin(query: OrderListQuery): Promise<Paginated<OrderListItemDto>> {
    const page = Math.max(1, Number(query.page ?? 1));
    const pageSize = Math.min(100, Math.max(1, Number(query.pageSize ?? 20)));

    const qb = this.buildAdminQuery(query)
      .orderBy('o.createdAt', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize);

    const [items, total] = await qb.getManyAndCount();
    return {
      items: await this.toListItems(items),
      total,
      page,
      pageSize,
    };
  }

  /** 管理端筛选条件（列表与导出共用，保证「看到的」与「导出的」一致） */
  private buildAdminQuery(query: OrderListQuery): SelectQueryBuilder<Order> {
    const qb = this.orders.createQueryBuilder('o');
    if (query.status) qb.andWhere('o.status = :status', { status: query.status });
    if (query.keyword) {
      /*
       * 关键字要能搜到**顾客和商家看得见的那个编号**。
       *
       * 后台列表「来源申请」列显示的是 `requestNo`（形如 RQ-2026-0001），
       * 而搜索此前只匹配 `orderNo` 与 `requestId`（UUID）——
       * 商家照着屏幕上看到的编号去搜，搜出来是空的。
       */
      qb.andWhere(
        `(o.orderNo LIKE :kw OR o.requestId LIKE :kw
          OR o.requestId IN (SELECT r.id FROM customization_requests r WHERE r.requestNo LIKE :kw))`,
        {
          kw: `%${query.keyword}%`,
        },
      );
    }
    return qb;
  }

  /**
   * 管理端导出 CSV（当前筛选条件）。
   *
   * 与申请导出同一口径：手机号脱敏、不含量体明细 ——
   * 导出文件会离开后台，不该带着完整联系方式与顾客隐私。
   */
  async exportAdminCsv(query: OrderListQuery): Promise<string> {
    const qb = this.buildAdminQuery(query).orderBy('o.createdAt', 'DESC').take(EXPORT_LIMIT);
    const orders = await qb.getMany();
    if (orders.length === 0) {
      return buildCsv(
        [
          '订单编号',
          '申请编号',
          '顾客姓名',
          '手机号（脱敏）',
          '商品名称',
          '商品编号',
          '状态',
          '货款（元）',
          '运费（元）',
          '合计（元）',
          '制作周期（天）',
          '提交时间',
          '更新时间',
        ],
        [],
      );
    }

    // 一次取回来源申请的编号与联系方式（避免逐行查询）
    const requestIds = [...new Set(orders.map((order) => order.requestId))];
    const requests = await this.requests.find({ where: { id: In(requestIds) } });
    const requestMap = new Map(requests.map((row) => [row.id, row]));

    const rows = orders.map((order) => {
      const snapshot = (order.productSnapshot ?? {}) as Partial<ProductSnapshot>;
      const source = requestMap.get(order.requestId);
      const contact = (source?.contact ?? {}) as Partial<CustomerContact>;
      return [
        order.orderNo,
        source?.requestNo ?? '',
        contact.name ?? '',
        maskPhone(contact.phone) ?? '',
        snapshot.name ?? '',
        snapshot.code ?? '',
        ORDER_STATUS_LABELS[order.status],
        (order.amountCents / 100).toFixed(2),
        (order.freightCents / 100).toFixed(2),
        (order.totalCents / 100).toFixed(2),
        order.productionDays,
        order.createdAt.toISOString(),
        order.updatedAt.toISOString(),
      ];
    });

    return buildCsv(
      [
        '订单编号',
        '申请编号',
        '顾客姓名',
        '手机号（脱敏）',
        '商品名称',
        '商品编号',
        '状态',
        '货款（元）',
        '运费（元）',
        '合计（元）',
        '制作周期（天）',
        '提交时间',
        '更新时间',
      ],
      rows,
    );
  }

  async getAdmin(id: string): Promise<OrderDto> {
    const order = await this.orders.findOne({ where: { id } });
    if (!order) throw BusinessException.notFound('订单不存在');
    const events = await this.events.find({
      where: { orderId: id },
      order: { createdAt: 'ASC' },
    });
    const requestNo = await this.requestNoOf(order);
    return this.toDto(order, events, requestNo);
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

    /*
     * 订单状态、订单事件、定制申请状态三处必须同时落库。
     * 此前分三步写：若事件写成功而申请状态写失败，
     * 就会出现「订单已发货、申请还停在制作中」的自相矛盾状态，
     * 顾客在申请页与订单页看到的时间进度不一致。
     */
    const saved = await this.dataSource.transaction(async (manager) => {
      const orderRepo = manager.getRepository(Order);
      const eventRepo = manager.getRepository(OrderEvent);
      /*
       * 条件更新（乐观锁）：只有仍处于原状态的订单才能推进。
       * 两个店员同时点「推进到已发货」时，后到者 affected = 0 → 409，
       * 不会产生两条重复的状态变更事件。
       */
      const affected = await orderRepo.update(
        { id: order.id, status: before },
        {
          status: dto.status,
          ...(dto.status === OrderStatus.COMPLETED ? { completedAt: new Date() } : {}),
        },
      );
      if (affected.affected !== 1) {
        throw BusinessException.conflict(
          '订单状态已被他人变更，请刷新后重试',
          ERROR_CODES.INVALID_STATUS_TRANSITION,
        );
      }
      const updated = await orderRepo.findOne({ where: { id: order.id } });
      if (!updated) throw BusinessException.notFound('订单不存在');
      await eventRepo.save(
        eventRepo.create({
          orderId: updated.id,
          fromStatus: before,
          toStatus: dto.status,
          operatorId: admin.id,
          operatorName: admin.displayName,
          note: dto.note ?? null,
        }),
      );
      await this.syncRequestStatus(updated.requestId, dto.status, manager);
      return updated;
    });
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

    // 与状态推进同理：物流信息、发货事件、申请状态一起落库
    const saved = await this.dataSource.transaction(async (manager) => {
      const orderRepo = manager.getRepository(Order);
      const eventRepo = manager.getRepository(OrderEvent);
      // 条件更新：只有仍在制作中的订单能发货
      const affected = await orderRepo.update(
        { id: order.id, status: OrderStatus.IN_PRODUCTION },
        {
          status: OrderStatus.SHIPPED,
          carrier: dto.carrier.trim(),
          trackingNo: dto.trackingNo.trim(),
          shippedAt: new Date(),
        },
      );
      if (affected.affected !== 1) {
        throw BusinessException.conflict(
          '订单状态已被他人变更，请刷新后重试',
          ERROR_CODES.INVALID_STATUS_TRANSITION,
        );
      }
      const updated = await orderRepo.findOne({ where: { id: order.id } });
      if (!updated) throw BusinessException.notFound('订单不存在');
      await eventRepo.save(
        eventRepo.create({
          orderId: updated.id,
          fromStatus: before,
          toStatus: OrderStatus.SHIPPED,
          operatorId: admin.id,
          operatorName: admin.displayName,
          note: dto.note ?? `物流：${order.carrier} ${order.trackingNo}`,
        }),
      );
      await this.syncRequestStatus(updated.requestId, OrderStatus.SHIPPED, manager);
      return updated;
    });
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

    // 取消同样三处同事务：订单、事件、申请状态
    const saved = await this.dataSource.transaction(async (manager) => {
      const orderRepo = manager.getRepository(Order);
      const eventRepo = manager.getRepository(OrderEvent);
      // 条件更新：只有仍在原状态的订单能被取消
      const affected = await orderRepo.update(
        { id: order.id, status: before },
        { status: OrderStatus.CANCELLED },
      );
      if (affected.affected !== 1) {
        throw BusinessException.conflict(
          '订单状态已被他人变更，请刷新后重试',
          ERROR_CODES.INVALID_STATUS_TRANSITION,
        );
      }
      const updated = await orderRepo.findOne({ where: { id: order.id } });
      if (!updated) throw BusinessException.notFound('订单不存在');
      await eventRepo.save(
        eventRepo.create({
          orderId: updated.id,
          fromStatus: before,
          toStatus: OrderStatus.CANCELLED,
          operatorId: admin.id,
          operatorName: admin.displayName,
          note: note.trim(),
        }),
      );
      await this.syncRequestStatus(updated.requestId, OrderStatus.CANCELLED, manager);
      return updated;
    });
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
  ): Promise<Paginated<OrderListItemDto>> {
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
      items: await this.toListItems(items),
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
    return this.toDto(order, events, request.requestNo);
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

  /**
   * 订单状态推进时同步定制申请状态，两者始终一致。
   *
   * 传入 manager 时加入调用方的事务；不传则独立写入
   * （仅供事务外的兼容路径使用）。
   */
  private async syncRequestStatus(
    requestId: string,
    orderStatus: OrderStatus,
    manager?: EntityManager,
  ): Promise<void> {
    const mapping: Partial<Record<OrderStatus, RequestStatus>> = {
      [OrderStatus.IN_PRODUCTION]: RequestStatus.IN_PRODUCTION,
      [OrderStatus.SHIPPED]: RequestStatus.SHIPPED,
      [OrderStatus.COMPLETED]: RequestStatus.COMPLETED,
      [OrderStatus.CANCELLED]: RequestStatus.CANCELLED,
    };
    const target = mapping[orderStatus];
    if (!target) return;
    const requestRepo = manager
      ? manager.getRepository(CustomizationRequest)
      : this.requests;
    const request = await requestRepo.findOne({ where: { id: requestId } });
    if (!request || request.status === target) return;
    /*
     * 只写 status 列。
     *
     * 此前是 `request.status = target; requestRepo.save(request)` —— 整行回写，
     * 而 request 是事务外读到的：店员在这期间写的审核备注会被旧值覆盖。
     */
    await requestRepo.update({ id: requestId }, { status: target });
  }

  private generateOrderNo(): string {
    const now = new Date();
    const stamp =
      `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(
        now.getDate(),
      ).padStart(2, '0')}`;
    return `QO-${stamp}-${randomBytes(3).toString('hex').toUpperCase()}`;
  }

  /** 取订单的来源申请号（订单表不冗余存申请号） */
  private async requestNoOf(order: Order): Promise<string> {
    const row = await this.requests.findOne({
      where: { id: order.requestId },
      select: { id: true, requestNo: true },
    });
    return row?.requestNo ?? '';
  }

  /**
   * 批量取来源申请号（列表用）。
   * 订单表不冗余存申请号，这里一次查完，避免逐行查询。
   */
  private async loadRequestNos(requestIds: string[]): Promise<Map<string, string>> {
    const map = new Map<string, string>();
    if (requestIds.length === 0) {
      return map;
    }
    const rows = await this.requests.find({
      where: { id: In(requestIds) },
      select: { id: true, requestNo: true },
    });
    for (const row of rows) {
      map.set(row.id, row.requestNo);
    }
    return map;
  }

  /** 列表项组装：批量取申请号 + 精简 DTO（不含量体快照、联系方式、事件流） */
  private async toListItems(orders: Order[]): Promise<OrderListItemDto[]> {
    if (orders.length === 0) {
      return [];
    }
    const requestNoMap = await this.loadRequestNos(
      orders.map((order) => order.requestId),
    );
    return orders.map((order) =>
      this.toListItemDto(order, requestNoMap.get(order.requestId) ?? ''),
    );
  }

  private toListItemDto(order: Order, requestNo: string): OrderListItemDto {
    const snapshot = (order.productSnapshot ?? {}) as Partial<ProductSnapshot>;
    const productSnapshot: ProductSnapshotSummary = {
      id: snapshot.id ?? '',
      code: snapshot.code ?? '',
      name: snapshot.name ?? '',
      pricingMode: snapshot.pricingMode ?? PricingMode.QUOTE_ONLY,
      priceCents: snapshot.priceCents ?? null,
      categoryName: snapshot.categoryName ?? '',
      coverUrl: snapshot.coverUrl ?? null,
      mediaCount: (snapshot.media ?? []).length,
    };
    return {
      id: order.id,
      orderNo: order.orderNo,
      requestId: order.requestId,
      requestNo,
      quoteId: order.quoteId,
      quoteVersion: order.quoteVersion,
      status: order.status,
      statusLabel: ORDER_STATUS_LABELS[order.status],
      amountCents: order.amountCents,
      freightCents: order.freightCents,
      totalCents: order.totalCents,
      currency: order.currency,
      productionDays: order.productionDays,
      productSnapshot,
      remark: order.remark,
      carrier: order.carrier,
      trackingNo: order.trackingNo,
      shippedAt: order.shippedAt ? order.shippedAt.toISOString() : null,
      completedAt: order.completedAt ? order.completedAt.toISOString() : null,
      createdAt: order.createdAt.toISOString(),
      updatedAt: order.updatedAt.toISOString(),
    };
  }

  private toDto(order: Order, events: OrderEvent[], requestNo = ''): OrderDto {
    return {
      id: order.id,
      orderNo: order.orderNo,
      requestId: order.requestId,
      requestNo,
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
