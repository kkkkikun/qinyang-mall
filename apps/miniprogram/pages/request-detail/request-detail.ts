// 定制申请详情：量体资料 + 当前报价 + 申请状态
import { getNavMetrics } from '../../utils/nav';
import { cancelRequest, getCustomizationRequest } from '../../utils/api';
import { formatDateTime, priceText, validUntilText } from '../../utils/format';
import {
  CustomizationRequestDto,
  MeasurementSection,
  RequestStatus,
  REQUEST_STATUS_LABELS
} from '../../types/contracts';

interface MeasurementRowVM {
  name: string;
  value: string;
  unit: string;
  typeLabel: string;
}

interface SectionVM {
  key: string;
  title: string;
  typeLabel: string;
  description: string;
  rows: MeasurementRowVM[];
}

/**
 * 允许顾客自行取消的申请状态。
 *
 * 与服务端 `cancelByCustomer` 的白名单保持一致：
 * 已报价、已确认、已建单的申请不再允许顾客单方面取消（需联系客服），
 * 否则页面上会出现「点了必然报错」的死按钮。
 */
const CANCELLABLE: RequestStatus[] = [
  RequestStatus.PENDING_REVIEW,
  RequestStatus.PENDING_QUOTE
];

function buildSections(dto: CustomizationRequestDto): SectionVM[] {
  const snapshot = dto.measurements;
  const sections: MeasurementSection[] = (snapshot && snapshot.sections) || [];
  const fields = (snapshot && snapshot.fields) || [];
  return sections.map((section) => {
    const rows: MeasurementRowVM[] = (section.measurementFields || []).map((f) => {
      const hit = fields.filter((v) => v.fieldCode === f.fieldCode)[0];
      return {
        name: f.fieldName,
        value: hit && hit.value !== null ? String(hit.value) : '未填写',
        unit: hit ? hit.unit : f.unit,
        typeLabel: f.measurementType === 'garment_flat' ? '成衣平量' : '身体测量'
      };
    });
    return {
      key: section.sectionId,
      title: section.title,
      typeLabel: section.measurementType === 'garment_flat' ? '合身衣物平铺测量' : '身体测量',
      description: section.description || '',
      rows
    };
  });
}

Page({
  data: {
    nav: getNavMetrics(),
    loading: true,
    error: '',
    dto: null as CustomizationRequestDto | null,
    sections: [] as SectionVM[],
    statusLabel: '',
    createdAtText: '',
    canCancel: false,
    cancelling: false,
    quoteAmount: '',
    quoteFreight: '',
    quoteEmptyText: '商家尚未报价，请耐心等待审核结果。',
    quoteTotal: '',
    quoteValid: '',
    quoteVersion: 0,
    imgErr: false
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
        const quote = dto.activeQuote;
        this.setData({
          loading: false,
          dto,
          sections: buildSections(dto),
          statusLabel: dto.statusLabel || REQUEST_STATUS_LABELS[dto.status] || dto.status,
          createdAtText: formatDateTime(dto.createdAt),
          canCancel: CANCELLABLE.indexOf(dto.status) >= 0,
          quoteAmount: quote ? priceText(quote.amountCents) : '',
          quoteFreight: quote ? priceText(quote.freightCents) : '',
          quoteTotal: quote ? priceText(quote.totalCents) : '',
          quoteValid: quote ? validUntilText(quote.validUntil) : '',
          quoteVersion: quote ? quote.version : 0,
          /** 报价区空态文案要区分「还没报价」和「报价已被撤回/拒绝」 */
          quoteEmptyText:
            dto.status === RequestStatus.PENDING_QUOTE
              ? '商家尚未报价，请耐心等待审核结果。'
              : dto.status === RequestStatus.PENDING_REVIEW
                ? '申请已提交，等待店员审核。'
                : '当前没有可展示的报价，如有疑问请联系客服。'
        });
      })
      .catch(() => {
        this.setData({ loading: false, error: '申请详情加载失败，可能无权查看或已失效' });
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

  onImgErr() {
    this.setData({ imgErr: true });
  },

  goQuote() {
    const dto = this.data.dto as CustomizationRequestDto | null;
    if (!dto) {
      return;
    }
    wx.navigateTo({ url: '/pages/quote/quote?id=' + dto.id });
  },

  goProduct() {
    const dto = this.data.dto as CustomizationRequestDto | null;
    if (!dto) {
      return;
    }
    wx.navigateTo({ url: '/pages/product/product?id=' + dto.productId });
  },

  goContact() {
    wx.navigateTo({ url: '/pages/contact/contact' });
  },

  cancel() {
    if (this.data.cancelling) {
      return;
    }
    const dto = this.data.dto as CustomizationRequestDto | null;
    if (!dto) {
      return;
    }
    wx.showModal({
      title: '取消定制申请',
      content: '确认取消该定制申请？已提交的量体资料将不再用于制作。',
      confirmColor: '#CD9150',
      success: (res) => {
        if (!res.confirm) {
          return;
        }
        this.setData({ cancelling: true });
        cancelRequest(dto.id)
          .then(() => {
            this.setData({ cancelling: false });
            wx.showToast({ title: '已取消', icon: 'success', duration: 1200 });
            this.load(dto.id);
          })
          .catch(() => {
            this.setData({ cancelling: false });
          });
      }
    });
  }
});
