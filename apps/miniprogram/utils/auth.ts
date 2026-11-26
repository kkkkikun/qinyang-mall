/**
 * 顾客登录态。
 *
 * 顾客端无需手机号注册：wx.login 拿到 code → POST /auth/login → 顾客 token，
 * token 落本地存储，后续带 token 的接口自动带上。
 */

import { request, ApiError } from './request';
import { clearToken, getToken, setToken } from './token';
import { CustomerLoginResponse } from '../types/local';

export { getToken, setToken, clearToken };

/** 已有 token 直接复用；没有则静默走一次 wx.login */
export function ensureToken(): Promise<string> {
  const cached = getToken();
  if (cached) {
    return Promise.resolve(cached);
  }
  return new Promise<string>((resolve, reject) => {
    wx.login({
      success(res) {
        request<CustomerLoginResponse>({
          url: '/auth/login',
          method: 'POST',
          data: { code: res.code },
          auth: false,
          toast: false
        })
          .then((data) => {
            const token = data && data.token ? data.token : '';
            if (!token) {
              reject(new ApiError('登录失败，请稍后重试', 401));
              return;
            }
            setToken(token);
            resolve(token);
          })
          .catch(reject);
      },
      fail() {
        reject(new ApiError('微信登录失败，请稍后重试', 401));
      }
    });
  });
}

/** 退出登录（清除本地 token） */
export function logout(): void {
  clearToken();
}
