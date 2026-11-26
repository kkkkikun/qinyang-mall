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

/** 允许顾客取消的申请状态（对齐契约 REQUEST_STATUS_TRANSITIONS） */
const CANCELLABLE: RequestStatus[] = [
  RequestStatus.PENDING_REVIEW,
  RequestStatus.PENDING_QUOTE,
  RequestStatus.QUOTED,
  RequestStatus.CONFIRMED,
  RequestStatus.IN_PRODUCTION
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
          quoteTotal: quote ? priceText(quote.totalCents) : '',
          quoteValid: quote ? validUntilText(quote.validUntil) : '',
          quoteVersion: quote ? quote.version : 0
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
