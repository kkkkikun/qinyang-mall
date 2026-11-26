// 我的定制申请列表（状态筛选页签）
import { getNavMetrics } from '../../utils/nav';
import { listCustomizationRequests } from '../../utils/api';
import { formatDateTime, priceText } from '../../utils/format';
import { CustomizationRequestDto, REQUEST_STATUS_LABELS, RequestStatus } from '../../types/contracts';

interface TabVM {
  key: string;
  label: string;
}

interface RequestVM {
  id: string;
  requestNo: string;
  productName: string;
  coverUrl: string;
  statusLabel: string;
  status: string;
  templateName: string;
  createdAt: string;
  quoteLabel: string;
  failed: boolean;
}

const PAGE_SIZE = 20;

function buildTabs(): TabVM[] {
  const tabs: TabVM[] = [{ key: '', label: '全部' }];
  const keys = Object.keys(REQUEST_STATUS_LABELS) as RequestStatus[];
  keys.forEach((key) => {
    tabs.push({ key, label: REQUEST_STATUS_LABELS[key] });
  });
  return tabs;
}

function toVM(dto: CustomizationRequestDto): RequestVM {
  const quote = dto.activeQuote;
  return {
    id: dto.id,
    requestNo: dto.requestNo,
    productName: dto.productName,
    coverUrl: dto.productCoverUrl || '',
    status: dto.status,
    statusLabel: dto.statusLabel || REQUEST_STATUS_LABELS[dto.status] || dto.status,
    templateName: dto.templateName,
    createdAt: formatDateTime(dto.createdAt),
    quoteLabel: quote ? priceText(quote.totalCents) : '',
    failed: false
  };
}

Page({
  data: {
    nav: getNavMetrics(),
    tabs: buildTabs(),
    status: '',
    items: [] as RequestVM[],
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
    const detail = this.data.items as RequestVM[];
    if (detail.length) {
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
    listCustomizationRequests({ status: status || undefined, page, pageSize: PAGE_SIZE })
      .then((res) => {
        const cards = (res.items || []).map((dto) => toVM(dto));
        const items = reset ? cards : (this.data.items as RequestVM[]).concat(cards);
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
          error: reset ? '定制申请加载失败，请稍后重试' : ''
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
    wx.navigateTo({ url: '/pages/request-detail/request-detail?id=' + id });
  },

  goCustom() {
    wx.switchTab({ url: '/pages/custom/custom' });
  },

  goBack() {
    wx.navigateBack();
  }
});
