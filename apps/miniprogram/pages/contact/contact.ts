// 客服入口：使用微信原生客服会话，不自建聊天
import { getNavMetrics } from '../../utils/nav';

Page({
  data: {
    nav: getNavMetrics()
  },

  goBack() {
    wx.navigateBack();
  },

  goCustom() {
    wx.switchTab({ url: '/pages/custom/custom' });
  }
});
