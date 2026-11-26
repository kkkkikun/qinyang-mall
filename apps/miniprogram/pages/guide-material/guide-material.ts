// 上装量体指南（图文指南）
import { getNavMetrics } from '../../utils/nav';
import { guide } from '../../utils/api';
import { buildGuideVM, GuideVM } from '../../utils/guide';

const SLUG = 'material';

Page({
  data: {
    nav: getNavMetrics(),
    loading: true,
    error: '',
    vm: null as GuideVM | null,
    imgErr: {} as Record<string, boolean>
  },

  onLoad() {
    this.load();
  },

  onPullDownRefresh() {
    this.load().then(() => {
      wx.stopPullDownRefresh();
    });
  },

  load() {
    this.setData({ loading: true, error: '' });
    guide(SLUG)
      .then((content) => {
        this.setData({ loading: false, vm: buildGuideVM(SLUG, content) });
      })
      .catch(() => {
        const vm = buildGuideVM(SLUG, null);
        this.setData({ loading: false, vm, error: vm.empty ? '指南内容加载失败，请稍后重试' : '' });
      });
  },

  reload() {
    this.load();
  },

  goBack() {
    wx.navigateBack();
  },

  onImgErr(e: { currentTarget: { dataset: Record<string, string> } }) {
    const key = String(e.currentTarget.dataset.key || '');
    this.setData({ ['imgErr[' + key + ']']: true });
  },

  goCustom() {
    wx.switchTab({ url: '/pages/custom/custom' });
  },

  goContact() {
    wx.navigateTo({ url: '/pages/contact/contact' });
  }
});
