/**
 * 构建期注入的运行配置。
 *
 * 这个文件里的常量由**打包前**写入，提交进 Git 的是占位值。
 *
 *   # 发布前注入正式域名（必须 https）
 *   node tools/set_miniprogram_env.mjs https://api.qinyang.com/api/v1
 *
 * 为什么不能靠运行时默认值（本轮审计 P0）：
 * 此前基址默认回落到 `http://127.0.0.1:18110/api/v1`。
 * 真机上 127.0.0.1 指向**手机自己**，正式版小程序又拒收 http 域名 ——
 * 结果是「装到手机上就是废的」，而且界面只弹一句「网络连接失败」，
 * 顾客和客服都无从判断是网络问题还是服务地址没配。
 *
 * 因此：基址缺失时**必须显式失败并说明原因**，不能静默指向 localhost。
 */
export const API_BASE_URL = '';

/**
 * 是否允许在「我的 → 服务器地址」里切换基址。
 *
 * 仅开发版（envVersion === 'develop'）会渲染那个面板，与本开关无关 ——
 * 这是运营安全开关，留给需要在真机上临时指向测试环境的同学。
 * 生产发布时保持 false。
 */
export const ALLOW_SERVER_SWITCH = false;
