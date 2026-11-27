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
