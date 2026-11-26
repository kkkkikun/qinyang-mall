/**
 * 自定义导航栏度量。
 *
 * 说明：不模拟微信右上角胶囊。真实胶囊位置来自
 * wx.getMenuButtonBoundingClientRect()，状态栏高度来自 wx.getWindowInfo()
 * （旧基础库回退 wx.getSystemInfoSync()），页面据此预留右侧空白与内容区高度。
 */

import { NavMetrics } from '../types/local';

export function getNavMetrics(): NavMetrics {
  let statusBarHeight = 20;
  let windowWidth = 375;

  try {
    const info = typeof wx.getWindowInfo === 'function' ? wx.getWindowInfo() : wx.getSystemInfoSync();
    statusBarHeight = info.statusBarHeight || statusBarHeight;
    windowWidth = info.windowWidth || windowWidth;
  } catch (e) {
    // 读取失败时使用默认值
  }

  let menuHeight = 32;
  let menuTop = statusBarHeight + 4;
  let capsuleGap = 96;

  try {
    const rect = wx.getMenuButtonBoundingClientRect();
    if (rect && rect.width > 0) {
      menuHeight = rect.height || menuHeight;
      menuTop = rect.top || menuTop;
      capsuleGap = windowWidth - rect.left;
    }
  } catch (e) {
    // 取不到胶囊信息时使用默认占位
  }

  const barHeight = Math.max(32, (menuTop - statusBarHeight) * 2 + menuHeight);

  return {
    statusBarHeight,
    menuHeight,
    barHeight,
    capsuleGap: Math.max(60, capsuleGap),
    windowWidth
  };
}
