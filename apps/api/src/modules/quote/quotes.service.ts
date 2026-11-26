import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  ERROR_CODES,
  MeasurementSnapshot,
  Paginated,
  ProductSnapshot,
  QuoteCreateRequest,
  QuoteDto,
  QuoteStatus,
  REQUEST_STATUS_LABELS,
  RequestStatus,
} from '@qinyang/contracts';
import { Repository } from 'typeorm';
import { CustomizationRequest } from '../../database/entities/customization-request.entity';
import { Order } from '../../database/entities/order.entity';
import { Quote } from '../../database/entities/quote.entity';
import { BusinessException } from '../../common/errors/business.exception';
import { AuditService } from '../audit/audit.service';
import { ProductsService } from '../catalog/products.service';
import type { AdminPrincipal } from '../../common/decorators/current-admin.decorator';

@Injectable()
export class QuoteService {
  constructor(
    @InjectRepository(Quote)
    private readonly quotes: Repository<Quote>,
    @InjectRepository(CustomizationRequest)
    private readonly requests: Repository<CustomizationRequest>,
    @InjectRepository(Order)
    private readonly orders: Repository<Order>,
    private readonly products: ProductsService,
    private readonly audit: AuditService,
  ) {}

  /** 该申请当前有效报价 */
  async findActiveByRequest(requestId: string): Promise<QuoteDto | null> {
    const quote = await this.quotes.findOne({
      where: { requestId, status: QuoteStatus.ACTIVE },
      order: { version: 'DESC' },
    });
    return quote ? this.toDto(quote) : null;
  }

  async listByRequest(requestId: string): Promise<QuoteDto[]> {
    const rows = await this.quotes.find({
      where: { requestId },
      order: { version: 'DESC' },
    });
    return rows.map((row) => this.toDto(row));
  }

  async findById(id: string): Promise<Quote | null> {
    return this.quotes.findOne({ where: { id } });
  }

  /** 供定制申请模块查询：申请关联的订单 */
  async findOrderByRequest(
    requestId: string,
  ): Promise<{ id: string; orderNo: string } | null> {
    const order = await this.orders.findOne({ where: { requestId } });
    return order ? { id: order.id, orderNo: order.orderNo } : null;
  }

  /**
   * 创建报价（生成新版本）。
   * 商品与量体在此刻**冻结**：后续后台改商品不影响本报价与后续订单。
   */
  async create(
    requestId: string,
    dto: QuoteCreateRequest,
    admin: AdminPrincipal,
  ): Promise<QuoteDto> {
    const request = await this.requests.findOne({ where: { id: requestId } });
    if (!request) throw BusinessException.notFound('定制申请不存在');

    // 待报价可创建；已报价的申请也允许「改价重报」——旧版本转 SUPERSEDED，新版本生效
    if (
      request.status !== RequestStatus.PENDING_QUOTE &&
      request.status !== RequestStatus.QUOTED
    ) {
      throw BusinessException.conflict(
        `当前状态 ${REQUEST_STATUS_LABELS[request.status]} 不能创建报价`,
        ERROR_CODES.INVALID_STATUS_TRANSITION,
      );
    }
    if (!Number.isInteger(dto.amountCents) || dto.amountCents <= 0) {
      throw BusinessException.badRequest('报价金额必须为正整数分');
    }
    if (!Number.isInteger(dto.freightCents) || dto.freightCents < 0) {
      throw BusinessException.badRequest('运费必须为非负整数分');
    }
    if (!Number.isInteger(dto.productionDays) || dto.productionDays < 0) {
      throw BusinessException.badRequest('制作周期必须为非负整数天');
    }

    const productSnapshot = await this.products.buildSnapshot(request.productId);
    const measurementSnapshot = request.measurementSnapshot as MeasurementSnapshot;

    const existing = await this.quotes.find({
      where: { requestId },
      order: { version: 'DESC' },
    });
    const version = existing.length === 0 ? 1 : existing[0].version + 1;

    // 旧版本转 SUPERSEDED，同一申请同时只有一个 ACTIVE
    for (const old of existing) {
      if (old.status === QuoteStatus.ACTIVE) {
        old.status = QuoteStatus.SUPERSEDED;
        await this.quotes.save(old);
      }
    }

    const entity = this.quotes.create({
      requestId,
      version,
      status: QuoteStatus.ACTIVE,
      amountCents: dto.amountCents,
      freightCents: dto.freightCents,
      currency: dto.currency ?? 'CNY',
      productionDays: dto.productionDays,
      validUntil: dto.validUntil ? new Date(dto.validUntil) : null,
      note: dto.note ?? null,
      productSnapshot,
      measurementSnapshot,
      createdById: admin.id,
      createdByName: admin.displayName,
    });
    const saved = await this.quotes.save(entity);

    // 申请进入「待顾客确认报价」
    request.status = RequestStatus.QUOTED;
    await this.requests.save(request);

    await this.audit.record({
      actorId: admin.id,
      actorName: admin.displayName,
      actorRole: admin.role,
      action: 'quote.create',
      targetType: 'quote',
      targetId: saved.id,
      after: {
        requestId,
        version: saved.version,
        amountCents: saved.amountCents,
        freightCents: saved.freightCents,
        productionDays: saved.productionDays,
      },
      ip: null,
    });

    return this.toDto(saved);
  }

  async withdraw(id: string, admin: AdminPrincipal): Promise<QuoteDto> {
    const quote = await this.quotes.findOne({ where: { id } });
    if (!quote) throw BusinessException.notFound('报价不存在');
    if (quote.status !== QuoteStatus.ACTIVE) {
      throw BusinessException.conflict('只能撤回当前有效报价', ERROR_CODES.QUOTE_NOT_ACTIVE);
    }
    quote.status = QuoteStatus.WITHDRAWN;
    const saved = await this.quotes.save(quote);

    const request = await this.requests.findOne({ where: { id: quote.requestId } });
    if (request && request.status === RequestStatus.QUOTED) {
      request.status = RequestStatus.PENDING_QUOTE;
      await this.requests.save(request);
    }

    await this.audit.record({
      actorId: admin.id,
      actorName: admin.displayName,
      actorRole: admin.role,
      action: 'quote.withdraw',
      targetType: 'quote',
      targetId: saved.id,
      before: { status: QuoteStatus.ACTIVE },
      after: { status: saved.status },
      ip: null,
    });
    return this.toDto(saved);
  }

  /**
   * 顾客确认报价。后端必须校验：
   * 1. 报价属于该申请；2. 报价是当前有效版本；3. 版本号与顾客看到的一致。
   */
  async confirmByCustomer(
    requestId: string,
    quoteId: string,
    expectedVersion: number,
    customerId: string,
  ): Promise<QuoteDto> {
    const request = await this.requests.findOne({ where: { id: requestId } });
    if (!request || request.customerId !== customerId) {
      throw BusinessException.notFound('定制申请不存在');
    }
    if (request.status !== RequestStatus.QUOTED) {
      throw BusinessException.conflict(
        `当前状态 ${REQUEST_STATUS_LABELS[request.status]} 不能确认报价`,
        ERROR_CODES.INVALID_STATUS_TRANSITION,
      );
    }

    const quote = await this.quotes.findOne({ where: { id: quoteId } });
    if (!quote || quote.requestId !== requestId) {
      throw BusinessException.notFound('报价不存在');
    }
    if (quote.status !== QuoteStatus.ACTIVE) {
      throw BusinessException.conflict(
        '该报价已不是当前有效版本，请刷新后重新确认',
        ERROR_CODES.QUOTE_NOT_ACTIVE,
      );
    }
    if (quote.version !== expectedVersion) {
      throw BusinessException.conflict(
        '报价已更新，请刷新后确认最新版本',
        ERROR_CODES.QUOTE_VERSION_CONFLICT,
      );
    }
    if (quote.validUntil && quote.validUntil.getTime() < Date.now()) {
      throw BusinessException.conflict('报价已过有效期，请联系客服重新报价', ERROR_CODES.QUOTE_NOT_ACTIVE);
    }

    quote.confirmedAt = new Date();
    const saved = await this.quotes.save(quote);

    request.status = RequestStatus.CONFIRMED;
    await this.requests.save(request);

    await this.audit.record({
      actorId: customerId,
      actorName: '顾客',
      actorRole: null,
      action: 'quote.confirm',
      targetType: 'quote',
      targetId: saved.id,
      after: { version: saved.version, amountCents: saved.amountCents },
      ip: null,
    });

    return this.toDto(saved);
  }

  private toDto(quote: Quote): QuoteDto {
    const productSnapshot = quote.productSnapshot as ProductSnapshot;
    return {
      id: quote.id,
      requestId: quote.requestId,
      requestNo: '',
      version: quote.version,
      status: quote.status,
      amountCents: quote.amountCents,
      freightCents: quote.freightCents,
      totalCents: quote.amountCents + quote.freightCents,
      currency: quote.currency,
      productionDays: quote.productionDays,
      validUntil: quote.validUntil ? quote.validUntil.toISOString() : null,
      note: quote.note,
      productSnapshot,
      measurementSnapshot: quote.measurementSnapshot as MeasurementSnapshot,
      createdById: quote.createdById,
      createdByName: quote.createdByName ?? '',
      createdAt: quote.createdAt.toISOString(),
      confirmedAt: quote.confirmedAt ? quote.confirmedAt.toISOString() : null,
    };
  }

  async listAll(query: {
    page?: number;
    pageSize?: number;
  }): Promise<Paginated<QuoteDto>> {
    const page = Math.max(1, Number(query.page ?? 1));
    const pageSize = Math.min(100, Math.max(1, Number(query.pageSize ?? 20)));
    const [rows, total] = await this.quotes.findAndCount({
      order: { createdAt: 'DESC' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
    return { items: rows.map((row) => this.toDto(row)), total, page, pageSize };
  }
}
