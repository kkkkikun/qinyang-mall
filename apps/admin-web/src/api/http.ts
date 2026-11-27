import axios, { type AxiosInstance, type AxiosRequestConfig } from 'axios';
import type { ApiResponse } from '@qinyang/contracts';

/** localStorage 中保存管理员 token / 资料的键名 */
export const TOKEN_STORAGE_KEY = 'qy_admin_token';
export const USER_STORAGE_KEY = 'qy_admin_user';

/**
 * 业务异常：携带后端返回的业务错误码与 HTTP 状态码。
 * `code` 可能是数字（HTTP 状态语义）或字符串（契约中的 ERROR_CODES）。
 */
export class ApiError extends Error {
  readonly code: number | string;
  readonly status: number;

  constructor(code: number | string, message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
  }

  /** 是否为状态冲突（报价版本冲突、非法状态流转等） */
  get isConflict(): boolean {
    return this.status === 409;
  }
}

let unauthorizedHandler: (() => void) | null = null;

/** 由应用入口注册 401 处理逻辑（登出并跳转登录页），避免 api 层依赖 router */
export function setUnauthorizedHandler(handler: () => void): void {
  unauthorizedHandler = handler;
}

export function readToken(): string {
  return localStorage.getItem(TOKEN_STORAGE_KEY) ?? '';
}

/**
 * API 基址。
 *
 * 浏览器里用同源相对路径（由 nginx 反代 /api 到 API 容器）；
 * Node 端（后台页面级自动化验证 tools/verify_admin_pages.mjs）需要绝对地址，
 * 通过 `globalThis.__QY_API_BASE__` 注入 —— 这也是唯一一处为可测性开的后门，
 * 生产构建下该全局变量不存在，行为与原来完全一致。
 */
const baseURL =
  (globalThis as { __QY_API_BASE__?: string }).__QY_API_BASE__ ?? '/api/v1';

const http: AxiosInstance = axios.create({
  baseURL,
  timeout: 20000,
});

http.interceptors.request.use((config) => {
  const token = readToken();
  if (token) {
    config.headers.set('Authorization', `Bearer ${token}`);
  }
  return config;
});

/**
 * 统一请求封装：后端返回 `{ code, message, data }`，
 * code === 0 时返回 data，否则抛出 ApiError。
 */
export async function request<T>(config: AxiosRequestConfig): Promise<T> {
  try {
    const response = await http.request<ApiResponse<T>>(config);
    const body = response.data;
    if (!body || typeof body.code !== 'number') {
      throw new ApiError('BAD_RESPONSE', '服务端返回格式异常', response.status);
    }
    if (body.code !== 0) {
      throw new ApiError(body.code, body.message || '操作失败', response.status);
    }
    return body.data;
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    if (axios.isAxiosError(error)) {
      const status = error.response?.status ?? 0;
      const payload = error.response?.data as Partial<ApiResponse<unknown>> | undefined;
      const code: number | string =
        typeof payload?.code === 'number' ? payload.code : status;
      const message = payload?.message || error.message || '网络异常，请稍后重试';
      if (status === 401) {
        unauthorizedHandler?.();
      }
      throw new ApiError(code, message, status);
    }
    throw error;
  }
}

/** 把任意异常转换为可展示的中文文案 */
export function toErrorMessage(error: unknown, fallback = '操作失败'): string {
  if (error instanceof ApiError) {
    if (error.isConflict) {
      return `状态冲突：${error.message}`;
    }
    return error.message || fallback;
  }
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return fallback;
}

/** 原样下载响应：正文 + 服务端给的文件名 */
export interface DownloadPayload {
  text: string;
  filename: string;
}

/** 从 Content-Disposition 里取文件名（优先 RFC 5987 的 filename*） */
export function parseContentDisposition(disposition: string, fallback: string): string {
  const encoded = /filename\*=UTF-8''([^;]+)/i.exec(disposition);
  if (encoded?.[1]) {
    try {
      return decodeURIComponent(encoded[1].trim());
    } catch {
      /* 编码异常时退回普通 filename */
    }
  }
  const plain = /filename="([^"]+)"/i.exec(disposition);
  return plain?.[1]?.trim() || fallback;
}

/**
 * 下载型请求：返回原始文本而不是统一包装。
 *
 * CSV 导出走的是 `@RawResponse()` 接口（真正的 text/csv），
 * 不能用 `request()` —— 那会把 CSV 当成 JSON 解析并抛「返回格式异常」。
 *
 * 401 处理与 `request()` 保持一致：导出走到的是同一个受保护接口，
 * token 过期时也要清登录态并跳登录页，否则用户只会反复看到
 * 「导出失败：Request failed with status code 401」。
 */
export async function requestDownload(
  config: AxiosRequestConfig,
  fallbackFilename = 'export.csv',
): Promise<DownloadPayload> {
  try {
    const response = await http.request<string>({
      ...config,
      responseType: 'text',
    });
    const text = typeof response.data === 'string' ? response.data : String(response.data ?? '');
    const disposition = String(response.headers?.['content-disposition'] ?? '');
    return { text, filename: parseContentDisposition(disposition, fallbackFilename) };
  } catch (error) {
    if (!axios.isAxiosError(error)) {
      throw error;
    }
    const status = error.response?.status ?? 0;
    const payload = parseErrorPayload(error.response?.data);
    const code: number | string =
      typeof payload?.code === 'number' ? payload.code : status;
    const message = payload?.message || error.message || '导出失败，请稍后重试';
    if (status === 401) {
      unauthorizedHandler?.();
    }
    throw new ApiError(code, message, status);
  }
}

/**
 * 解析错误响应体。
 *
 * 下载请求的 responseType 是 text，错误体同样是文本；
 * 这里再尝试解析一次 JSON，好把服务端的中文错误信息透出给商家。
 */
function parseErrorPayload(data: unknown): Partial<ApiResponse<unknown>> | undefined {
  if (typeof data === 'string') {
    try {
      const parsed = JSON.parse(data) as Partial<ApiResponse<unknown>>;
      return parsed && typeof parsed === 'object' ? parsed : undefined;
    } catch {
      return undefined;
    }
  }
  if (data && typeof data === 'object') {
    return data as Partial<ApiResponse<unknown>>;
  }
  return undefined;
}
