// 订单详情：状态时间线 + 商品/量体快照 + 金额 + 物流
import { getNavMetrics } from '../../utils/nav';
import { getOrder } from '../../utils/api';
import { formatDateTime, formatCents } from '../../utils/format';
import { OrderDto, OrderEventDto, ORDER_STATUS_LABELS } from '../../types/contracts';

interface EventVM {
  key: string;
  title: string;
  time: string;
  note: string;
  operator: string;
  last: boolean;
}

interface MeasurementRowVM {
  name: string;
  value: string;
  unit: string;
}

Page({
  data: {
    nav: getNavMetrics(),
    loading: true,
    error: '',
    order: null as OrderDto | null,
    statusLabel: '',
    createdAtText: '',
    events: [] as EventVM[],
    measurements: [] as MeasurementRowVM[],
    amount: '',
    freight: '',
    total: '',
    imgErr: false
  },

  onLoad(query: Record<string, string | undefined>) {
    const id = query && query.id ? String(query.id) : '';
    if (!id) {
      this.setData({ loading: false, error: '缺少订单参数' });
      return;
    }
    this.load(id);
  },

  onShow() {
    if (this.data.order) {
      this.load(this.data.order.id);
    }
  },

  load(id: string) {
    this.setData({ loading: true, error: '' });
    getOrder(id)
      .then((dto) => {
        const list = (dto.events || []).slice();
        const events: EventVM[] = list.map((e: OrderEventDto, i: number) => ({
          key: e.id || 'e' + i,
          title: ORDER_STATUS_LABELS[e.toStatus] || e.toStatus,
          time: formatDateTime(e.createdAt),
          note: e.note || '',
          operator: e.operatorName || '',
          last: i === list.length - 1
        }));
        const snapshot = dto.measurementSnapshot;
        const measurements: MeasurementRowVM[] = ((snapshot && snapshot.fields) || []).map((f) => ({
          name: f.fieldName,
          value: f.value === null ? '未填写' : String(f.value),
          unit: f.unit
        }));
        this.setData({
          loading: false,
          order: dto,
          statusLabel: dto.statusLabel || ORDER_STATUS_LABELS[dto.status] || dto.status,
          createdAtText: formatDateTime(dto.createdAt),
          events,
          measurements,
          amount: '¥' + formatCents(dto.amountCents),
          freight: '¥' + formatCents(dto.freightCents),
          total: '¥' + formatCents(dto.totalCents)
        });
      })
      .catch(() => {
        this.setData({ loading: false, error: '订单加载失败，可能无权查看或已失效' });
      });
  },

  reload() {
    const order = this.data.order as OrderDto | null;
    if (order) {
      this.load(order.id);
    }
  },

  goBack() {
    wx.navigateBack();
  },

  onImgErr() {
    this.setData({ imgErr: true });
  },

  goProduct() {
    const order = this.data.order as OrderDto | null;
    if (!order || !order.productSnapshot) {
      return;
    }
    wx.navigateTo({ url: '/pages/product/product?id=' + order.productSnapshot.id });
  },

  goRequest() {
    const order = this.data.order as OrderDto | null;
    if (!order) {
      return;
    }
    wx.navigateTo({ url: '/pages/request-detail/request-detail?id=' + order.requestId });
  },

  goContact() {
    wx.navigateTo({ url: '/pages/contact/contact' });
  }
});
