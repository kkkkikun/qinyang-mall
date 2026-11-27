import { request, requestDownload, type DownloadPayload } from './http';
import type {
  AdminCustomizationRequestListItemDto,
  AdminUser,
  AuditLogDto,
  AuditLogListQuery,
  BannerDto,
  BannerUpsertRequest,
  CategoryDto,
  CategoryUpsertRequest,
  CustomizationRequestDto,
  CustomizationRequestListQuery,
  RequestStatus,
  LoginRequest,
  LoginResponse,
  MeasurementTemplateDto,
  MeasurementTemplateUpsertRequest,
  MediaDto,
  OrderCreateRequest,
  OrderDto,
  OrderListItemDto,
  OrderListQuery,
  OrderShipRequest,
  OrderStatusUpdateRequest,
  Paginated,
  GuidePageDto,
  GuidePageUpsertRequest,
  ProductBatchStatusResult,
  ProductDetail,
  ProductImportRequest,
  ProductImportResult,
  ProductListItem,
  ProductListQuery,
  ProductMediaUpdateRequest,
  ProductMediaUpsertRequest,
  ProductStatus,
  ProductUpsertRequest,
  QuoteCreateRequest,
  QuoteDto,
} from '@qinyang/contracts';

/**
 * 管理后台 REST 接口集合。
 * 路径前缀统一为 /api/v1（由 http.ts 的 baseURL 提供）。
 * 权限矩阵见 docs/api/REST-CONTRACT.md 第 2 节。
 */

export const authApi = {
  /** POST /admin/auth/login */
  login: (body: LoginRequest) =>
    request<LoginResponse>({ method: 'post', url: '/admin/auth/login', data: body }),
  /** GET /admin/auth/me */
  me: () => request<AdminUser>({ method: 'get', url: '/admin/auth/me' }),
};

export const productApi = {
  /** GET /admin/products */
  list: (query: ProductListQuery) =>
    request<Paginated<ProductListItem>>({
      method: 'get',
      url: '/admin/products',
      params: query,
    }),
  /** GET /admin/products/:id */
  detail: (id: string) => request<ProductDetail>({ method: 'get', url: `/admin/products/${id}` }),
  /** POST /admin/products（初始状态 DRAFT） */
  create: (body: ProductUpsertRequest) =>
    request<ProductDetail>({ method: 'post', url: '/admin/products', data: body }),
  /** PUT /admin/products/:id */
  update: (id: string, body: ProductUpsertRequest) =>
    request<ProductDetail>({ method: 'put', url: `/admin/products/${id}`, data: body }),
  /** POST /admin/products/:id/status（OWNER 专属） */
  updateStatus: (id: string, status: ProductStatus) =>
    request<ProductDetail>({
      method: 'post',
      url: `/admin/products/${id}/status`,
      data: { status },
    }),
  /** POST /admin/products/batch-status（OWNER 专属，批量上下架） */
  batchUpdateStatus: (ids: string[], status: ProductStatus) =>
    request<ProductBatchStatusResult>({
      method: 'post',
      url: '/admin/products/batch-status',
      data: { ids, status },
    }),
  /** DELETE /admin/products/:id（OWNER 专属，未发布且未被定制申请引用时可删） */
  remove: (id: string) => request<void>({ method: 'delete', url: `/admin/products/${id}` }),
  /**
   * POST /admin/products/import（CSV 批量导入）
   *
   * 只新增不覆盖：编号已存在的行会被跳过；导入的商品一律草稿。
   * `dryRun: true` 时只校验不落库。
   */
  importProducts: (body: ProductImportRequest) =>
    request<ProductImportResult>({
      method: 'post',
      url: '/admin/products/import',
      data: body,
    }),
  /**
   * POST /admin/products/:id/media
   *
   * 注意：接口返回的是**商品详情**（含完整图集），不是单条图集条目 ——
   * 此处原先标注为 MediaDto，与实际响应不符，属于契约漂移。
   */
  addMedia: (id: string, body: ProductMediaUpsertRequest) =>
    request<ProductDetail>({ method: 'post', url: `/admin/products/${id}/media`, data: body }),
  /** PUT /admin/products/:id/media/:mediaId（调整排序 / 角色） */
  updateMedia: (id: string, mediaId: string, body: ProductMediaUpdateRequest) =>
    request<ProductDetail>({
      method: 'put',
      url: `/admin/products/${id}/media/${mediaId}`,
      data: body,
    }),
  /** DELETE /admin/products/:id/media/:mediaId */
  removeMedia: (id: string, mediaId: string) =>
    request<ProductDetail>({
      method: 'delete',
      url: `/admin/products/${id}/media/${mediaId}`,
    }),
};

export const categoryApi = {
  /** GET /admin/categories */
  list: () => request<CategoryDto[]>({ method: 'get', url: '/admin/categories' }),
  /** POST /admin/categories（OWNER） */
  create: (body: CategoryUpsertRequest) =>
    request<CategoryDto>({ method: 'post', url: '/admin/categories', data: body }),
  /** PUT /admin/categories/:id（OWNER） */
  update: (id: string, body: CategoryUpsertRequest) =>
    request<CategoryDto>({ method: 'put', url: `/admin/categories/${id}`, data: body }),
  /** DELETE /admin/categories/:id（OWNER） */
  remove: (id: string) =>
    request<void>({ method: 'delete', url: `/admin/categories/${id}` }),
};

export const bannerApi = {
  /** GET /admin/banners */
  list: () => request<BannerDto[]>({ method: 'get', url: '/admin/banners' }),
  /** POST /admin/banners */
  create: (body: BannerUpsertRequest) =>
    request<BannerDto>({ method: 'post', url: '/admin/banners', data: body }),
  /** PUT /admin/banners/:id */
  update: (id: string, body: BannerUpsertRequest) =>
    request<BannerDto>({ method: 'put', url: `/admin/banners/${id}`, data: body }),
  /** DELETE /admin/banners/:id（OWNER） */
  remove: (id: string) => request<void>({ method: 'delete', url: `/admin/banners/${id}` }),
};

export const templateApi = {
  /** GET /admin/measurement-templates（含历史版本） */
  list: () =>
    request<MeasurementTemplateDto[]>({
      method: 'get',
      url: '/admin/measurement-templates',
    }),
  /** POST /admin/measurement-templates（OWNER） */
  create: (body: MeasurementTemplateUpsertRequest) =>
    request<MeasurementTemplateDto>({
      method: 'post',
      url: '/admin/measurement-templates',
      data: body,
    }),
  /** PUT /admin/measurement-templates/:id（OWNER，仅草稿可原地修改） */
  update: (id: string, body: MeasurementTemplateUpsertRequest) =>
    request<MeasurementTemplateDto>({
      method: 'put',
      url: `/admin/measurement-templates/${id}`,
      data: body,
    }),
  /** POST /admin/measurement-templates/:id/publish（OWNER，已发布则生成新版本） */
  publish: (id: string) =>
    request<MeasurementTemplateDto>({
      method: 'post',
      url: `/admin/measurement-templates/${id}/publish`,
    }),
  /** DELETE /admin/measurement-templates/:id（OWNER，被商品引用时服务端拒绝） */
  remove: (id: string) =>
    request<void>({
      method: 'delete',
      url: `/admin/measurement-templates/${id}`,
    }),
};

export const customizationRequestApi = {
  /** GET /admin/customization-requests */
  list: (query: CustomizationRequestListQuery) =>
    request<Paginated<AdminCustomizationRequestListItemDto>>({
      method: 'get',
      url: '/admin/customization-requests',
      params: query,
    }),
  /** GET /admin/customization-requests/export（CSV 原样响应） */
  exportCsv: (query: CustomizationRequestListQuery): Promise<DownloadPayload> =>
    requestDownload(
      { method: 'get', url: '/admin/customization-requests/export', params: query },
      '定制申请.csv',
    ),
  /** GET /admin/customization-requests/:id */
  detail: (id: string) =>
    request<CustomizationRequestDto>({
      method: 'get',
      url: `/admin/customization-requests/${id}`,
    }),
  /** POST /admin/customization-requests/:id/review */
  review: (id: string, action: 'APPROVE' | 'REJECT', note?: string) =>
    request<CustomizationRequestDto>({
      method: 'post',
      url: `/admin/customization-requests/${id}/review`,
      data: { action, note: note ?? null },
    }),
  /**
   * PUT /admin/customization-requests/:id/status
   * 变更申请状态（如「退回重新报价」把申请打回待报价）。
   */
  changeStatus: (id: string, status: RequestStatus, note?: string | null) =>
    request<CustomizationRequestDto>({
      method: 'put',
      url: `/admin/customization-requests/${id}/status`,
      data: { status, note: note ?? null },
    }),
  /** POST /admin/customization-requests/:id/quotes（OWNER，生成新报价版本） */
  createQuote: (id: string, body: QuoteCreateRequest) =>
    request<QuoteDto>({
      method: 'post',
      url: `/admin/customization-requests/${id}/quotes`,
      data: body,
    }),
  /** GET /admin/customization-requests/:id/quotes（报价历史版本） */
  quoteHistory: (id: string) =>
    request<QuoteDto[]>({
      method: 'get',
      url: `/admin/customization-requests/${id}/quotes`,
    }),
};

export const quoteApi = {
  /** POST /admin/quotes/:id/withdraw（OWNER） */
  withdraw: (id: string) =>
    request<QuoteDto>({ method: 'post', url: `/admin/quotes/${id}/withdraw` }),
};

export const orderApi = {
  /** GET /admin/orders */
  list: (query: OrderListQuery) =>
    request<Paginated<OrderListItemDto>>({
      method: 'get',
      url: '/admin/orders',
      params: query,
    }),
  /** GET /admin/orders/export（CSV 原样响应） */
  exportCsv: (query: OrderListQuery): Promise<DownloadPayload> =>
    requestDownload({ method: 'get', url: '/admin/orders/export', params: query }, '订单列表.csv'),
  /** GET /admin/orders/:id */
  detail: (id: string) => request<OrderDto>({ method: 'get', url: `/admin/orders/${id}` }),
  /** POST /admin/orders（OWNER，由已确认申请生成订单） */
  create: (body: OrderCreateRequest) =>
    request<OrderDto>({ method: 'post', url: '/admin/orders', data: body }),
  /** POST /admin/orders/:id/status */
  updateStatus: (id: string, body: OrderStatusUpdateRequest) =>
    request<OrderDto>({
      method: 'post',
      url: `/admin/orders/${id}/status`,
      data: body,
    }),
  /** POST /admin/orders/:id/ship */
  ship: (id: string, body: OrderShipRequest) =>
    request<OrderDto>({ method: 'post', url: `/admin/orders/${id}/ship`, data: body }),
  /**
   * POST /admin/orders/:id/cancel（OWNER）
   *
   * 取消原因在服务端是**必填**（`OrderCancelDto` 带 `@IsNotEmpty`），
   * 因此这里也按必填声明：调用方必须给出一个非空原因，
   * 避免发出一个注定 400 的请求。
   */
  cancel: (id: string, note: string) =>
    request<OrderDto>({
      method: 'post',
      url: `/admin/orders/${id}/cancel`,
      data: { note },
    }),
};

export const auditLogApi = {
  /** GET /admin/audit-logs（OWNER） */
  list: (query: AuditLogListQuery) =>
    request<Paginated<AuditLogDto>>({
      method: 'get',
      url: '/admin/audit-logs',
      params: query,
    }),
};

export const mediaApi = {
  /** POST /admin/media/upload（multipart） */
  upload: (file: File, productId?: string) => {
    const form = new FormData();
    form.append('file', file);
    if (productId) {
      form.append('productId', productId);
    }
    return request<MediaDto>({
      method: 'post',
      url: '/admin/media/upload',
      data: form,
    });
  },
};

export const guideApi = {
  /** GET /admin/guides（图文说明页列表） */
  list: () => request<GuidePageDto[]>({ method: 'get', url: '/admin/guides' }),
  /** PUT /admin/guides/:slug（更新标题 / 摘要 / 分节内容） */
  update: (slug: string, body: GuidePageUpsertRequest) =>
    request<GuidePageDto>({
      method: 'put',
      url: '/admin/guides/' + encodeURIComponent(slug),
      data: body,
    }),
};
