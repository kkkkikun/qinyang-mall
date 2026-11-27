/**
 * 微信小程序全局能力的最小类型声明。
 *
 * 原因：本工程按项目约定不引入任何 npm 依赖（apps/miniprogram 下没有 node_modules），
 * 因此不能依赖 `miniprogram-api-typings`；这里用本地环境声明补齐小程序页面实际
 * 使用到的 API，保证微信开发者工具的 TypeScript 编译插件在严格模式下不报错。
 *
 * 注意：本文件是全局声明（不含 import/export），只声明本工程真正调用过的 API。
 */

interface WxRequestSuccessCallbackResult {
  statusCode: number;
  data: unknown;
  header: Record<string, string>;
}

interface WxRequestOption {
  url: string;
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  data?: Record<string, unknown>;
  header?: Record<string, string>;
  timeout?: number;
  success?: (res: WxRequestSuccessCallbackResult) => void;
  fail?: (err: { errMsg: string }) => void;
  complete?: () => void;
}

interface WxWindowInfo {
  windowWidth: number;
  windowHeight: number;
  statusBarHeight: number;
  safeArea?: { bottom: number };
}

interface WxMenuButtonRect {
  top: number;
  bottom: number;
  left: number;
  right: number;
  width: number;
  height: number;
}

interface WxToastOption {
  title: string;
  icon?: 'success' | 'error' | 'loading' | 'none';
  duration?: number;
  mask?: boolean;
}

interface WxLoginSuccessCallbackResult {
  code: string;
  errMsg: string;
}

interface WxNavigateOption {
  url: string;
  success?: () => void;
  fail?: () => void;
}

declare const wx: {
  request(options: WxRequestOption): void;
  getStorageSync(key: string): unknown;
  setStorageSync(key: string, value: unknown): void;
  removeStorageSync(key: string): void;
  showToast(options: WxToastOption): void;
  showLoading(options?: { title?: string; mask?: boolean }): void;
  hideLoading(): void;
  stopPullDownRefresh(): void;
  login(options: { success?: (res: WxLoginSuccessCallbackResult) => void; fail?: () => void }): void;
  getWindowInfo(): WxWindowInfo;
  getSystemInfoSync(): WxWindowInfo;
  /** 小程序环境信息（envVersion: develop / trial / release） */
  getAccountInfoSync(): { miniProgram: { appId: string; envVersion: string; version: string } };
  getMenuButtonBoundingClientRect(): WxMenuButtonRect;
  navigateTo(options: WxNavigateOption): void;
  redirectTo(options: WxNavigateOption): void;
  switchTab(options: WxNavigateOption): void;
  navigateBack(options?: { delta?: number }): void;
  reLaunch(options: WxNavigateOption): void;
  previewImage(options: { current?: string; urls: string[] }): void;
  setClipboardData(options: { data: string }): void;
  showModal(options: {
    title?: string;
    content?: string;
    confirmText?: string;
    cancelText?: string;
    confirmColor?: string;
    success?: (res: { confirm: boolean; cancel: boolean }) => void;
    fail?: () => void;
  }): void;
};

/**
 * 页面实例：data 为动态结构，故使用宽松类型；
 * 具体字段在页面 ts 文件内通过接口断言收窄。
 */
interface PageInstance {
  data: any;
  setData(data: Record<string, any>, callback?: () => void): void;
  [key: string]: any;
}

interface PageOptions {
  data?: any;
  onLoad?: (query: Record<string, string | undefined>) => void;
  onShow?: () => void;
  onPullDownRefresh?: () => void;
  onReachBottom?: () => void;
  [key: string]: unknown;
}

declare function Page(options: PageOptions & ThisType<PageInstance>): void;

interface AppInstance {
  globalData: any;
  [key: string]: any;
}

declare function getCurrentPages(): any[];

declare function App(options: {
  onLaunch?: () => void;
  globalData?: any;
  [key: string]: unknown;
} & ThisType<AppInstance>): void;
