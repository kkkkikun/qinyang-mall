// 品牌首页：羊绒衣橱自动轮播 + 分类入口 + 新品/推荐 + 定制引导 + 品牌故事
import { getNavMetrics } from '../../utils/nav';
import { banners, categories, products } from '../../utils/api';
import { ProductCardVM, toProductCards } from '../../utils/product';
import { BannerDto, CategoryDto } from '../../types/contracts';

interface WardrobeItem {
  id: string;
  image: string;
  title: string;
  linkType: string;
  linkValue: string;
}

interface HeroVM extends ProductCardVM {
  subtitleLine: string;
}

Page({
  data: {
    nav: getNavMetrics(),
    loading: true,
    error: '',
    cats: [] as CategoryDto[],
    wardrobe: [] as WardrobeItem[],
    hero: null as HeroVM | null,
    picks: [] as ProductCardVM[],
    more: [] as ProductCardVM[],
    heroHeight: 0,
    wardrobeHeight: 0,
    imgErr: { hero: false, pick: {}, more: {} }
  },

  onLoad() {
    this.load();
  },

  onPullDownRefresh() {
    this.load().then(() => {
      wx.stopPullDownRefresh();
    });
  },

  onShareAppMessage() {
    return {
      title: '琴扬精纺羊绒 · 专属定制',
      path: '/pages/index/index'
    };
  },

  load() {
    this.setData({ loading: true, error: '' });
    const nav = getNavMetrics();
    const width = nav.windowWidth;
    Promise.all([
      categories().catch(() => [] as CategoryDto[]),
      banners().catch(() => [] as BannerDto[]),
      // 首页只用 15 张（1 主视觉 + 4 推荐 + 10 更多），多取 5 张是白白的图片流量
      products({ page: 1, pageSize: 15 }).catch(() => null)
    ])
      .then((res) => {
        const catList = (res[0] || []).filter((c) => c.status === 'ACTIVE');
        const topCats = catList.filter((c) => !c.parentId);
        const bannerList = res[1] || [];
        const page = res[2];
        const cards = page ? toProductCards(page.items) : [];

        const wardrobe: WardrobeItem[] = bannerList
          .filter((b) => b.status === 'ACTIVE')
          .map((b) => ({
            id: b.id,
            image: b.imageUrl,
            title: b.title,
            linkType: b.linkType,
            linkValue: b.linkValue || ''
          }));

        const hero = cards.length ? cards[0] : null;
        const picks = cards.slice(1, 5);
        const more = cards.slice(5, 15);

        // 轮播没有配置时，用推荐商品图兜底，保证轮播区不空
        const fallbackWardrobe: WardrobeItem[] = picks.map((p, i) => ({
          id: p.id,
          image: p.coverUrl,
          title: p.name,
          linkType: 'PRODUCT',
          linkValue: p.id
        }));
        const finalWardrobe = wardrobe.length ? wardrobe : fallbackWardrobe;

        this.setData({
          loading: false,
          cats: topCats,
          wardrobe: finalWardrobe,
          hero: hero ? { ...hero, subtitleLine: hero.categoryName || '专属定制' } : null,
          picks,
          more,
          heroHeight: Math.round(width * 1.25),
          wardrobeHeight: Math.round(width * 1.32),
          imgErr: { hero: false, pick: {}, more: {} }
        });
      })
      .catch(() => {
        this.setData({ loading: false, error: '页面数据加载失败，请稍后重试' });
      });
  },

  reload() {
    this.load();
  },

  onImgErr(e: { currentTarget: { dataset: Record<string, string> } }) {
    const target = String(e.currentTarget.dataset.target || '');
    const index = String(e.currentTarget.dataset.index || '0');
    this.setData({ ['imgErr.' + target + '[' + index + ']']: true });
  },

  goSearch() {
    wx.navigateTo({ url: '/pages/search/search' });
  },

  goCategory(e: { currentTarget: { dataset: Record<string, string> } }) {
    const id = String(e.currentTarget.dataset.id || '');
    wx.switchTab({
      url: '/pages/category/category',
      success: () => {
        // 分类页为 tab 页，通过事件参数传递选中分类
        const pages = getCurrentPages();
        const target = pages[pages.length - 1] as unknown as { receiveCategory?: (id: string) => void };
        if (target && typeof target.receiveCategory === 'function') {
          target.receiveCategory(id);
        }
      }
    });
  },

  goProduct(e: { currentTarget: { dataset: Record<string, string> } }) {
    const id = String(e.currentTarget.dataset.id || '');
    if (!id) {
      return;
    }
    wx.navigateTo({ url: '/pages/product/product?id=' + id });
  },

  onWardrobeTap(e: { currentTarget: { dataset: Record<string, string> } }) {
    const linkType = String(e.currentTarget.dataset.linktype || 'NONE');
    const linkValue = String(e.currentTarget.dataset.linkvalue || '');
    if (linkType === 'PRODUCT' && linkValue) {
      wx.navigateTo({ url: '/pages/product/product?id=' + linkValue });
      return;
    }
    if (linkType === 'CATEGORY' && linkValue) {
      this.goCategory({ currentTarget: { dataset: { id: linkValue } } });
      return;
    }
    if (linkType === 'PAGE' && linkValue) {
      const slug = linkValue.replace(/^pages\//, '');
      const target = slug.indexOf('guide') === 0 ? '/pages/' + slug + '/' + slug : '/pages/index/index';
      wx.navigateTo({ url: target });
    }
  },

  goGuide(e: { currentTarget: { dataset: Record<string, string> } }) {
    const slug = String(e.currentTarget.dataset.slug || '');
    if (!slug) {
      return;
    }
    wx.navigateTo({ url: '/pages/' + slug + '/' + slug });
  },

  goCustom() {
    wx.switchTab({ url: '/pages/custom/custom' });
  },

  goOrders() {
    wx.navigateTo({ url: '/pages/orders/orders' });
  }
});
