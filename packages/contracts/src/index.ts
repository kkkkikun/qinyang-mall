/**
 * 琴扬精纺羊绒 QINYANG · 商城 V1 共享契约
 *
 * 约束：
 * 1. 本文件为纯类型 + 常量枚举，不引入任何运行时依赖，可被微信开发者工具直接编译。
 * 2. 金额一律使用整数分（`*Cents`），禁止浮点。
 * 3. 业务状态机常量集中在此，API、管理后台、小程序三端共用。
 */

// ────────────────────────────── 枚举 ──────────────────────────────

/** 商品状态：DRAFT 草稿 → PENDING_REVIEW 待审核 → PUBLISHED 已发布 ⇄ OFFLINE 已下架 */
export enum ProductStatus {
  DRAFT = 'DRAFT',
  PENDING_REVIEW = 'PENDING_REVIEW',
  PUBLISHED = 'PUBLISHED',
  OFFLINE = 'OFFLINE',
}

/** 报价模式：QUOTE_ONLY 仅按量体报价（默认）；FIXED_PRICE 固定价可直售 */
export enum PricingMode {
  QUOTE_ONLY = 'QUOTE_ONLY',
  FIXED_PRICE = 'FIXED_PRICE',
}

/**
 * 定制申请状态机
 * PENDING_REVIEW → PENDING_QUOTE → QUOTED → CONFIRMED → IN_PRODUCTION → SHIPPED → COMPLETED
 * 任意未完成阶段可进入 CANCELLED；PENDING_REVIEW 可进入 REJECTED；QUOTED 可回到 PENDING_QUOTE（重新报价）。
 */
export enum RequestStatus {
  PENDING_REVIEW = 'PENDING_REVIEW',
  PENDING_QUOTE = 'PENDING_QUOTE',
  QUOTED = 'QUOTED',
  CONFIRMED = 'CONFIRMED',
  IN_PRODUCTION = 'IN_PRODUCTION',
  SHIPPED = 'SHIPPED',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
  REJECTED = 'REJECTED',
}

/** 订单状态：CONFIRMED 起于顾客确认报价 */
export enum OrderStatus {
  CONFIRMED = 'CONFIRMED',
  IN_PRODUCTION = 'IN_PRODUCTION',
  SHIPPED = 'SHIPPED',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

/** 报价版本状态：同一申请同时只有一个 ACTIVE 版本 */
export enum QuoteStatus {
  ACTIVE = 'ACTIVE',
  SUPERSEDED = 'SUPERSEDED',
  WITHDRAWN = 'WITHDRAWN',
  /** 顾客明确表示不接受该版本报价（申请回到待报价，等待店员重新报价） */
  REJECTED = 'REJECTED',
}

/** 管理员角色：店主可做全部关键操作；店员仅限日常操作 */
export enum AdminRole {
  OWNER = 'OWNER',
  STAFF = 'STAFF',
}

/** 图片角色 */
export enum MediaRole {
  COVER = 'COVER',
  FRONT = 'FRONT',
  BACK = 'BACK',
  DETAIL = 'DETAIL',
  FABRIC = 'FABRIC',
  MODEL = 'MODEL',
  FLATLAY = 'FLATLAY',
  SIZE_CHART = 'SIZE_CHART',
  DESCRIPTION = 'DESCRIPTION',
  OTHER = 'OTHER',
}

/** 量体测量类型：body 身体测量 / garment_flat 合身衣物平铺测量 */
export enum MeasurementType {
  BODY = 'body',
  GARMENT_FLAT = 'garment_flat',
}

/** 模板状态 */
export enum TemplateStatus {
  DRAFT = 'DRAFT',
  ACTIVE = 'ACTIVE',
  ARCHIVED = 'ARCHIVED',
}

/** 支付网关状态。V1 不启用真实支付，仅记录占位状态。 */
export enum PaymentStatus {
  NOT_REQUIRED = 'NOT_REQUIRED',
  DISABLED = 'DISABLED',
  PENDING = 'PENDING',
  PAID = 'PAID',
  REFUNDED = 'REFUNDED',
}

/** 支付网关标识 */
export enum PaymentProvider {
  DISABLED = 'DISABLED',
  WECHAT = 'WECHAT',
}

// ──────────────────────────── 状态机定义 ────────────────────────────

/** 定制申请合法状态迁移表 */
export const REQUEST_STATUS_TRANSITIONS: Record<RequestStatus, RequestStatus[]> = {
  [RequestStatus.PENDING_REVIEW]: [
    RequestStatus.PENDING_QUOTE,
    RequestStatus.REJECTED,
    RequestStatus.CANCELLED,
  ],
  [RequestStatus.PENDING_QUOTE]: [
    RequestStatus.QUOTED,
    RequestStatus.CANCELLED,
  ],
  [RequestStatus.QUOTED]: [
    RequestStatus.CONFIRMED,
    RequestStatus.PENDING_QUOTE,
    RequestStatus.CANCELLED,
  ],
  [RequestStatus.CONFIRMED]: [
    RequestStatus.IN_PRODUCTION,
    RequestStatus.CANCELLED,
  ],
  [RequestStatus.IN_PRODUCTION]: [
    RequestStatus.SHIPPED,
    RequestStatus.CANCELLED,
  ],
  [RequestStatus.SHIPPED]: [RequestStatus.COMPLETED],
  [RequestStatus.COMPLETED]: [],
  [RequestStatus.CANCELLED]: [],
  [RequestStatus.REJECTED]: [],
};

/** 订单合法状态迁移表 */
export const ORDER_STATUS_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  [OrderStatus.CONFIRMED]: [
    OrderStatus.IN_PRODUCTION,
    OrderStatus.CANCELLED,
  ],
  [OrderStatus.IN_PRODUCTION]: [
    OrderStatus.SHIPPED,
    OrderStatus.CANCELLED,
  ],
  [OrderStatus.SHIPPED]: [OrderStatus.COMPLETED],
  [OrderStatus.COMPLETED]: [],
  [OrderStatus.CANCELLED]: [],
};

/** 顾客侧可见的申请状态文案（小程序与后台共用） */
export const REQUEST_STATUS_LABELS: Record<RequestStatus, string> = {
  [RequestStatus.PENDING_REVIEW]: '待审核',
  [RequestStatus.PENDING_QUOTE]: '待报价',
  [RequestStatus.QUOTED]: '待确认报价',
  [RequestStatus.CONFIRMED]: '已确认',
  [RequestStatus.IN_PRODUCTION]: '制作中',
  [RequestStatus.SHIPPED]: '已发货',
  [RequestStatus.COMPLETED]: '已完成',
  [RequestStatus.CANCELLED]: '已取消',
  [RequestStatus.REJECTED]: '已谢绝',
};

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  [OrderStatus.CONFIRMED]: '待制作',
  [OrderStatus.IN_PRODUCTION]: '制作中',
  [OrderStatus.SHIPPED]: '已发货',
  [OrderStatus.COMPLETED]: '已完成',
  [OrderStatus.CANCELLED]: '已取消',
};

export const PRODUCT_STATUS_LABELS: Record<ProductStatus, string> = {
  [ProductStatus.DRAFT]: '草稿',
  [ProductStatus.PENDING_REVIEW]: '待审核',
  [ProductStatus.PUBLISHED]: '已发布',
  [ProductStatus.OFFLINE]: '已下架',
};

// ──────────────────────────── 通用结构 ────────────────────────────

/** 统一响应包装 */
export interface ApiResponse<T> {
  code: number;
  message: string;
  data: T;
  requestId?: string;
}

/** 分页结果 */
export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

/** 分页请求参数 */
export interface PageQuery {
  page?: number;
  pageSize?: number;
}

// ──────────────────────────── 认证 ────────────────────────────

export interface AdminUser {
  id: string;
  username: string;
  displayName: string;
  role: AdminRole;
  status: 'ACTIVE' | 'DISABLED';
  createdAt: string;
  updatedAt: string;
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface LoginResponse {
  token: string;
  expiresIn: number;
  user: AdminUser;
}

export interface CustomerProfile {
  id: string;
  nickname: string;
  phoneMasked?: string;
  createdAt: string;
}

// ──────────────────────────── 分类 ────────────────────────────

export interface CategoryDto {
  id: string;
  code: string;
  name: string;
  parentId: string | null;
  level: number;
  sortOrder: number;
  status: 'ACTIVE' | 'DISABLED';
  productCount?: number;
  children?: CategoryDto[];
}

export interface CategoryUpsertRequest {
  code: string;
  name: string;
  parentId?: string | null;
  sortOrder?: number;
  status?: 'ACTIVE' | 'DISABLED';
}

// ──────────────────────────── 媒体 ────────────────────────────

export interface MediaDto {
  id: string;
  storageKey: string;
  url: string;
  /**
   * 列表用缩略图地址（600×600）。
   * 与 `url` 同目录同 basename，由详情图地址按命名约定推导；
   * 后台上传的素材没有变体时为 null，前端回退用 `url`。
   */
  thumbUrl?: string | null;
  role: MediaRole;
  width: number;
  height: number;
  bytes: number;
  sortOrder: number;
  productId?: string | null;
  alt?: string | null;
}

// ──────────────────────────── 商品 ────────────────────────────

export interface ProductListItem {
  id: string;
  code: string;
  name: string;
  subtitle?: string | null;
  categoryId: string;
  categoryName: string;
  status: ProductStatus;
  pricingMode: PricingMode;
  /** FIXED_PRICE 且已确认价格时返回整数分；否则为 null，前端显示「待报价」 */
  priceCents: number | null;
  coverUrl: string | null;
  /** 列表卡片用缩略图地址（600×600）；没有变体时为 null，前端回退用 coverUrl */
  coverThumbUrl?: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface ProductDetail extends ProductListItem {
  material?: string | null;
  description?: string | null;
  careGuide?: string | null;
  measurementTemplateId?: string | null;
  measurementTemplateName?: string | null;
  media: MediaDto[];
  reviewStatus: ProductStatus;
  publishedAt?: string | null;
}

export interface ProductUpsertRequest {
  code: string;
  name: string;
  subtitle?: string | null;
  categoryId: string;
  pricingMode: PricingMode;
  priceCents?: number | null;
  material?: string | null;
  description?: string | null;
  careGuide?: string | null;
  measurementTemplateId?: string | null;
  sortOrder?: number;
  status?: ProductStatus;
}

export interface ProductMediaUpsertRequest {
  role: MediaRole;
  storageKey: string;
  url?: string;
  width?: number;
  height?: number;
  bytes?: number;
  alt?: string | null;
  sortOrder?: number;
}

export interface ProductListQuery extends PageQuery {
  keyword?: string;
  /** 一级或二级分类 id */
  categoryId?: string;
  /** 二级分组 code，例如 knitwear-cardigan */
  group?: string;
  status?: ProductStatus;
  pricingMode?: PricingMode;
}

// ──────────────────────────── 轮播 ────────────────────────────

export interface BannerDto {
  id: string;
  title: string;
  imageUrl: string;
  linkType: 'NONE' | 'PRODUCT' | 'CATEGORY' | 'PAGE';
  linkValue?: string | null;
  sortOrder: number;
  status: 'ACTIVE' | 'DISABLED';
  startAt?: string | null;
  endAt?: string | null;
}

export interface BannerUpsertRequest {
  title: string;
  imageUrl: string;
  storageKey?: string;
  linkType: BannerDto['linkType'];
  linkValue?: string | null;
  sortOrder?: number;
  status?: BannerDto['status'];
  startAt?: string | null;
  endAt?: string | null;
}

// ─────────────────────── 量体模板（版本化） ───────────────────────

export interface MeasurementField {
  fieldCode: string;
  fieldName: string;
  measurementType: MeasurementType;
  unit: string;
  required: boolean;
  instruction?: string;
  tips?: string[];
  illustration?: string | null;
  min?: number | null;
  max?: number | null;
  step?: number | null;
}

export interface MeasurementSection {
  sectionId: string;
  title: string;
  measurementType: MeasurementType;
  description?: string;
  measurementFields: MeasurementField[];
}

export interface MeasurementTemplateDto {
  id: string;
  code: string;
  name: string;
  version: number;
  status: TemplateStatus;
  applicableCategories: string[];
  summary?: string | null;
  measurementSections: MeasurementSection[];
  createdAt: string;
  updatedAt: string;
}

export interface MeasurementTemplateUpsertRequest {
  code: string;
  name: string;
  applicableCategories: string[];
  summary?: string | null;
  measurementSections: MeasurementSection[];
  /** 发布后不可原地修改，需新建版本 */
  publish?: boolean;
}

// ─────────────────────── 定制申请（量体提交） ───────────────────────

export interface MeasurementFieldValue {
  fieldCode: string;
  fieldName: string;
  measurementType: MeasurementType;
  unit: string;
  value: number | null;
}

export interface MeasurementSnapshot {
  templateId: string;
  templateCode: string;
  templateName: string;
  templateVersion: number;
  sections: MeasurementSection[];
  fields: MeasurementFieldValue[];
}

export interface CustomerContact {
  name: string;
  phone: string;
  region: string;
  detail: string;
}

export interface CustomizationRequestDto {
  id: string;
  requestNo: string;
  customerId: string;
  productId: string;
  productCode: string;
  productName: string;
  productCoverUrl: string | null;
  templateId: string;
  templateName: string;
  templateVersion: number;
  status: RequestStatus;
  statusLabel: string;
  measurements: MeasurementSnapshot;
  contact: CustomerContact;
  remark?: string | null;
  activeQuote?: QuoteDto | null;
  orderId?: string | null;
  orderNo?: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * 定制申请**列表项**。
 *
 * 与详情 DTO 的差别是刻意的：列表页不需要量体明细与联系方式，
 * 而这两项都是敏感数据（一页 20 条就是 20 份量体表 + 20 份手机号地址）。
 * 量体与联系方式只在**详情接口**返回，由店员在真正处理该单时才查看。
 */
export type CustomizationRequestListItemDto = Omit<
  CustomizationRequestDto,
  'measurements' | 'contact' | 'activeQuote'
> & {
  activeQuote?: QuoteSummaryDto | null;
};

/**
 * 列表项用的精简报价：不含报价时冻结的商品与量体快照。
 */
export interface QuoteSummaryDto {
  id: string;
  requestId: string;
  version: number;
  status: QuoteStatus;
  amountCents: number;
  freightCents: number;
  totalCents: number;
  currency: string;
  productionDays: number;
  validUntil: string | null;
  createdByName: string;
  createdAt: string;
  confirmedAt?: string | null;
}

export interface CustomizationRequestCreateRequest {
  productId: string;
  measurements: MeasurementFieldValue[];
  contact: CustomerContact;
  remark?: string | null;
  /** 幂等键：同一 submitId 重复提交只产生一条申请 */
  submitId: string;
}

export interface CustomizationRequestListQuery extends PageQuery {
  status?: RequestStatus;
  keyword?: string;
  productId?: string;
}

// ──────────────────────────── 报价 ────────────────────────────

export interface QuoteDto {
  id: string;
  requestId: string;
  requestNo: string;
  version: number;
  status: QuoteStatus;
  amountCents: number;
  freightCents: number;
  totalCents: number;
  currency: string;
  productionDays: number;
  validUntil: string | null;
  note?: string | null;
  /** 报价时冻结的商品与量体快照 */
  productSnapshot: ProductSnapshot;
  measurementSnapshot: MeasurementSnapshot;
  createdById: string;
  createdByName: string;
  createdAt: string;
  confirmedAt?: string | null;
}

export interface ProductSnapshot {
  id: string;
  code: string;
  name: string;
  pricingMode: PricingMode;
  priceCents: number | null;
  categoryName: string;
  coverUrl: string | null;
  media: MediaDto[];
}

export interface QuoteCreateRequest {
  amountCents: number;
  freightCents: number;
  currency?: string;
  productionDays: number;
  validUntil?: string | null;
  note?: string | null;
}

export interface QuoteConfirmRequest {
  quoteId: string;
  /** 顾客必须确认当前有效版本；版本不符返回 QUOTE_VERSION_CONFLICT */
  expectedVersion: number;
}

/**
 * 顾客拒绝报价的请求体。
 *
 * 需求明确要求「顾客确认或拒绝报价」：
 * 此前只有确认，顾客嫌贵就走进死路（只能另行联系客服）。
 */
export interface QuoteRejectRequest {
  quoteId: string;
  expectedVersion: number;
  /** 拒绝理由（可选），会随审计留存，便于店员了解顾客诉求 */
  reason?: string | null;
}

// ──────────────────────────── 订单 ────────────────────────────

export interface OrderEventDto {
  id: string;
  fromStatus: OrderStatus | null;
  toStatus: OrderStatus;
  operatorName: string;
  note?: string | null;
  createdAt: string;
}

export interface OrderDto {
  id: string;
  orderNo: string;
  requestId: string;
  requestNo: string;
  quoteId: string;
  quoteVersion: number;
  status: OrderStatus;
  statusLabel: string;
  amountCents: number;
  freightCents: number;
  totalCents: number;
  currency: string;
  productionDays: number;
  productSnapshot: ProductSnapshot;
  measurementSnapshot: MeasurementSnapshot;
  contact: CustomerContact;
  remark?: string | null;
  carrier?: string | null;
  trackingNo?: string | null;
  shippedAt?: string | null;
  completedAt?: string | null;
  events: OrderEventDto[];
  createdAt: string;
  updatedAt: string;
}

/**
 * 订单**列表项**。
 *
 * 同样刻意做减法：量体快照、联系方式、状态事件流都只在详情接口返回，
 * 列表页只需要金额、状态、商品名与来源申请号。
 */
export type OrderListItemDto = Omit<
  OrderDto,
  'measurementSnapshot' | 'contact' | 'events' | 'productSnapshot'
> & {
  productSnapshot: ProductSnapshotSummary;
};

/**
 * 列表项用的精简商品快照：图集只给张数，不给整组图片元数据。
 */
export interface ProductSnapshotSummary {
  id: string;
  code: string;
  name: string;
  pricingMode: PricingMode;
  priceCents: number | null;
  categoryName: string;
  coverUrl: string | null;
  mediaCount: number;
}

export interface OrderCreateRequest {
  requestId: string;
  /** 必须为该申请当前有效报价的 id */
  quoteId: string;
}

export interface OrderStatusUpdateRequest {
  status: OrderStatus;
  note?: string | null;
}

export interface OrderShipRequest {
  carrier: string;
  trackingNo: string;
  note?: string | null;
}

export interface OrderListQuery extends PageQuery {
  status?: OrderStatus;
  keyword?: string;
}

// ──────────────────────────── 审计日志 ────────────────────────────

export interface AuditLogDto {
  id: string;
  actorId: string | null;
  actorName: string;
  actorRole: AdminRole | null;
  action: string;
  targetType: string;
  targetId: string | null;
  before?: unknown;
  after?: unknown;
  ip?: string | null;
  createdAt: string;
}

export interface AuditLogListQuery extends PageQuery {
  action?: string;
  targetType?: string;
  targetId?: string;
  actorId?: string;
}

// ──────────────────────────── 错误码 ────────────────────────────

export const ERROR_CODES = {
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  DUPLICATED_SUBMIT: 'DUPLICATED_SUBMIT',
  INVALID_STATUS_TRANSITION: 'INVALID_STATUS_TRANSITION',
  QUOTE_VERSION_CONFLICT: 'QUOTE_VERSION_CONFLICT',
  QUOTE_NOT_ACTIVE: 'QUOTE_NOT_ACTIVE',
  PRODUCT_NOT_PUBLISHED: 'PRODUCT_NOT_PUBLISHED',
  PAYMENT_DISABLED: 'PAYMENT_DISABLED',
  MEASUREMENT_INVALID: 'MEASUREMENT_INVALID',
  TEMPLATE_NOT_FOUND: 'TEMPLATE_NOT_FOUND',
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];
