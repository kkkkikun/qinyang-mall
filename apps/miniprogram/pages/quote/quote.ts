// 报价查看与确认
import { getNavMetrics } from '../../utils/nav';
import { confirmQuote, getCustomizationRequest, rejectQuote } from '../../utils/api';
import { formatDateTime, formatCents, isQuoteExpired, validUntilText } from '../../utils/format';
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
    confirming: false,
    rejecting: false,
    /** 报价是否已过有效期：过期后按钮要禁用，而不是点了再被后端拒绝 */
    expired: false,
    /** 报价时间的本地化文案（此前直接输出 ISO 串） */
    createdAtText: ''
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
          version: quote ? quote.version : 0,
          expired: quote ? isQuoteExpired(quote.validUntil) : false,
          createdAtText: quote ? formatDateTime(quote.createdAt) : ''
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
    if (this.data.confirming || this.data.expired) {
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

  /**
   * 拒绝报价：申请回到待报价，等待店员重新报价。
   * 量体资料与联系方式都会保留，顾客不需要重新填一遍。
   */
  reject() {
    /*
     * 注意：**过期也要允许拒绝**。
     *
     * 此前这里和「确认」一样用 expired 拦住了，于是过期态下
     * 那个「请商家重新报价」按钮点了毫无反应 ——
     * 顾客既不能确认也不能拒绝，申请永远卡在「待确认报价」，
     * 只能自己找客服。
     *
     * 服务端的拒绝接口本来就不校验有效期（拒绝过期报价是合理的），
     * 这里与它对齐。
     */
    if (this.data.rejecting) {
      return;
    }
    const dto = this.data.dto as CustomizationRequestDto | null;
    const quote = this.data.quote as QuoteDto | null;
    if (!dto || !quote) {
      return;
    }
    wx.showModal({
      title: '不接受这份报价？',
      content: '我们会把你本次的量体资料一并转给商家重新报价，你不需要重新填写。',
      confirmText: '请商家重新报价',
      cancelText: '再想想',
      success: (res) => {
        if (!res.confirm) {
          return;
        }
        this.setData({ rejecting: true });
        rejectQuote(dto.id, quote.id, quote.version)
          .then(() => {
            this.setData({ rejecting: false });
            wx.showToast({ title: '已告知商家重新报价', icon: 'none', duration: 1600 });
            setTimeout(() => {
              this.load(dto.id);
            }, 900);
          })
          .catch(() => {
            this.setData({ rejecting: false });
            this.load(dto.id);
          });
      }
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
