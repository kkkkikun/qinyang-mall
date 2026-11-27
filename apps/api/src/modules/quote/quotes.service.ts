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
  QuoteSummaryDto,
  REQUEST_STATUS_LABELS,
  RequestStatus,
} from '@qinyang/contracts';
import { DataSource, EntityManager, In, IsNull, Repository } from 'typeorm';
import { CustomizationRequest } from '../../database/entities/customization-request.entity';
import { Order } from '../../database/entities/order.entity';
import { Quote } from '../../database/entities/quote.entity';
import { BusinessException } from '../../common/errors/business.exception';
import { isDuplicateKey } from '../../common/errors/duplicate-key';
import { AuditService } from '../audit/audit.service';
import { ProductsService } from '../catalog/products.service';
import type { AdminPrincipal } from '../../common/decorators/current-admin.decorator';

/** 允许店员撤回报价的申请状态：顾客尚未确认，才可以收回重新报价 */
const WITHDRAWABLE_REQUEST_STATUS: RequestStatus[] = [
  RequestStatus.PENDING_REVIEW,
  RequestStatus.PENDING_QUOTE,
  RequestStatus.QUOTED,
];

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
    private readonly dataSource: DataSource,
  ) {}

  /** 该申请当前有效报价 */
  async findActiveByRequest(requestId: string): Promise<QuoteDto | null> {
    const quote = await this.quotes.findOne({
      where: { requestId, status: QuoteStatus.ACTIVE },
      order: { version: 'DESC' },
    });
    return quote ? this.toDto(quote) : null;
  }

  /**
   * 批量取这些申请当前的有效报价（列表用）。
   *
   * 此前列表对每一行各查一次有效报价与一次关联订单，
   * 一页 20 条 = 40 次额外查询（N+1）；这里压成 2 次。
   */
  async findActiveByRequestIds(requestIds: string[]): Promise<Map<string, Quote>> {
    const map = new Map<string, Quote>();
    if (requestIds.length === 0) {
      return map;
    }
    const rows = await this.quotes.find({
      where: { requestId: In(requestIds), status: QuoteStatus.ACTIVE },
      order: { version: 'DESC' },
    });
    for (const row of rows) {
      // version 倒序：同一申请只保留最新的一条有效报价
      if (!map.has(row.requestId)) {
        map.set(row.requestId, row);
      }
    }
    return map;
  }

  /** 批量取这些申请关联的订单（列表用），避免逐行查询 */
  async findOrdersByRequestIds(
    requestIds: string[],
  ): Promise<Map<string, { id: string; orderNo: string }>> {
    const map = new Map<string, { id: string; orderNo: string }>();
    if (requestIds.length === 0) {
      return map;
    }
    const rows = await this.orders.find({ where: { requestId: In(requestIds) } });
    for (const row of rows) {
      map.set(row.requestId, { id: row.id, orderNo: row.orderNo });
    }
    return map;
  }

  /** 列表用的精简报价映射：不含报价时冻结的商品与量体快照 */
  toSummaryDto(quote: Quote): QuoteSummaryDto {
    return {
      id: quote.id,
      requestId: quote.requestId,
      version: quote.version,
      status: quote.status,
      amountCents: quote.amountCents,
      freightCents: quote.freightCents,
      totalCents: quote.amountCents + quote.freightCents,
      currency: quote.currency,
      productionDays: quote.productionDays,
      validUntil: quote.validUntil ? quote.validUntil.toISOString() : null,
      createdByName: quote.createdByName ?? '',
      createdAt: quote.createdAt.toISOString(),
      confirmedAt: quote.confirmedAt ? quote.confirmedAt.toISOString() : null,
    };
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

    /*
     * 「旧版本转 SUPERSEDED + 插入新版本」必须在同一事务里。
     *
     * 并发场景（此前完全没有防护）：
     * 两个店员同时点「创建报价」，两��都会读到同一批旧版本、算出同一个版本号，
     * 结果同一申请出现**两条 ACTIVE 报价**——顾客端会看到两份「当前报价」，
     * 商家自己也会困惑到底哪份有效。
     *
     * 现在由数据库兜底：
     * - UQ_quotes_requestId_version：同申请同版本只能有一条；
     * - UQ_quotes_activeRequestId（生成列）：同申请同时只能有一条 ACTIVE。
     * 并发时后者必然撞唯一索引，这里翻译成 409 而不是 500。
     */
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
    let saved: Quote;
    try {
      saved = await this.dataSource.transaction(async (manager) => {
        const quoteRepo = manager.getRepository(Quote);
        const requestRepo = manager.getRepository(CustomizationRequest);

        // 旧版本转 SUPERSEDED，同一申请同时只有一个 ACTIVE
        for (const oldQuote of existing) {
          if (oldQuote.status === QuoteStatus.ACTIVE) {
            oldQuote.status = QuoteStatus.SUPERSEDED;
            await quoteRepo.save(oldQuote);
          }
        }

        const created = await quoteRepo.save(entity);

        // 申请进入「待顾客确认报价」
        request.status = RequestStatus.QUOTED;
        await requestRepo.save(request);
        return created;
      });
    } catch (error) {
      if (isDuplicateKey(error)) {
        throw BusinessException.conflict(
          '该申请刚刚已有新的报价版本，请刷新后重试',
          ERROR_CODES.QUOTE_VERSION_CONFLICT,
        );
      }
      throw error;
    }

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

  /**
   * 撤回报价。
   *
   * 顾客确认报价后申请即为 CONFIRMED，此时再撤回会造成「状态是已确认、
   * 但顾客侧显示商家尚未报价」的自相矛盾（审计 P0-7）。
   * 因此已确认及之后的申请不允许撤回，只能走取消/改单流程。
   */
  async withdraw(id: string, admin: AdminPrincipal): Promise<QuoteDto> {
    const quote = await this.quotes.findOne({ where: { id } });
    if (!quote) throw BusinessException.notFound('报价不存在');
    if (quote.status !== QuoteStatus.ACTIVE) {
      throw BusinessException.conflict('只能撤回当前有效报价', ERROR_CODES.QUOTE_NOT_ACTIVE);
    }
    // 顾客已确认的申请不能再撤回报价：
    // 撤回后申请仍是「已确认」，顾客侧却显示「商家尚未报价」，前后自相矛盾。
    const owner = await this.requests.findOne({ where: { id: quote.requestId } });
    if (owner && !WITHDRAWABLE_REQUEST_STATUS.includes(owner.status)) {
      throw BusinessException.conflict(
        `申请当前为「${REQUEST_STATUS_LABELS[owner.status]}」，报价不可撤回，请走取消或改单流程`,
        ERROR_CODES.INVALID_STATUS_TRANSITION,
      );
    }
    // 撤回报价与申请回退同事务
    const saved = await this.dataSource.transaction(async (manager) => {
      const quoteRepo = manager.getRepository(Quote);
      const requestRepo = manager.getRepository(CustomizationRequest);

      // 条件更新：已被顾客确认/拒绝/撤回的报价不能再次撤回
      const affected = await quoteRepo.update(
        { id: quote.id, status: QuoteStatus.ACTIVE },
        { status: QuoteStatus.WITHDRAWN },
      );
      if (affected.affected !== 1) {
        throw BusinessException.conflict(
          '只能撤回当前有效报价',
          ERROR_CODES.QUOTE_NOT_ACTIVE,
        );
      }

      const request = await requestRepo.findOne({ where: { id: quote.requestId } });
      if (request && request.status === RequestStatus.QUOTED) {
        request.status = RequestStatus.PENDING_QUOTE;
        await requestRepo.save(request);
      }
      const updated = await quoteRepo.findOne({ where: { id: quote.id } });
      if (!updated) throw BusinessException.notFound('报价不存在');
      return updated;
    });

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
   * 顾客拒绝报价：报价置 REJECTED，申请回到待报价，等待店员重新报价。
   *
   * 需求要求「顾客确认或拒绝报价」，此前只有确认 —— 顾客嫌贵就走进死路，
   * 只能另行联系客服，而后台又没有「退回重新报价」的入口。
   */
  async rejectByCustomer(
    requestId: string,
    quoteId: string,
    expectedVersion: number,
    customerId: string,
    reason?: string | null,
  ): Promise<QuoteDto> {
    const request = await this.requests.findOne({ where: { id: requestId } });
    if (!request || request.customerId !== customerId) {
      throw BusinessException.notFound('定制申请不存在');
    }
    if (request.status !== RequestStatus.QUOTED) {
      throw BusinessException.conflict(
        `当前状态 ${REQUEST_STATUS_LABELS[request.status]} 不能拒绝报价`,
        ERROR_CODES.INVALID_STATUS_TRANSITION,
      );
    }

    const quote = await this.quotes.findOne({ where: { id: quoteId } });
    if (!quote || quote.requestId !== requestId) {
      throw BusinessException.notFound('报价不存在');
    }
    if (quote.status !== QuoteStatus.ACTIVE) {
      throw BusinessException.conflict(
        '该报价已不是当前有效版本，请刷新后重试',
        ERROR_CODES.QUOTE_NOT_ACTIVE,
      );
    }
    if (quote.version !== expectedVersion) {
      throw BusinessException.conflict(
        '报价已更新，请刷新后重试',
        ERROR_CODES.QUOTE_VERSION_CONFLICT,
      );
    }

    /*
     * 条件更新（乐观锁）：只有「仍是 ACTIVE」的那次请求才算数。
     *
     * 此前是「先读后写」：两个顾客端（或顾客与客服）同时点确认/拒绝，
     * 两次都能通过前面的状态校验，最后都写成功 —— 报价被确认的同时又被拒绝。
     * 用带条件的 UPDATE 让数据库裁决：后到者 affected = 0，直接 409。
     */
    const saved = await this.dataSource.transaction(async (manager) => {
      const quoteRepo = manager.getRepository(Quote);
      const requestRepo = manager.getRepository(CustomizationRequest);

      const affected = await quoteRepo.update(
        { id: quote.id, status: QuoteStatus.ACTIVE },
        { status: QuoteStatus.REJECTED },
      );
      if (affected.affected !== 1) {
        throw BusinessException.conflict(
          '该报价状态已变化，请刷新后重试',
          ERROR_CODES.QUOTE_NOT_ACTIVE,
        );
      }

      // 回到待报价：量体资料与顾客信息都保留，店员可基于反馈重新报价
      request.status = RequestStatus.PENDING_QUOTE;
      await requestRepo.save(request);
      const updated = await quoteRepo.findOne({ where: { id: quote.id } });
      if (!updated) throw BusinessException.notFound('报价不存在');
      return updated;
    });

    await this.audit.record({
      actorId: customerId,
      actorName: '顾客',
      actorRole: null,
      action: 'quote.reject',
      targetType: 'quote',
      targetId: saved.id,
      before: { status: QuoteStatus.ACTIVE, requestStatus: RequestStatus.QUOTED },
      after: { status: QuoteStatus.REJECTED, requestStatus: RequestStatus.PENDING_QUOTE },
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

    // 确认报价与申请转「已确认」必须同事务：
    // 否则可能出现「报价已确认、申请仍在待确认」——顾客以为确认了，商家却看不到已确认的申请。
    const saved = await this.dataSource.transaction(async (manager) => {
      const quoteRepo = manager.getRepository(Quote);
      const requestRepo = manager.getRepository(CustomizationRequest);

      // 条件更新：只有仍未被确认（confirmedAt 为空）的报价才能被确认，
      // 第二个并发请求会拿到 affected = 0 → 409，而不是把状态覆盖掉。
      const affected = await quoteRepo.update(
        { id: quote.id, status: QuoteStatus.ACTIVE, confirmedAt: IsNull() },
        { confirmedAt: new Date() },
      );
      if (affected.affected !== 1) {
        throw BusinessException.conflict(
          '该报价已被处理，请刷新后重试',
          ERROR_CODES.QUOTE_VERSION_CONFLICT,
        );
      }

      request.status = RequestStatus.CONFIRMED;
      await requestRepo.save(request);
      const updated = await quoteRepo.findOne({ where: { id: quote.id } });
      if (!updated) throw BusinessException.notFound('报价不存在');
      return updated;
    });

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
