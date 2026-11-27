// 商品搜索：搜索框 + 热门搜索 + 无结果退路
import { getNavMetrics } from '../../utils/nav';
import { categories, products } from '../../utils/api';
import { ProductCardVM, toProductCards } from '../../utils/product';
import { CategoryDto } from '../../types/contracts';

const PAGE_SIZE = 20;

/** 店内常用检索词（与商品命名一致，不含未确认信息） */
const HOT_KEYWORDS = ['开衫', '羊绒衫', '针织衫', '大衣', '长裤', '围巾'];

Page({
  data: {
    nav: getNavMetrics(),
    keyword: '',
    hot: HOT_KEYWORDS,
    cats: [] as CategoryDto[],
    items: [] as ProductCardVM[],
    searched: false,
    loading: false,
    error: '',
    /** 命中总数（可能大于当前展示的 items.length） */
    total: 0,
    imgErr: {} as Record<string, boolean>
  },

  onLoad() {
    categories()
      .then((list) => {
        const names = (list || [])
          .filter((c: CategoryDto) => c.status === 'ACTIVE' && !c.parentId)
          .map((c: CategoryDto) => c.name);
        this.setData({ hot: HOT_KEYWORDS.concat(names).slice(0, 12) });
      })
      .catch(() => {
        this.setData({ hot: HOT_KEYWORDS });
      });
  },

  onInput(e: { detail: { value: string } }) {
    this.setData({ keyword: e.detail.value });
  },

  onConfirm() {
    this.doSearch(this.data.keyword);
  },

  onHotTap(e: { currentTarget: { dataset: Record<string, string> } }) {
    const word = String(e.currentTarget.dataset.word || '');
    if (!word) {
      return;
    }
    this.setData({ keyword: word });
    this.doSearch(word);
  },

  /**
   * 请求序号：只认最后一次搜索。
   *
   * 连续输入「羊绒」→「羊绒衫」时，先发的请求后返回就会把
   * 旧结果写进列表 —— 搜索框里是「羊绒衫」，列表却是「羊绒」的结果。
   */
  _seq: 0,

  doSearch(keyword: string) {
    const word = (keyword || '').trim();
    if (!word) {
      this.setData({ searched: false, items: [], keyword: '' });
      return;
    }
    this.setData({ loading: true, error: '', searched: true, items: [], keyword: word, imgErr: {} });
    this._seq += 1;
    const seq = this._seq;
    products({ keyword: word, page: 1, pageSize: PAGE_SIZE })
      .then((res) => {
        if (seq !== this._seq) {
          return; // 已有更新的搜索发出，这次响应作废
        }
        const items = toProductCards(res.items || []);
        const total = res.total || items.length;
        this.setData({ loading: false, items, total });
        // 命中数超过一页时明确告诉顾客「还有更多」，
        // 否则顾客只会以为搜索结果就这么多
        if (total > items.length) {
          wx.showToast({
            title: `找到 ${total} 件，已显示前 ${items.length} 件`,
            icon: 'none',
            duration: 1800
          });
        }
      })
      .catch(() => {
        if (seq !== this._seq) {
          return;
        }
        this.setData({ loading: false, error: '搜索失败，请检查网络后重试' });
      });
  },

  clearSearch() {
    this.setData({ keyword: '', searched: false, items: [], error: '', imgErr: {} });
  },

  goCategory() {
    wx.switchTab({ url: '/pages/category/category' });
  },

  goCustom() {
    wx.switchTab({ url: '/pages/custom/custom' });
  },

  goProduct(e: { currentTarget: { dataset: Record<string, string> } }) {
    const id = String(e.currentTarget.dataset.id || '');
    if (!id) {
      return;
    }
    wx.navigateTo({ url: '/pages/product/product?id=' + id });
  },

  goBack() {
    wx.navigateBack();
  },

  onImgErr(e: { currentTarget: { dataset: Record<string, string> } }) {
    const index = String(e.currentTarget.dataset.index || '0');
    this.setData({ ['imgErr[' + index + ']']: true });
  }
});
