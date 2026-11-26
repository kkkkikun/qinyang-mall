/**
 * 小程序入口。
 *
 * 顾客端不需要预登录：token 在需要登录的接口调用时由 utils/auth.ts 懒加载。
 * API 基址可在 utils/config.ts 中通过 wx.setStorageSync('qy_api_base_url', '...') 覆盖，
 * 也可在「我的 → 服务器地址」里修改。
 */

App({
  onLaunch() {
    // 顾客端无全局状态需要预热；导航栏度量由各页面在 onLoad 时自行获取。
  }
});
