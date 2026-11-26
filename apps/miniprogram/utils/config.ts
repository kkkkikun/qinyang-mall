/**
 * 运行配置：API 基址与静态资源前缀。
 *
 * 基址可通过 wx.setStorageSync 覆盖（后台「切换服务器地址」使用），
 * 存储键：qy_api_base_url。
 */

const STORAGE_BASE_URL = 'qy_api_base_url';

/** 默认基址：本地开发用 API（NestJS）默认监听端口 */
export const DEFAULT_BASE_URL = 'http://127.0.0.1:18110/api/v1';

/** 小程序根目录内的静态资源前缀 */
export const ASSET_PREFIX = '/assets';

function stripTrailingSlash(url: string): string {
  return url.replace(/\/+$/, '');
}

/** 读取当前生效的 API 基址 */
export function getBaseUrl(): string {
  try {
    const stored = wx.getStorageSync(STORAGE_BASE_URL);
    if (typeof stored === 'string' && stored.trim()) {
      return stripTrailingSlash(stored.trim());
    }
  } catch (e) {
    // 读取失败时回落到默认基址
  }
  return DEFAULT_BASE_URL;
}

/** 覆盖 API 基址（后台切换服务器地址） */
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
