// 我的订单列表
import { getNavMetrics } from '../../utils/nav';
import { listOrders } from '../../utils/api';
import { formatDateTime, priceText } from '../../utils/format';
import { ORDER_STATUS_LABELS, OrderListItemDto, OrderStatus } from '../../types/contracts';

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

function toVM(dto: OrderListItemDto): OrderVM {
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

  /**
   * 请求序号：只认最后一次发起的请求。
   *
   * 此前连续快速点两个页签时，A、B 两个请求并发，
   * **后返回的那个直接覆盖 items** —— 页签高亮停在「已完成」，
   * 列表里却是「已发货」的订单。顾客据此判断会出错。
   * 同理「加载更多」与「换页签」并发时，旧页的卡片会被 concat 进新列表。
   */
  _seq: 0,

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
    this._seq += 1;
    const seq = this._seq;
    listOrders({ status: status || undefined, page, pageSize: PAGE_SIZE })
      .then((res) => {
        if (seq !== this._seq) {
          // 已经有更新的请求发出，这次响应作废（不写数据、不改 loading）
          return;
        }
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
        if (seq !== this._seq) {
          return;
        }
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
