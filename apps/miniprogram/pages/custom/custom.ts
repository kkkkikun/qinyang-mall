// 定制（Tab）：量体指南入口 + 定制流程 + 记录入口
import { getNavMetrics } from '../../utils/nav';

Page({
  data: {
    nav: getNavMetrics(),
    steps: [
      { no: '1', t: '选款', d: '浏览分类挑选羊绒服饰' },
      { no: '2', t: '量体', d: '按模板填写身体与成衣尺寸' },
      { no: '3', t: '报价', d: '商家按量体数据审核并报价' },
      { no: '4', t: '制作发货', d: '确认报价后安排制作与配送' }
    ]
  },

  goGuide(e: { currentTarget: { dataset: Record<string, string> } }) {
    const slug = String(e.currentTarget.dataset.slug || '');
    if (!slug) {
      return;
    }
    wx.navigateTo({ url: '/pages/' + slug + '/' + slug });
  },

  goCategory() {
    wx.switchTab({ url: '/pages/category/category' });
  },

  goRequests() {
    wx.navigateTo({ url: '/pages/requests/requests' });
  },

  goOrders() {
    wx.navigateTo({ url: '/pages/orders/orders' });
  },

  goContact() {
    wx.navigateTo({ url: '/pages/contact/contact' });
  }
});
