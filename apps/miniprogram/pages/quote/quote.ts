// 报价查看与确认
import { getNavMetrics } from '../../utils/nav';
import { confirmQuote, getCustomizationRequest } from '../../utils/api';
import { formatDateTime, formatCents, validUntilText } from '../../utils/format';
import { CustomizationRequestDto, QuoteDto } from '../../types/contracts';

Page({
  data: {
    nav: getNavMetrics(),
    loading: true,
    error: '',
    dto: null as CustomizationRequestDto | null,
    quote: null as QuoteDto | null,
    amount: '',
    freight: '',
    total: '',
    valid: '',
    version: 0,
    confirming: false
  },

  onLoad(query: Record<string, string | undefined>) {
    const id = query && query.id ? String(query.id) : '';
    if (!id) {
      this.setData({ loading: false, error: '缺少申请参数' });
      return;
    }
    this.load(id);
  },

  onShow() {
    if (this.data.dto) {
      this.load(this.data.dto.id);
    }
  },

  load(id: string) {
    this.setData({ loading: true, error: '' });
    getCustomizationRequest(id)
      .then((dto) => {
        const quote = dto.activeQuote || null;
        this.setData({
          loading: false,
          dto,
          quote,
          amount: quote ? '¥' + formatCents(quote.amountCents) : '',
          freight: quote ? '¥' + formatCents(quote.freightCents) : '',
          total: quote ? '¥' + formatCents(quote.totalCents) : '',
          valid: quote ? validUntilText(quote.validUntil) : '',
          version: quote ? quote.version : 0
        });
      })
      .catch(() => {
        this.setData({ loading: false, error: '报价加载失败，请稍后重试' });
      });
  },

  reload() {
    const dto = this.data.dto as CustomizationRequestDto | null;
    if (dto) {
      this.load(dto.id);
    }
  },

  goBack() {
    wx.navigateBack();
  },

  confirm() {
    if (this.data.confirming) {
      return;
    }
    const dto = this.data.dto as CustomizationRequestDto | null;
    const quote = this.data.quote as QuoteDto | null;
    if (!dto || !quote) {
      return;
    }
    this.setData({ confirming: true });
    confirmQuote(dto.id, quote.id, quote.version)
      .then(() => {
        this.setData({ confirming: false });
        wx.showToast({ title: '报价已确认', icon: 'success', duration: 1400 });
        setTimeout(() => {
          this.load(dto.id);
        }, 900);
      })
      .catch(() => {
        this.setData({ confirming: false });
        // 版本冲突或报价失效时，刷新为最新报价
        this.load(dto.id);
      });
  },

  goContact() {
    wx.navigateTo({ url: '/pages/contact/contact' });
  },

  goRequest() {
    const dto = this.data.dto as CustomizationRequestDto | null;
    if (!dto) {
      return;
    }
    wx.redirectTo({ url: '/pages/request-detail/request-detail?id=' + dto.id });
  }
});
