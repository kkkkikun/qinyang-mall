/**
 * 顾客 token 存取（与 request.ts 解耦，避免循环依赖）。
 *
 * 存储键：qy_customer_token
 */

const TOKEN_KEY = 'qy_customer_token';

export function getToken(): string {
  try {
    const token = wx.getStorageSync(TOKEN_KEY);
    return typeof token === 'string' ? token : '';
  } catch (e) {
    return '';
  }
}

export function setToken(token: string): void {
  wx.setStorageSync(TOKEN_KEY, token);
}

export function clearToken(): void {
  try {
    wx.removeStorageSync(TOKEN_KEY);
  } catch (e) {
    // 忽略
  }
}
