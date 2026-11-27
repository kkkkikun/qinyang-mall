// 商品详情：多图轮播 + 品牌带 + 价格/报价状态 + 参数 + 品牌故事 + 底部操作栏
import { getNavMetrics } from '../../utils/nav';
import { product } from '../../utils/api';
import { priceText } from '../../utils/format';
import { MediaDto, ProductDetail, ProductStatus } from '../../types/contracts';

interface MediaVM {
  key: string;
  url: string;
  /** 缩略图网格用小图；没有变体时回退到 url */
  thumbUrl: string;
  role: string;
  roleLabel: string;
  failed: boolean;
}

const ROLE_LABELS: Record<string, string> = {
  COVER: '商品主图',
  FRONT: '正面',
  BACK: '背面',
  DETAIL: '细节',
  FABRIC: '面料',
  MODEL: '模特',
  FLATLAY: '平铺',
  SIZE_CHART: '尺码图',
  DESCRIPTION: '描述图',
  OTHER: '其他'
};

Page({
  data: {
    nav: getNavMetrics(),
    loading: true,
    error: '',
    detail: null as ProductDetail | null,
    media: [] as MediaVM[],
    priceLabel: '',
    pricePending: false,
    galleryHeight: 0,
    galleryIndex: 1,
    isOffline: false,
    descText: '',
    materialText: '',
    careText: '',
    templateName: ''
  },

  onLoad(query: Record<string, string | undefined>) {
    const id = query && query.id ? String(query.id) : '';
    if (!id) {
      this.setData({ loading: false, error: '缺少商品参数' });
      return;
    }
    this.load(id);
  },

  onShareAppMessage() {
    const detail = this.data.detail as ProductDetail | null;
    return {
      title: detail ? 'QINYANG｜' + detail.name : '琴扬精纺羊绒',
      path: '/pages/product/product?id=' + (detail ? detail.id : '')
    };
  },

  load(id: string) {
    this.setData({ loading: true, error: '' });
    product(id)
      .then((detail) => {
        const media: MediaVM[] = (detail.media || [])
          .slice()
          .sort((a: MediaDto, b: MediaDto) => a.sortOrder - b.sortOrder)
          .map((m: MediaDto, i: number) => ({
            key: m.id || 'm' + i,
            url: m.url,
            thumbUrl: m.thumbUrl || m.url,
            role: m.role,
            roleLabel: ROLE_LABELS[m.role] || '实拍',
            failed: false
          }));
        const nav = getNavMetrics();
        this.setData({
          loading: false,
          detail,
          media,
          priceLabel: priceText(detail.priceCents),
          pricePending: detail.priceCents === null || detail.priceCents === undefined,
          // 4:5 满幅：与商品图 4x5 变体一致。
          // 此前是 windowWidth 的正方形 + aspectFit，竖图被 contain 进方框，
          // 左右上下各留一条灰底空带，主视觉像「小图浮在灰底上」。
          galleryHeight: Math.round(nav.windowWidth * 1.25),
          isOffline: detail.status === ProductStatus.OFFLINE,
          descText: detail.description || '',
          materialText: detail.material || '',
          careText: detail.careGuide || '',
          templateName: detail.measurementTemplateName || ''
        });
      })
      .catch(() => {
        this.setData({ loading: false, error: '商品加载失败，可能已下架或网络异常' });
      });
  },

  reload() {
    const detail = this.data.detail as ProductDetail | null;
    if (detail) {
      this.load(detail.id);
    }
  },

  goBack() {
    wx.navigateBack();
  },

  onGalleryChange(e: { detail: { current: number } }) {
    this.setData({ galleryIndex: e.detail.current + 1 });
  },

  onMediaErr(e: { currentTarget: { dataset: Record<string, string> } }) {
    const index = String(e.currentTarget.dataset.index || '0');
    this.setData({ ['media[' + index + '].failed']: true });
  },

  preview(e: { currentTarget: { dataset: Record<string, string> } }) {
    const index = Number(e.currentTarget.dataset.index || 0);
    const media = this.data.media as MediaVM[];
    const urls = media.map((m) => m.url).filter((u) => !!u);
    if (!urls.length) {
      return;
    }
    const current = media[index] ? media[index].url : urls[0];
    wx.previewImage({ current, urls });
  },

  goApply() {
    const detail = this.data.detail as ProductDetail | null;
    if (!detail) {
      return;
    }
    wx.navigateTo({ url: '/pages/apply/apply?productId=' + detail.id });
  },

  goGuide() {
    wx.navigateTo({ url: '/pages/guide-top/guide-top' });
  },

  goContact() {
    wx.navigateTo({ url: '/pages/contact/contact' });
  }
});
