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
  /**
   * 0 表示成功；非 0 为业务错误码 ——
   * 服务端在异常响应里放的是**字符串**业务码（如 MEASUREMENT_INVALID），
   * 所以这里不能只声明 number。
   */
  code: number | string;
  message: string;
  data: T;
  requestId?: string;
}

/** 业务错误（code != 0 或 HTTP 状态异常） */
export class ApiError extends Error {
  code: number | string;
  requestId?: string;

  constructor(message: string, code: number | string, requestId?: string) {
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

    const baseUrl = getBaseUrl();
    if (!baseUrl) {
      // 服务地址未配置：明确说出来，别让顾客对着「网络连接失败」猜
      const err = new ApiError('服务地址未配置，请联系客服', 0);
      if (options.toast !== false) {
        toastError(err.message);
      }
      reject(err);
      return;
    }

    wx.request({
      url: baseUrl + options.url,
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

        if (!body || typeof body !== 'object') {
          const err = new ApiError('服务器返回数据异常（HTTP ' + status + '）', status);
          if (options.toast !== false) {
            toastError(err.message);
          }
          reject(err);
          return;
        }

        if (body.code === 0) {
          resolve(body.data);
          return;
        }

        // 业务错误：服务端把业务错误码放在 code（字符串），message 是可以直接
        // 展示给顾客的原因（如「胸围 不能小于 60cm」）。
        // 早期实现只认数字 code，导致这类错误一律被当成
        // 「服务器返回数据异常」，顾客看不到真正的原因。
        const err = new ApiError(
          typeof body.message === 'string' && body.message ? body.message : '请求失败',
          body.code === undefined || body.code === null ? status : body.code,
          body.requestId
        );
        if (options.toast !== false) {
          toastError(err.message);
        }
        reject(err);
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
