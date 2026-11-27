import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  AdminCustomizationRequestListItemDto,
  CustomizationRequestCreateRequest,
  CustomizationRequestDto,
  CustomizationRequestListItemDto,
  CustomizationRequestListQuery,
  CustomerContact,
  ERROR_CODES,
  MeasurementField,
  MeasurementFieldValue,
  MeasurementSection,
  MeasurementSnapshot,
  Paginated,
  ProductSnapshot,
  REQUEST_STATUS_LABELS,
  RequestStatus,
} from '@qinyang/contracts';
import { randomBytes } from 'node:crypto';
import { DataSource, In, Repository, SelectQueryBuilder } from 'typeorm';
import { CustomizationRequest } from '../../database/entities/customization-request.entity';
import { Product } from '../../database/entities/product.entity';
import { ProductStatus, QuoteStatus } from '@qinyang/contracts';
import { BusinessException } from '../../common/errors/business.exception';
import { isDuplicateKey } from '../../common/errors/duplicate-key';
import { AuditService } from '../audit/audit.service';
import { ProductsService } from '../catalog/products.service';
import { TemplatesService } from '../templates/templates.service';
import { QuoteService } from '../quote/quotes.service';
import { Quote } from '../../database/entities/quote.entity';
import type { AdminPrincipal } from '../../common/decorators/current-admin.decorator';
import { maskPhone } from '../../common/mask';
import { buildCsv } from '../../common/csv';
import {
  MeasurementValidationException,
  validateMeasurements,
} from './measurement-validator';

/** 单次导出上限：防止误操作把整库拖成一份大文件 */
const EXPORT_LIMIT = 5000;

/**
 * 允许**人工**设置的申请状态。
 *
 * 由流程派生的状态（报价创建 → QUOTED；顾客确认 → CONFIRMED；
 * 订单推进 → IN_PRODUCTION / SHIPPED / COMPLETED）不允许手工设置，
 * 否则就能绕过顾客确认直接建单。
 */
const MANUAL_REQUEST_STATUSES = new Set<RequestStatus>([
  RequestStatus.PENDING_REVIEW,
  RequestStatus.PENDING_QUOTE,
  RequestStatus.REJECTED,
  RequestStatus.CANCELLED,
]);

@Injectable()
export class CustomizationService {
  constructor(
    @InjectRepository(CustomizationRequest)
    private readonly requests: Repository<CustomizationRequest>,
    @InjectRepository(Product)
    private readonly products: Repository<Product>,
    private readonly productService: ProductsService,
    private readonly templates: TemplatesService,
    private readonly quotes: QuoteService,
    private readonly audit: AuditService,
    private readonly dataSource: DataSource,
  ) {}

  // ───────────────────────── 顾客端 ─────────────────────────

  async create(
    dto: CustomizationRequestCreateRequest,
    customerId: string,
  ): Promise<CustomizationRequestDto> {
    // 幂等：同一 submitId 直接返回既有申请（防重复点击）
    const existing = await this.requests.findOne({ where: { submitId: dto.submitId } });
    if (existing) {
      if (existing.customerId !== customerId) {
        throw BusinessException.conflict('该提交标识已被使用', ERROR_CODES.DUPLICATED_SUBMIT);
      }
      return this.toDto(existing);
    }

    const product = await this.products.findOne({ where: { id: dto.productId } });
    if (!product) throw BusinessException.notFound('商品不存在');
    if (product.status !== ProductStatus.PUBLISHED) {
      throw BusinessException.conflict('商品已下架，无法提交定制申请', ERROR_CODES.PRODUCT_NOT_PUBLISHED);
    }

    // 与顾客端表单同源：都走 resolveForProduct（优先商品绑定模板，再按分类回退）。
    // 两处若不一致，顾客会按 A 模板填表却被按 B 模板校验，直接被拒收。
    const template = await this.templates.resolveForProduct(product);
    if (!template) {
      throw BusinessException.conflict(
        '该商品尚未配置量体模板，请联系客服',
        ERROR_CODES.TEMPLATE_NOT_FOUND,
      );
    }

    const sections = (template.measurementSections ?? []) as MeasurementSection[];
    let validated: MeasurementFieldValue[];
    try {
      validated = validateMeasurements(sections, dto.measurements);
    } catch (error) {
      if (error instanceof MeasurementValidationException) {
        throw BusinessException.badRequest(error.message, error.code);
      }
      throw error;
    }

    const productSnapshot = await this.productService.buildSnapshot(product.id);
    const measurementSnapshot: MeasurementSnapshot = {
      templateId: template.id,
      templateCode: template.code,
      templateName: template.name,
      templateVersion: template.version,
      sections,
      fields: validated,
    };

    const entity = this.requests.create({
      requestNo: this.generateRequestNo(),
      customerId,
      productId: product.id,
      productSnapshot,
      templateId: template.id,
      templateName: template.name,
      templateVersion: template.version,
      measurementSnapshot,
      contact: dto.contact,
      remark: dto.remark ?? null,
      status: RequestStatus.PENDING_REVIEW,
      submitId: dto.submitId,
    });

    let saved: CustomizationRequest;
    try {
      saved = await this.requests.save(entity);
    } catch (error) {
      // 并发提交同一个 submitId 时，唯一索引会让后到者撞 ER_DUP_ENTRY。
      // 意图是「幂等：返回同一条申请」，所以这里回查既有记录而不是报 500。
      if (isDuplicateKey(error)) {
        const existingAfterRace = await this.requests.findOne({
          where: { submitId: dto.submitId },
        });
        if (existingAfterRace) {
          if (existingAfterRace.customerId !== customerId) {
            throw BusinessException.conflict(
              '该提交标识已被使用',
              ERROR_CODES.DUPLICATED_SUBMIT,
            );
          }
          return this.toDto(existingAfterRace);
        }
      }
      throw error;
    }
    return this.toDto(saved);
  }

  async listMine(
    customerId: string,
    query: CustomizationRequestListQuery,
  ): Promise<Paginated<CustomizationRequestListItemDto>> {
    const page = Math.max(1, Number(query.page ?? 1));
    const pageSize = Math.min(100, Math.max(1, Number(query.pageSize ?? 20)));

    const qb = this.requests
      .createQueryBuilder('r')
      .where('r.customerId = :customerId', { customerId });
    if (query.status) {
      qb.andWhere('r.status = :status', { status: query.status });
    }
    qb.orderBy('r.createdAt', 'DESC').skip((page - 1) * pageSize).take(pageSize);

    const [items, total] = await qb.getManyAndCount();
    return {
      items: await this.toListItems(items, (request, quote, order) =>
        this.toListDto(request, quote, order),
      ),
      total,
      page,
      pageSize,
    };
  }

  /** 顾客只能看自己的申请；越权一律 404，不泄露存在性 */
  async getMine(id: string, customerId: string): Promise<CustomizationRequestDto> {
    const request = await this.requests.findOne({ where: { id } });
    if (!request || request.customerId !== customerId) {
      throw BusinessException.notFound('定制申请不存在');
    }
    return this.toDto(request);
  }

  async cancelByCustomer(
    id: string,
    customerId: string,
  ): Promise<CustomizationRequestDto> {
    const request = await this.requests.findOne({ where: { id } });
    if (!request || request.customerId !== customerId) {
      throw BusinessException.notFound('定制申请不存在');
    }
    const allowed = [RequestStatus.PENDING_REVIEW, RequestStatus.PENDING_QUOTE];
    if (!allowed.includes(request.status)) {
      throw BusinessException.conflict(
        '当前状态不能取消，请联系客服处理',
        ERROR_CODES.INVALID_STATUS_TRANSITION,
      );
    }
    const before = { status: request.status };
    /*
     * 只写 status 列的条件更新，绝不整行 save。
     *
     * 此前 `request.status = CANCELLED; save(request)` 是**整行回写**，
     * 而 request 是在事务外读的：期间若店员做了审核（写了审核备注），
     * 顾客这一次取消会把店员的备注覆盖成旧值（陈旧数据回写）。
     * 状态列本身也可能被店员改成别的值，回写等于把别人的动作撤销。
     *
     * 条件更新让数据库裁决：状态已经不是「待审核 / 待报价」时 → 409。
     */
    const affected = await this.requests.update(
      { id: request.id, status: In([RequestStatus.PENDING_REVIEW, RequestStatus.PENDING_QUOTE]) },
      { status: RequestStatus.CANCELLED },
    );
    if (affected.affected !== 1) {
      throw BusinessException.conflict(
        '该申请的状态已被其他操作修改，请刷新后重试',
        ERROR_CODES.INVALID_STATUS_TRANSITION,
      );
    }
    // 本地对象与库内状态对齐（响应里要看到刚写入的状态）
    request.status = RequestStatus.CANCELLED;

    // 取消是顾客侧的关键操作，必须留痕（此前完全没有审计记录）
    await this.audit.record({
      actorId: customerId,
      actorName: '顾客',
      actorRole: null,
      action: 'request.cancel',
      targetType: 'customization_request',
      targetId: request.id,
      before,
      after: { status: RequestStatus.CANCELLED },
      ip: null,
    });

    return this.toDto(request);
  }

  // ───────────────────────── 管理端 ─────────────────────────

  async listAdmin(
    query: CustomizationRequestListQuery,
  ): Promise<Paginated<AdminCustomizationRequestListItemDto>> {
    const page = Math.max(1, Number(query.page ?? 1));
    const pageSize = Math.min(100, Math.max(1, Number(query.pageSize ?? 20)));

    const qb = this.buildAdminQuery(query)
      .orderBy('r.createdAt', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize);

    const [items, total] = await qb.getManyAndCount();
    return {
      items: await this.toListItems(items, (request, quote, order) =>
        this.toAdminListDto(request, quote, order),
      ),
      total,
      page,
      pageSize,
    };
  }

  /** 管理端筛选条件（列表与导出共用，保证「看到的」与「导出的」一致） */
  private buildAdminQuery(query: CustomizationRequestListQuery): SelectQueryBuilder<CustomizationRequest> {
    const qb = this.requests.createQueryBuilder('r');
    if (query.status) qb.andWhere('r.status = :status', { status: query.status });
    if (query.productId) {
      qb.andWhere('r.productId = :productId', { productId: query.productId });
    }
    if (query.keyword) {
      // 商家拿到顾客来电时第一反应是「手机号查一下是哪单」，
      // 此前的关键字只匹配申请编号，等于没得查。
      qb.andWhere(
        `(r.requestNo LIKE :kw
          OR JSON_UNQUOTE(JSON_EXTRACT(r.contact, '$.name')) LIKE :kw
          OR JSON_UNQUOTE(JSON_EXTRACT(r.contact, '$.phone')) LIKE :kw
          OR JSON_UNQUOTE(JSON_EXTRACT(r.productSnapshot, '$.name')) LIKE :kw)`,
        { kw: `%${query.keyword}%` },
      );
    }
    return qb;
  }

  /**
   * 管理端导出 CSV。
   *
   * 导出的是**当前筛选条件下**的单子（与列表所见一致），
   * 手机号仍然脱敏 —— 导出的文件会离开后台，不该带着 20 份完整联系方式。
   * 量体明细也不导出：那是另一份需要商家明确授权的数据。
   */
  async exportAdminCsv(query: CustomizationRequestListQuery): Promise<string> {
    const qb = this.buildAdminQuery(query).orderBy('r.createdAt', 'DESC').take(EXPORT_LIMIT);
    const items = await qb.getMany();
    const listItems = await this.toListItems(items, (request, quote, order) =>
      this.toAdminListDto(request, quote, order),
    );

    const rows = listItems.map((item) => [
      item.requestNo,
      item.customerName,
      item.customerPhoneMasked ?? '',
      item.productName,
      item.productCode,
      `${item.templateName} v${item.templateVersion}`,
      item.statusLabel,
      item.activeQuote ? (item.activeQuote.totalCents / 100).toFixed(2) : '',
      item.orderNo ?? '',
      item.createdAt,
      item.updatedAt,
      item.remark ?? '',
    ]);

    return buildCsv(
      [
        '申请编号',
        '顾客姓名',
        '手机号（脱敏）',
        '商品名称',
        '商品编号',
        '量体模板',
        '状态',
        '当前报价（元）',
        '订单编号',
        '提交时间',
        '更新时间',
        '顾客备注',
      ],
      rows,
    );
  }

  async getAdmin(id: string): Promise<CustomizationRequestDto> {
    const request = await this.requests.findOne({ where: { id } });
    if (!request) throw BusinessException.notFound('定制申请不存在');
    return this.toDto(request);
  }

  /** 审核申请：通过 → 待报价；谢绝 → 已谢绝 */
  async review(
    id: string,
    action: 'APPROVE' | 'REJECT',
    note: string | undefined,
    admin: AdminPrincipal,
  ): Promise<CustomizationRequestDto> {
    const request = await this.requests.findOne({ where: { id } });
    if (!request) throw BusinessException.notFound('定制申请不存在');

    const target =
      action === 'APPROVE' ? RequestStatus.PENDING_QUOTE : RequestStatus.REJECTED;
    if (request.status !== RequestStatus.PENDING_REVIEW) {
      throw BusinessException.conflict(
        `当前状态 ${REQUEST_STATUS_LABELS[request.status]} 不能执行审核`,
        ERROR_CODES.INVALID_STATUS_TRANSITION,
      );
    }

    const before = { status: request.status };
    /*
     * 条件更新（乐观锁）：`WHERE id = ? AND status = ?`
     *
     * 两个店员同时审核同一申请时，两边都会读到「待审核」并都通过状态检查，
     * 随后各自 save —— 后写的会把先写的覆盖掉，
     * 而先写的那次审核备注（"缺胸围"之类）会被静默丢失。
     *
     * 由数据库裁决：affected !== 1 说明状态已被别人改过 → 409。
     */
    const affected = await this.requests.update(
      { id: request.id, status: request.status },
      { status: target, ...(note ? { remark: note } : {}) },
    );
    if (affected.affected !== 1) {
      throw BusinessException.conflict(
        '该申请的状态已被其他操作修改，请刷新后重试',
        ERROR_CODES.INVALID_STATUS_TRANSITION,
      );
    }
    const saved = await this.requests.findOne({ where: { id: request.id } });
    if (!saved) throw BusinessException.notFound('定制申请不存在');

    await this.audit.record({
      actorId: admin.id,
      actorName: admin.displayName,
      actorRole: admin.role,
      action: `request.review.${action.toLowerCase()}`,
      targetType: 'customization_request',
      targetId: saved.id,
      before,
      // 审计记录的是**本次操作的结果**，不是回读到的当前状态：
      // 回读可能读到别人刚改的状态，那样审计就记了一个谁都没设置过的状态。
      after: { status: target },
      ip: null,
    });

    return this.toDto(saved);
  }

  async changeStatus(
    id: string,
    target: RequestStatus,
    note: string | undefined,
    admin: AdminPrincipal,
  ): Promise<CustomizationRequestDto> {
    const request = await this.requests.findOne({ where: { id } });
    if (!request) throw BusinessException.notFound('定制申请不存在');

    /*
     * 只允许人工设置「人工确实需要做」的状态。
     *
     * QUOTED 由报价创建产生、CONFIRMED 由**顾客确认报价**产生，
     * IN_PRODUCTION / SHIPPED / COMPLETED 由订单流程产生。
     * 此前这个接口没有角色限制（连店员都能调），于是店员可以：
     *   建一个报价 → 把申请直接改成 CONFIRMED → 建单，
     * 整套流程**完全绕过顾客确认**，顾客从未同意却有了订单。
     *
     * 因此这里只开放「退回 / 谢绝 / 取消」这类人工动作，
     * 其余状态只能由报价与订单流程自己产生。
     */
    if (!MANUAL_REQUEST_STATUSES.has(target)) {
      throw BusinessException.conflict(
        `「${REQUEST_STATUS_LABELS[target]}」不能手工设置，只能由报价或订单流程产生`,
        ERROR_CODES.INVALID_STATUS_TRANSITION,
      );
    }

    const allowed = this.allowedTransitions(request.status, target);
    if (!allowed) {
      throw BusinessException.conflict(
        `不允许从 ${REQUEST_STATUS_LABELS[request.status]} 变更为 ${REQUEST_STATUS_LABELS[target]}`,
        ERROR_CODES.INVALID_STATUS_TRANSITION,
      );
    }

    /*
     * 已生成订单的申请，不能从申请侧取消。
     *
     * 订单取消是店主专属接口（POST /admin/orders/:id/cancel），
     * 而申请侧的取消此前对店员也开放 —— 于是店员可以把申请改成「已取消」，
     * 订单却仍是「待制作」：申请显示已取消、订单还在生产队列里，状态分裂。
     *
     * 这里选**拒绝**而不是「顺手把订单也取消掉」：
     * 订单取消要写订单事件、要填取消原因、还涉及退款口径，
     * 由订单接口统一处理才有一致的审计与事件流水；
     * 申请侧偷偷取消订单会让订单事件里出现一次没有原因的取消。
     */
    if (target === RequestStatus.CANCELLED) {
      const order = await this.quotes.findOrderByRequest(request.id);
      if (order) {
        throw BusinessException.conflict(
          '该申请已生成订单，请在订单页操作',
          ERROR_CODES.INVALID_STATUS_TRANSITION,
        );
      }
    }

    const before = { status: request.status };
    /*
     * 状态变更与报价联动必须同事务。
     *
     * 退回「待报价」时，该申请下的**有效报价**必须一并撤回：
     * 否则顾客端仍显示「当前有效报价」，却又因为申请不是「已报价」而无法确认 ——
     * 顾客走进死结，店员看到的价格也还是上一版。
     *
     * 锁顺序统一为「先报价、后申请」，与报价创建 / 确认 / 撤回保持一致，
     * 避免两条路径交叉持锁形成死锁。
     */
    let withdrawnQuotes = 0;
    const saved = await this.dataSource.transaction(async (manager) => {
      const requestRepo = manager.getRepository(CustomizationRequest);
      const quoteRepo = manager.getRepository(Quote);

      if (target === RequestStatus.PENDING_QUOTE) {
        const withdrawn = await quoteRepo.update(
          { requestId: request.id, status: QuoteStatus.ACTIVE },
          { status: QuoteStatus.WITHDRAWN },
        );
        withdrawnQuotes = withdrawn.affected ?? 0;
      }

      // 同上：条件更新（乐观锁），affected !== 1 → 409
      const affected = await requestRepo.update(
        { id: request.id, status: request.status },
        { status: target, ...(note ? { remark: note } : {}) },
      );
      if (affected.affected !== 1) {
        throw BusinessException.conflict(
          '该申请的状态已被其他操作修改，请刷新后重试',
          ERROR_CODES.INVALID_STATUS_TRANSITION,
        );
      }
      const updated = await requestRepo.findOne({ where: { id: request.id } });
      if (!updated) throw BusinessException.notFound('定制申请不存在');
      return updated;
    });

    await this.audit.record({
      actorId: admin.id,
      actorName: admin.displayName,
      actorRole: admin.role,
      action: `request.status.${target.toLowerCase()}`,
      targetType: 'customization_request',
      targetId: saved.id,
      before,
      // 审计记录的是**本次操作的结果**，不是回读到的当前状态
      after: { status: target, ...(withdrawnQuotes > 0 ? { withdrawnQuotes } : {}) },
      ip: null,
    });

    return this.toDto(saved);
  }

  // ───────────────────────── 内部实现 ─────────────────────────

  private allowedTransitions(from: RequestStatus, to: RequestStatus): boolean {
    const map: Record<RequestStatus, RequestStatus[]> = {
      [RequestStatus.PENDING_REVIEW]: [
        RequestStatus.PENDING_QUOTE,
        RequestStatus.REJECTED,
        RequestStatus.CANCELLED,
      ],
      [RequestStatus.PENDING_QUOTE]: [RequestStatus.QUOTED, RequestStatus.CANCELLED],
      [RequestStatus.QUOTED]: [
        RequestStatus.CONFIRMED,
        RequestStatus.PENDING_QUOTE,
        RequestStatus.CANCELLED,
      ],
      [RequestStatus.CONFIRMED]: [RequestStatus.IN_PRODUCTION, RequestStatus.CANCELLED],
      [RequestStatus.IN_PRODUCTION]: [RequestStatus.SHIPPED, RequestStatus.CANCELLED],
      [RequestStatus.SHIPPED]: [RequestStatus.COMPLETED],
      [RequestStatus.COMPLETED]: [],
      [RequestStatus.CANCELLED]: [],
      [RequestStatus.REJECTED]: [],
    };
    return map[from]?.includes(to) ?? false;
  }

  private generateRequestNo(): string {
    const now = new Date();
    const stamp =
      `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(
        now.getDate(),
      ).padStart(2, '0')}`;
    return `QR-${stamp}-${randomBytes(3).toString('hex').toUpperCase()}`;
  }

  /**
   * 列表项组装：批量预取有效报价与关联订单，避免逐行查询（N+1）。
   */
  private async toListItems<T extends CustomizationRequestListItemDto>(
    items: CustomizationRequest[],
    toDto: (
      request: CustomizationRequest,
      quote: Quote | null,
      order: { id: string; orderNo: string } | null,
    ) => T,
  ): Promise<T[]> {
    if (items.length === 0) {
      return [];
    }
    const ids = items.map((item) => item.id);
    const [quoteMap, orderMap] = await Promise.all([
      this.quotes.findActiveByRequestIds(ids),
      this.quotes.findOrdersByRequestIds(ids),
    ]);
    return items.map((item) =>
      toDto(item, quoteMap.get(item.id) ?? null, orderMap.get(item.id) ?? null),
    );
  }

  /**
   * 管理端列表项 DTO：在摘要之上补上「是谁的申请」。
   *
   * 姓名给全（商家要靠它区分顾客），手机号只给脱敏结果 ——
   * 完整联系方式仍然只在详情接口返回，避免一页 20 条一次性拉出 20 份手机号地址。
   */
  private toAdminListDto(
    request: CustomizationRequest,
    activeQuote: Quote | null,
    order: { id: string; orderNo: string } | null,
  ): AdminCustomizationRequestListItemDto {
    const contact = (request.contact ?? {}) as Partial<CustomerContact>;
    return {
      ...this.toListDto(request, activeQuote, order),
      customerName: contact.name ?? '',
      customerPhoneMasked: maskPhone(contact.phone),
    };
  }

  /**
   * 列表项 DTO：**不含量体明细与联系方式**。
   * 这两项只在详情接口返回——列表页批量带出会同时放大响应体
   * （一页 20 条 ≈ 7 KB/条）与敏感数据暴露面。
   */
  private toListDto(
    request: CustomizationRequest,
    activeQuote: Quote | null,
    order: { id: string; orderNo: string } | null,
  ): CustomizationRequestListItemDto {
    const snapshot = (request.productSnapshot ?? {}) as Partial<ProductSnapshot>;
    return {
      id: request.id,
      requestNo: request.requestNo,
      customerId: request.customerId,
      productId: request.productId,
      productCode: snapshot.code ?? '',
      productName: snapshot.name ?? '',
      productCoverUrl: snapshot.coverUrl ?? null,
      templateId: request.templateId,
      templateName: request.templateName,
      templateVersion: request.templateVersion,
      status: request.status,
      statusLabel: REQUEST_STATUS_LABELS[request.status],
      remark: request.remark,
      activeQuote: activeQuote ? this.quotes.toSummaryDto(activeQuote) : null,
      orderId: order?.id ?? null,
      orderNo: order?.orderNo ?? null,
      createdAt: request.createdAt.toISOString(),
      updatedAt: request.updatedAt.toISOString(),
    };
  }

  private async toDto(
    request: CustomizationRequest,
  ): Promise<CustomizationRequestDto> {
    const snapshot = (request.productSnapshot ?? {}) as Partial<ProductSnapshot>;
    const activeQuote = await this.quotes.findActiveByRequest(request.id);
    const order = await this.quotes.findOrderByRequest(request.id);

    return {
      id: request.id,
      requestNo: request.requestNo,
      customerId: request.customerId,
      productId: request.productId,
      productCode: snapshot.code ?? '',
      productName: snapshot.name ?? '',
      productCoverUrl: snapshot.coverUrl ?? null,
      templateId: request.templateId,
      templateName: request.templateName,
      templateVersion: request.templateVersion,
      status: request.status,
      statusLabel: REQUEST_STATUS_LABELS[request.status],
      measurements: request.measurementSnapshot as MeasurementSnapshot,
      contact: request.contact as never,
      remark: request.remark,
      activeQuote,
      orderId: order?.id ?? null,
      orderNo: order?.orderNo ?? null,
      createdAt: request.createdAt.toISOString(),
      updatedAt: request.updatedAt.toISOString(),
    };
  }

  /** 批量取商品，供管理端列表展示（避免 N+1） */
  async findProductsByIds(ids: string[]): Promise<Product[]> {
    if (ids.length === 0) return [];
    return this.products.find({ where: { id: In(ids) } });
  }
}
