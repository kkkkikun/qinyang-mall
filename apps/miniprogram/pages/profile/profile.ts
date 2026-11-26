// 个人中心：重点是定制记录
import { getNavMetrics } from '../../utils/nav';
import { listCustomizationRequests, listOrders, me } from '../../utils/api';
import { formatDateTime } from '../../utils/format';
import { getBaseUrl, setBaseUrl } from '../../utils/config';
import { CustomizationRequestDto, CustomerProfile } from '../../types/contracts';

interface RecentVM {
  id: string;
  requestNo: string;
  productName: string;
  statusLabel: string;
  createdAt: string;
}

Page({
  data: {
    nav: getNavMetrics(),
    loading: true,
    error: '',
    profile: null as CustomerProfile | null,
    nickname: '',
    phoneMasked: '',
    requestTotal: 0,
    orderTotal: 0,
    makingTotal: 0,
    statsLoaded: false,
    recent: [] as RecentVM[],
    recentError: '',
    baseUrl: '',
    baseUrlSaved: false
  },

  onLoad() {
    this.setData({ baseUrl: getBaseUrl() });
    this.load();
  },

  onShow() {
    if (this.data.profile && this.data.statsLoaded) {
      this.loadStats();
    }
  },

  load() {
    this.setData({ loading: true, error: '' });
    me()
      .then((profile) => {
        this.setData({
          loading: false,
          profile,
          nickname: profile.nickname || '顾客',
          phoneMasked: profile.phoneMasked || ''
        });
        this.loadStats();
      })
      .catch(() => {
        this.setData({ loading: false, error: '个人资料加载失败，请稍后重试' });
      });
  },

  loadStats() {
    Promise.all([
      listCustomizationRequests({ page: 1, pageSize: 3 }).catch(() => null),
      listOrders({ page: 1, pageSize: 1 }).catch(() => null),
      listCustomizationRequests({ status: 'IN_PRODUCTION', page: 1, pageSize: 1 }).catch(() => null)
    ])
      .then((res) => {
        const reqPage = res[0];
        const orderPage = res[1];
        const makingPage = res[2];
        const recent: RecentVM[] = reqPage
          ? (reqPage.items || []).map((dto: CustomizationRequestDto) => ({
              id: dto.id,
              requestNo: dto.requestNo,
              productName: dto.productName,
              statusLabel: dto.statusLabel,
              createdAt: formatDateTime(dto.createdAt)
            }))
          : [];
        this.setData({
          requestTotal: reqPage ? reqPage.total : 0,
          orderTotal: orderPage ? orderPage.total : 0,
          makingTotal: makingPage ? makingPage.total : 0,
          recent,
          recentError: reqPage ? '' : '定制记录加载失败',
          statsLoaded: true
        });
      });
  },

  reload() {
    this.load();
  },

  goRequests() {
    wx.navigateTo({ url: '/pages/requests/requests' });
  },

  goOrders() {
    wx.navigateTo({ url: '/pages/orders/orders' });
  },

  goRequestDetail(e: { currentTarget: { dataset: Record<string, string> } }) {
    const id = String(e.currentTarget.dataset.id || '');
    if (!id) {
      return;
    }
    wx.navigateTo({ url: '/pages/request-detail/request-detail?id=' + id });
  },

  goGuide(e: { currentTarget: { dataset: Record<string, string> } }) {
    const slug = String(e.currentTarget.dataset.slug || '');
    if (!slug) {
      return;
    }
    wx.navigateTo({ url: '/pages/' + slug + '/' + slug });
  },

  goContact() {
    wx.navigateTo({ url: '/pages/contact/contact' });
  },

  goCategory() {
    wx.switchTab({ url: '/pages/category/category' });
  },

  onBaseUrlInput(e: { detail: { value: string } }) {
    this.setData({ baseUrl: e.detail.value, baseUrlSaved: false });
  },

  saveBaseUrl() {
    const url = String(this.data.baseUrl || '').trim();
    if (!/^https?:\/\/.+/i.test(url)) {
      wx.showToast({ title: '请填写以 http(s):// 开头的地址', icon: 'none', duration: 2000 });
      return;
    }
    setBaseUrl(url);
    this.setData({ baseUrl: getBaseUrl(), baseUrlSaved: true });
    wx.showToast({ title: '服务器地址已保存', icon: 'success', duration: 1200 });
  }
});
