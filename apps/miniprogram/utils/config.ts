/**
 * 运行配置：API 基址与静态资源前缀。
 *
 * 基址来源（按优先级）：
 * 1. 本地存储覆盖 —— **仅开发版**可用（「我的 → 服务器地址」面板，
 *    顾客版不渲染，见 `isDeveloperEnv()`）；
 * 2. 构建期常量 `API_BASE_URL` —— 发布前注入的正式域名；
 * 3. 都没有 → 返回空串，由请求层**显式报错**，
 *    而不是静默指向 localhost（真机上 127.0.0.1 指向手机自己，
 *    正式版又拒收 http 域名，「装到手机上就是废的」且看不出原因）。
 */
import { ALLOW_SERVER_SWITCH, API_BASE_URL } from '../config/env';

const STORAGE_BASE_URL = 'qy_api_base_url';

/**
 * 默认基址。
 *
 * 仅在**开发版**且未注入构建期常量时使用（本地连 127.0.0.1 调试）。
 * 正式版永远拿不到这个值 —— 拿不到就报错，不猜。
 */
export const DEV_BASE_URL = 'http://127.0.0.1:18110/api/v1';

/** 小程序根目录内的静态资源前缀 */
export const ASSET_PREFIX = '/assets';

function stripTrailingSlash(url: string): string {
  return url.replace(/\/+$/, '');
}

/**
 * 当前是否处于开发版。
 *
 * 顾客能在「我的」里改服务器地址，等于把「登录态 + 量体 + 姓名电话地址」
 * 发到他自己指定的任意主机 —— 因此这个面板**只在开发版出现**。
 */
export function isDeveloperEnv(): boolean {
  try {
    const info = wx.getAccountInfoSync();
    return info?.miniProgram?.envVersion === 'develop';
  } catch (e) {
    return false;
  }
}

/** 是否允许切换服务器地址（开发版 + 运营开关） */
export function canSwitchServer(): boolean {
  return ALLOW_SERVER_SWITCH && isDeveloperEnv();
}

/** 读取当前生效的 API 基址；未配置时返回空串 */
export function getBaseUrl(): string {
  try {
    const stored = wx.getStorageSync(STORAGE_BASE_URL);
    if (typeof stored === 'string' && stored.trim()) {
      return stripTrailingSlash(stored.trim());
    }
  } catch (e) {
    // 读取失败时继续往下走
  }
  if (API_BASE_URL) {
    return stripTrailingSlash(API_BASE_URL);
  }
  if (isDeveloperEnv()) {
    return DEV_BASE_URL;
  }
  // 未配置：交给请求层显式报错
  return '';
}

/** 覆盖 API 基址（仅开发版可用） */
export function setBaseUrl(url: string): void {
  wx.setStorageSync(STORAGE_BASE_URL, stripTrailingSlash(String(url || '').trim()));
}

/** 还原默认 API 基址 */
export function resetBaseUrl(): void {
  try {
    wx.removeStorageSync(STORAGE_BASE_URL);
  } catch (e) {
    // 忽略
  }
}
