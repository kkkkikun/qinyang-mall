/**
 * 顾客端 REST 接口封装。
 *
 * 路由与参数严格对齐 docs/api/REST-CONTRACT.md 第 1 节「顾客端（小程序）」。
 */

import { request } from './request';
import { ensureToken } from './auth';
import {
  BannerDto,
  CategoryDto,
  CustomizationRequestCreateRequest,
  CustomizationRequestDto,
  CustomizationRequestListItemDto,
  CustomerProfile,
  MeasurementTemplateDto,
  OrderDto,
  OrderListItemDto,
  Paginated,
  ProductDetail,
  ProductListItem
} from '../types/contracts';
import { CustomerLoginResponse, GuideContent } from '../types/local';

/** GET /products 查询参数（REST 契约：keyword categoryId group page pageSize） */
export interface ProductQuery {
  keyword?: string;
  categoryId?: string;
  group?: string;
  page?: number;
  pageSize?: number;
}

/** GET /customization-requests 查询参数 */
export interface RequestQuery {
  status?: string;
  keyword?: string;
  productId?: string;
  page?: number;
  pageSize?: number;
}

/** GET /orders 查询参数 */
export interface OrderQuery {
  status?: string;
  keyword?: string;
  page?: number;
  pageSize?: number;
}

function asItems<T>(raw: unknown): T[] {
  if (Array.isArray(raw)) {
    return raw as T[];
  }
  if (raw && typeof raw === 'object' && Array.isArray((raw as { items?: unknown[] }).items)) {
    return (raw as { items: T[] }).items;
  }
  return [];
}

/** 兼容服务端返回 { items,total,page,pageSize } 或直接数组的情况 */
function normalizePage<T>(raw: unknown): Paginated<T> {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const obj = raw as Partial<Paginated<T>>;
    if (Array.isArray(obj.items)) {
      return {
        items: obj.items,
        total: typeof obj.total === 'number' ? obj.total : obj.items.length,
        page: typeof obj.page === 'number' ? obj.page : 1,
        pageSize: typeof obj.pageSize === 'number' ? obj.pageSize : obj.items.length
      };
    }
  }
  const items = asItems<T>(raw);
  return { items, total: items.length, page: 1, pageSize: items.length };
}

function queryString(params: Record<string, string | number | undefined>): string {
  const parts: string[] = [];
  Object.keys(params).forEach((key) => {
    const value = params[key];
    if (value !== undefined && value !== null && value !== '') {
      parts.push(encodeURIComponent(key) + '=' + encodeURIComponent(String(value)));
    }
  });
  return parts.length ? '?' + parts.join('&') : '';
}

/* ------------------------------ 认证 ------------------------------ */

export function login(code: string): Promise<CustomerLoginResponse> {
  return request<CustomerLoginResponse>({
    url: '/auth/login',
    method: 'POST',
    data: { code },
    auth: false
  });
}

/** GET /auth/me */
export function me(): Promise<CustomerProfile> {
  return ensureToken().then(() =>
    request<CustomerProfile>({ url: '/auth/me' })
  );
}

/* ------------------------------ 商品 ------------------------------ */

/** GET /categories */
export function categories(): Promise<CategoryDto[]> {
  return request<unknown>({ url: '/categories', auth: false }).then((raw) => asItems<CategoryDto>(raw));
}

/** GET /banners */
export function banners(): Promise<BannerDto[]> {
  return request<unknown>({ url: '/banners', auth: false }).then((raw) => asItems<BannerDto>(raw));
}

/** GET /products */
export function products(query: ProductQuery): Promise<Paginated<ProductListItem>> {
  const qs = queryString({
    keyword: query.keyword,
    categoryId: query.categoryId,
    group: query.group,
    page: query.page,
    pageSize: query.pageSize
  });
  return request<unknown>({ url: '/products' + qs, auth: false }).then((raw) => normalizePage<ProductListItem>(raw));
}

/** GET /products/:id */
export function product(id: string): Promise<ProductDetail> {
  return request<ProductDetail>({ url: '/products/' + encodeURIComponent(id), auth: false });
}

/* --------------------------- 量体模板与指南 --------------------------- */

/** GET /measurement-templates/resolve?productId= */
export function resolveTemplate(productId: string): Promise<MeasurementTemplateDto> {
  const qs = queryString({ productId });
  return request<MeasurementTemplateDto>({ url: '/measurement-templates/resolve' + qs, auth: false });
}

function normalizeGuide(raw: unknown, slug: string): GuideContent {
  const obj = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const rawSections = Array.isArray(obj.sections) ? (obj.sections as unknown[]) : [];
  const sections = rawSections.map((item) => {
    const section = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>;
    const items = Array.isArray(section.items) ? section.items.map((i) => String(i)) : [];
    return {
      title: String(section.title || ''),
      description: section.description ? String(section.description) : undefined,
      items,
      illustration: section.illustration ? String(section.illustration) : null,
      fieldCodes: Array.isArray(section.fieldCodes) ? section.fieldCodes.map((c) => String(c)) : []
    };
  });
  if (!sections.length && typeof obj.content === 'string' && obj.content) {
    sections.push({ title: '', description: undefined, items: [obj.content], illustration: null, fieldCodes: [] });
  }
  return {
    slug: String(obj.slug || slug),
    title: String(obj.title || ''),
    summary: obj.summary ? String(obj.summary) : null,
    sections
  };
}

/** GET /guides/:slug */
export function guide(slug: string): Promise<GuideContent> {
  return request<unknown>({ url: '/guides/' + encodeURIComponent(slug), auth: false }).then((raw) =>
    normalizeGuide(raw, slug)
  );
}

/* ---------------------------- 定制申请 ---------------------------- */

/** POST /customization-requests */
export function createCustomizationRequest(
  payload: CustomizationRequestCreateRequest
): Promise<CustomizationRequestDto> {
  return ensureToken().then(() =>
    request<CustomizationRequestDto>({
      url: '/customization-requests',
      method: 'POST',
      data: payload as unknown as Record<string, unknown>
    })
  );
}

/** GET /customization-requests */
export function listCustomizationRequests(query: RequestQuery): Promise<Paginated<CustomizationRequestListItemDto>> {
  const qs = queryString({
    status: query.status,
    keyword: query.keyword,
    productId: query.productId,
    page: query.page,
    pageSize: query.pageSize
  });
  return ensureToken().then(() =>
    request<unknown>({ url: '/customization-requests' + qs }).then((raw) =>
      normalizePage<CustomizationRequestListItemDto>(raw)
    )
  );
}

/** GET /customization-requests/:id */
export function getCustomizationRequest(id: string): Promise<CustomizationRequestDto> {
  return ensureToken().then(() =>
    request<CustomizationRequestDto>({ url: '/customization-requests/' + encodeURIComponent(id) })
  );
}

/**
 * POST /customization-requests/:id/reject-quote
 * 顾客拒绝报价：申请回到待报价，等待店员重新报价。
 */
export function rejectQuote(
  requestId: string,
  quoteId: string,
  expectedVersion: number,
  reason?: string
): Promise<CustomizationRequestDto> {
  return ensureToken().then(() =>
    request<CustomizationRequestDto>({
      url: '/customization-requests/' + encodeURIComponent(requestId) + '/reject-quote',
      method: 'POST',
      data: { quoteId, expectedVersion, reason: reason ?? null }
    })
  );
}

/** POST /customization-requests/:id/confirm-quote */
export function confirmQuote(
  requestId: string,
  quoteId: string,
  expectedVersion: number
): Promise<CustomizationRequestDto> {
  return ensureToken().then(() =>
    request<CustomizationRequestDto>({
      url: '/customization-requests/' + encodeURIComponent(requestId) + '/confirm-quote',
      method: 'POST',
      data: { quoteId, expectedVersion }
    })
  );
}

/** POST /customization-requests/:id/cancel */
export function cancelRequest(requestId: string): Promise<CustomizationRequestDto> {
  return ensureToken().then(() =>
    request<CustomizationRequestDto>({
      url: '/customization-requests/' + encodeURIComponent(requestId) + '/cancel',
      method: 'POST'
    })
  );
}

/* ------------------------------ 订单 ------------------------------ */

/** GET /orders */
export function listOrders(query: OrderQuery): Promise<Paginated<OrderListItemDto>> {
  const qs = queryString({
    status: query.status,
    keyword: query.keyword,
    page: query.page,
    pageSize: query.pageSize
  });
  return ensureToken().then(() =>
    request<unknown>({ url: '/orders' + qs }).then((raw) => normalizePage<OrderListItemDto>(raw))
  );
}

/** GET /orders/:id */
export function getOrder(id: string): Promise<OrderDto> {
  return ensureToken().then(() => request<OrderDto>({ url: '/orders/' + encodeURIComponent(id) }));
}
