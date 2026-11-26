// 我的订单列表
import { getNavMetrics } from '../../utils/nav';
import { listOrders } from '../../utils/api';
import { formatDateTime, priceText } from '../../utils/format';
import { OrderDto, ORDER_STATUS_LABELS, OrderStatus } from '../../types/contracts';

interface TabVM {
  key: string;
  label: string;
}

interface OrderVM {
  id: string;
  orderNo: string;
  requestNo: string;
  productName: string;
  coverUrl: string;
  statusLabel: string;
  createdAt: string;
  total: string;
  failed: boolean;
}

const PAGE_SIZE = 20;

function buildTabs(): TabVM[] {
  const tabs: TabVM[] = [{ key: '', label: '全部' }];
  const keys = Object.keys(ORDER_STATUS_LABELS) as OrderStatus[];
  keys.forEach((key) => {
    tabs.push({ key, label: ORDER_STATUS_LABELS[key] });
  });
  return tabs;
}

function toVM(dto: OrderDto): OrderVM {
  const snapshot = dto.productSnapshot;
  return {
    id: dto.id,
    orderNo: dto.orderNo,
    requestNo: dto.requestNo,
    productName: snapshot ? snapshot.name : '定制商品',
    coverUrl: snapshot && snapshot.coverUrl ? snapshot.coverUrl : '',
    statusLabel: dto.statusLabel || ORDER_STATUS_LABELS[dto.status] || dto.status,
    createdAt: formatDateTime(dto.createdAt),
    total: priceText(dto.totalCents),
    failed: false
  };
}

Page({
  data: {
    nav: getNavMetrics(),
    tabs: buildTabs(),
    status: '',
    items: [] as OrderVM[],
    loading: true,
    loadingMore: false,
    error: '',
    page: 1,
    total: 0,
    hasMore: true,
    imgErr: {} as Record<string, boolean>
  },

  onLoad() {
    this.load(true);
  },

  onShow() {
    if ((this.data.items as OrderVM[]).length) {
      this.load(true);
    }
  },

  onReachBottom() {
    this.load(false);
  },

  onPullDownRefresh() {
    this.load(true).then(() => {
      wx.stopPullDownRefresh();
    });
  },

  switchTab(e: { currentTarget: { dataset: Record<string, string> } }) {
    const key = String(e.currentTarget.dataset.key || '');
    if (key === this.data.status) {
      return;
    }
    this.setData({ status: key });
    this.load(true);
  },

  load(reset: boolean) {
    if (reset) {
      this.setData({ loading: true, error: '', page: 1, items: [], hasMore: true, imgErr: {} });
    } else {
      if (this.data.loadingMore || !this.data.hasMore) {
        return;
      }
      this.setData({ loadingMore: true });
    }
    const page = reset ? 1 : this.data.page + 1;
    const status = this.data.status;
    listOrders({ status: status || undefined, page, pageSize: PAGE_SIZE })
      .then((res) => {
        const cards = (res.items || []).map(toVM);
        const items = reset ? cards : (this.data.items as OrderVM[]).concat(cards);
        this.setData({
          loading: false,
          loadingMore: false,
          items,
          page: res.page || page,
          total: res.total || items.length,
          hasMore: items.length < (res.total || items.length)
        });
      })
      .catch(() => {
        this.setData({
          loading: false,
          loadingMore: false,
          error: reset ? '订单加载失败，请稍后重试' : ''
        });
      });
  },

  reload() {
    this.load(true);
  },

  onImgErr(e: { currentTarget: { dataset: Record<string, string> } }) {
    const index = String(e.currentTarget.dataset.index || '0');
    this.setData({ ['imgErr[' + index + ']']: true });
  },

  goDetail(e: { currentTarget: { dataset: Record<string, string> } }) {
    const id = String(e.currentTarget.dataset.id || '');
    if (!id) {
      return;
    }
    wx.navigateTo({ url: '/pages/order-detail/order-detail?id=' + id });
  },

  goCustom() {
    wx.switchTab({ url: '/pages/custom/custom' });
  },

  goBack() {
    wx.navigateBack();
  }
});
