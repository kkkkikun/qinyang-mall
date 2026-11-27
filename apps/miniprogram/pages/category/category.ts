// 商品分类：左侧一级分类栏 + 顶部二级分组页签 + ⌄ 分组浮层
import { getNavMetrics } from '../../utils/nav';
import { categories, products } from '../../utils/api';
import { ProductCardVM, toProductCards } from '../../utils/product';
import { CategoryDto } from '../../types/contracts';

interface CatNode {
  id: string;
  code: string;
  name: string;
  count: number;
}

interface RailItem {
  key: string;
  id: string;
  code: string;
  name: string;
  count: number;
  type: 'head' | 'group' | 'cat';
  active: boolean;
}

const PAGE_SIZE = 20;
const VISIBLE_GROUPS = 3;

Page({
  data: {
    nav: getNavMetrics(),
    loading: true,
    loadingMore: false,
    error: '',
    topCats: [] as CatNode[],
    catAll: [] as CategoryDto[],
    groups: [] as CatNode[],
    rail: [] as RailItem[],
    tabs: [] as CatNode[],
    curCatId: '',
    curCatName: '',
    curCatCount: 0,
    curGroup: '',
    groupPop: false,
    items: [] as ProductCardVM[],
    page: 1,
    total: 0,
    hasMore: true,
    imgErr: {} as Record<string, boolean>
  },

  onLoad() {
    this.loadCategories();
  },

  onShow() {
    if (this.data.topCats.length && !this.data.loading) {
      // 从其他页面返回时保持当前分类，不重复请求
    }
  },

  onReachBottom() {
    this.loadMore();
  },

  onPullDownRefresh() {
    this.loadCategories().then(() => {
      wx.stopPullDownRefresh();
    });
  },

  /** 首页分类入口跳转过来时同步选中分类 */
  receiveCategory(id: string) {
    if (!id) {
      return;
    }
    this.setData({ curCatId: id, curGroup: '' });
    this.loadProducts(true);
  },

  loadCategories() {
    this.setData({ loading: true, error: '' });
    categories()
      .then((list) => {
        const active = (list || []).filter((c: CategoryDto) => c.status === 'ACTIVE');
        const tops = active
          .filter((c) => !c.parentId)
          .sort((a, b) => a.sortOrder - b.sortOrder)
          .map((c) => ({ id: c.id, code: c.code, name: c.name, count: c.productCount || 0 }));
        if (!tops.length) {
          this.setData({ loading: false, error: '暂无分类数据' });
          return;
        }
        /*
         * 默认分类落在**第一个有商品的一级分类**上。
         *
         * 此前直接取 `tops[0]`（按 sortOrder 第一个），而种子的分类树里
         * 「其他服装」排在最前却一件商品都没有 —— 顾客打开分类页第一眼是空列表，
         * 要自己横向滑动、找到有商品的分类才有内容。
         * 一级分类的商品数是向下汇总的（自身 + 所有下级分组），
         * 所以这里可以直接用 productCount 判断。
         */
        const cur =
          tops.filter((t) => t.id === this.data.curCatId)[0] ||
          tops.find((t) => (t.count ?? 0) > 0) ||
          tops[0];
        const groups = this.pickGroups(active, cur.id);
        this.setData({
          topCats: tops,
          catAll: active,
          curCatId: cur.id,
          curGroup: '',
          groups
        });
        this.refreshRail();
        this.loadProducts(true);
      })
      .catch(() => {
        this.setData({ loading: false, error: '分类加载失败，请稍后重试' });
      });
  },

  /** 取某一级分类下的二级分组：优先用 children，其次用 parentId 关联 */
  pickGroups(list: CategoryDto[], parentId: string): CatNode[] {
    const parent = list.filter((c) => c.id === parentId)[0];
    const fromChildren =
      parent && parent.children && parent.children.length
        ? parent.children.map((c) => ({ id: c.id, code: c.code, name: c.name, count: c.productCount || 0 }))
        : [];
    const fromFlat = list
      .filter((c) => c.parentId === parentId)
      .map((c) => ({ id: c.id, code: c.code, name: c.name, count: c.productCount || 0 }));
    const groups = fromChildren.length ? fromChildren : fromFlat;
    /*
     * 不再按名称字典序重排。
     *
     * 后端已经按商家的 `sortOrder` 排序返回（后台可设「数值越小越靠前」），
     * 此处再 `localeCompare` 一次，商家在后台排好的顺序就被覆盖成拼音序 ——
     * 运营配置完全失效。
     */
    return groups;
  },

  /** 左侧栏：当前一级分类 + 其二级分组 + 其他一级分类 */
  refreshRail() {
    const topCats = this.data.topCats as CatNode[];
    const groups = this.data.groups as CatNode[];
    const curCatId = this.data.curCatId;
    const curGroup = this.data.curGroup;
    const rail: RailItem[] = [];
    const cur = topCats.filter((t) => t.id === curCatId)[0];
    rail.push({
      key: 'head_' + curCatId,
      id: curCatId,
      code: cur ? cur.code : '',
      name: cur ? cur.name : '全部分类',
      count: cur ? cur.count : 0,
      type: 'head',
      active: true
    });
    groups.forEach((g) => {
      rail.push({ key: 'group_' + g.id, id: g.id, code: g.code, name: g.name, count: g.count, type: 'group', active: g.code === curGroup });
    });
    topCats
      .filter((t) => t.id !== curCatId)
      .forEach((t) => {
        rail.push({ key: 'cat_' + t.id, id: t.id, code: t.code, name: t.name, count: t.count, type: 'cat', active: false });
      });
    const tabs: CatNode[] = groups.slice(0, VISIBLE_GROUPS);
    this.setData({
      rail,
      tabs,
      curCatName: cur ? cur.name : '全部分类',
      curCatCount: cur ? cur.count : 0
    });
  },

  loadProducts(reset: boolean) {
    if (reset) {
      this.setData({ loading: true, error: '', page: 1, items: [], hasMore: true, imgErr: {} });
    } else {
      if (this.data.loadingMore || !this.data.hasMore) {
        return;
      }
      this.setData({ loadingMore: true });
    }
    const page = reset ? 1 : this.data.page + 1;
    const curCatId = this.data.curCatId;
    const curGroup = this.data.curGroup;
    products({ categoryId: curCatId, group: curGroup || undefined, page, pageSize: PAGE_SIZE })
      .then((res) => {
        const cards = toProductCards(res.items || []);
        const items = reset ? cards : (this.data.items as ProductCardVM[]).concat(cards);
        this.setData({
          loading: false,
          loadingMore: false,
          items,
          page: res.page || page,
          total: res.total || items.length,
          hasMore: items.length < (res.total || items.length),
          error: ''
        });
      })
      .catch(() => {
        this.setData({
          loading: false,
          loadingMore: false,
          error: reset ? '商品加载失败，请稍后重试' : ''
        });
      });
  },

  loadMore() {
    this.loadProducts(false);
  },

  reload() {
    this.loadCategories();
  },

  onImgErr(e: { currentTarget: { dataset: Record<string, string> } }) {
    const index = String(e.currentTarget.dataset.index || '0');
    this.setData({ ['imgErr[' + index + ']']: true });
  },

  pickCat(e: { currentTarget: { dataset: Record<string, string> } }) {
    const id = String(e.currentTarget.dataset.id || '');
    const code = String(e.currentTarget.dataset.code || '');
    const type = String(e.currentTarget.dataset.type || '');
    if (!id) {
      return;
    }
    if (type === 'cat') {
      const groups = this.pickGroups(this.data.catAll as CategoryDto[], id);
      this.setData({ curCatId: id, curGroup: '', groups });
      this.refreshRail();
      this.loadProducts(true);
      return;
    }
    if (type === 'group') {
      this.setData({ curGroup: this.data.curGroup === code ? '' : code });
      this.refreshRail();
      this.loadProducts(true);
    }
  },

  pickTab(e: { currentTarget: { dataset: Record<string, string> } }) {
    const code = String(e.currentTarget.dataset.code || '');
    this.setData({ curGroup: code });
    this.refreshRail();
    this.loadProducts(true);
  },

  toggleGroupPop() {
    this.setData({ groupPop: !this.data.groupPop });
  },

  closeGroupPop() {
    if (this.data.groupPop) {
      this.setData({ groupPop: false });
    }
  },

  goProduct(e: { currentTarget: { dataset: Record<string, string> } }) {
    const id = String(e.currentTarget.dataset.id || '');
    if (!id) {
      return;
    }
    wx.navigateTo({ url: '/pages/product/product?id=' + id });
  },

  goSearch() {
    wx.navigateTo({ url: '/pages/search/search' });
  }
});
