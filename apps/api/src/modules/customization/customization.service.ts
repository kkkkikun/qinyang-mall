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
import { In, Repository, SelectQueryBuilder } from 'typeorm';
import { CustomizationRequest } from '../../database/entities/customization-request.entity';
import { Product } from '../../database/entities/product.entity';
import { ProductStatus } from '@qinyang/contracts';
import { BusinessException } from '../../common/errors/business.exception';
import { isDuplicateKey } from '../../common/errors/duplicate-key';
import { AuditService } from '../audit/audit.service';
import { ProductsService } from '../catalog/products.service';
import { TemplatesService } from '../templates/templates.service';
import { QuoteService } from '../quote/quotes.service';
import type { Quote } from '../../database/entities/quote.entity';
import type { AdminPrincipal } from '../../common/decorators/current-admin.decorator';
import { maskPhone } from '../../common/mask';
import { buildCsv } from '../../common/csv';
import {
  MeasurementValidationException,
  validateMeasurements,
} from './measurement-validator';

/** 单次导出上限：防止误操作把整库拖成一份大文件 */
const EXPORT_LIMIT = 5000;

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
    request.status = RequestStatus.CANCELLED;
    const saved = await this.requests.save(request);

    // 取消是顾客侧的关键操作，必须留痕（此前完全没有审计记录）
    await this.audit.record({
      actorId: customerId,
      actorName: '顾客',
      actorRole: null,
      action: 'request.cancel',
      targetType: 'customization_request',
      targetId: saved.id,
      before,
      after: { status: saved.status },
      ip: null,
    });

    return this.toDto(saved);
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
    request.status = target;
    const saved = await this.requests.save(request);

    await this.audit.record({
      actorId: admin.id,
      actorName: admin.displayName,
      actorRole: admin.role,
      action: `request.review.${action.toLowerCase()}`,
      targetType: 'customization_request',
      targetId: saved.id,
      before,
      after: { status: saved.status },
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

    const allowed = this.allowedTransitions(request.status, target);
    if (!allowed) {
      throw BusinessException.conflict(
        `不允许从 ${REQUEST_STATUS_LABELS[request.status]} 变更为 ${REQUEST_STATUS_LABELS[target]}`,
        ERROR_CODES.INVALID_STATUS_TRANSITION,
      );
    }

    const before = { status: request.status };
    request.status = target;
    const saved = await this.requests.save(request);

    await this.audit.record({
      actorId: admin.id,
      actorName: admin.displayName,
      actorRole: admin.role,
      action: `request.status.${target.toLowerCase()}`,
      targetType: 'customization_request',
      targetId: saved.id,
      before,
      after: { status: saved.status },
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
