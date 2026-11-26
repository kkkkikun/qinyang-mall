/**
 * wx.request 封装。
 *
 * 约定（见 docs/api/REST-CONTRACT.md）：
 * - 所有响应统一包装为 { code, message, data, requestId? }；
 * - code = 0 表示成功，非 0 为业务错误码；
 * - 顾客 token 通过 Authorization: Bearer 或 x-customer-token 传递。
 */

import { getBaseUrl } from './config';
import { getToken, clearToken } from './token';

export interface ApiEnvelope<T> {
  code: number;
  message: string;
  data: T;
  requestId?: string;
}

/** 业务错误（code != 0 或 HTTP 状态异常） */
export class ApiError extends Error {
  code: number;
  requestId?: string;

  constructor(message: string, code: number, requestId?: string) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.requestId = requestId;
  }
}

export interface RequestOptions {
  /** 相对基址的路径，例如 '/products' */
  url: string;
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  data?: Record<string, unknown>;
  header?: Record<string, string>;
  /** 是否附带顾客 token，默认 true */
  auth?: boolean;
  /** 失败时是否自动 toast，默认 true */
  toast?: boolean;
}

/** 统一错误提示 */
function toastError(message: string): void {
  try {
    wx.showToast({ title: message, icon: 'none', duration: 2200 });
  } catch (e) {
    // 忽略 toast 失败
  }
}

export function request<T>(options: RequestOptions): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const header: Record<string, string> = { 'content-type': 'application/json' };
    const extra = options.header;
    if (extra) {
      Object.keys(extra).forEach((key) => {
        header[key] = extra[key];
      });
    }
    const token = options.auth === false ? '' : getToken();
    if (token) {
      header['Authorization'] = 'Bearer ' + token;
      header['x-customer-token'] = token;
    }

    wx.request({
      url: getBaseUrl() + options.url,
      method: options.method || 'GET',
      data: options.data,
      header,
      timeout: 15000,
      success(res) {
        const status = res.statusCode;
        const body = res.data as ApiEnvelope<T> | null;

        if (status === 401) {
          clearToken();
          const err = new ApiError('登录状态已失效，请重新进入小程序', 401);
          reject(err);
          return;
        }

        if (!body || typeof body !== 'object' || typeof body.code !== 'number') {
          const err = new ApiError('服务器返回数据异常（HTTP ' + status + '）', status);
          if (options.toast !== false) {
            toastError(err.message);
          }
          reject(err);
          return;
        }

        if (body.code !== 0) {
          const err = new ApiError(body.message || '请求失败', body.code, body.requestId);
          if (options.toast !== false) {
            toastError(err.message);
          }
          reject(err);
          return;
        }

        resolve(body.data);
      },
      fail() {
        const err = new ApiError('网络连接失败，请检查网络或服务器地址', 0);
        if (options.toast !== false) {
          toastError(err.message);
        }
        reject(err);
      }
    });
  });
}
