/**
 * 页面跳转白名单。
 *
 * 背景（本轮审计 P1-5）：
 * 首页轮播的「跳转目标（PAGE）」此前在客户端**猜**路径：
 *
 * ```ts
 * const slug = linkValue.replace(/^pages\//, '');
 * const target = slug.indexOf('guide') === 0 ? '/pages/' + slug + '/' + slug : '/pages/index/index';
 * wx.navigateTo({ url: target });
 * ```
 *
 * 后台按自己的占位符填 `/pages/category/index`（**带**前导斜杠）→ 正则匹配不到
 * → 落到 `/pages/index/index`，而那是 tabBar 页
 * → 微信报 `navigateTo:fail can not navigateTo a tabbar page`
 * → **顾客点了完全没反应**，也没有任何报错。
 * 即使填对成 `guide-care` 之外的裸 slug，也会拼成不存在的路径，静默失败。
 *
 * 现在改成白名单映射：能解析就跳，解析不了就明确告诉顾客「该功能暂未开放」，
 * 绝不出现「点了没反应」。
 */

/** tabBar 页面：必须用 switchTab 跳转 */
const TAB_PAGES = [
  '/pages/index/index',
  '/pages/category/category',
  '/pages/custom/custom',
  '/pages/profile/profile'
];

/** 可用 navigateTo 打开的普通页面 */
const NORMAL_PAGES = [
  '/pages/search/search',
  '/pages/product/product',
  '/pages/guide-top/guide-top',
  '/pages/guide-bottom/guide-bottom',
  '/pages/guide-care/guide-care',
  '/pages/guide-material/guide-material',
  '/pages/apply/apply',
  '/pages/requests/requests',
  '/pages/request-detail/request-detail',
  '/pages/quote/quote',
  '/pages/orders/orders',
  '/pages/order-detail/order-detail',
  '/pages/contact/contact'
];

export type PageTarget = { kind: 'tab'; path: string } | { kind: 'page'; path: string } | { kind: 'none'; path: '' };

/**
 * 把后台填写的跳转目标解析成可执行的跳转。
 *
 * 兼容商家可能填的几种写法：
 * `/pages/category/index`、`pages/category/index`、`category`、
 * `guide-care`、`guide-care/guide-care`。
 */
export function resolvePageTarget(raw: string): PageTarget {
  const value = String(raw || '').trim();
  if (!value) {
    return { kind: 'none', path: '' };
  }
  let candidate = value.replace(/^\/+/, '').replace(/\/+$/, '');
  if (!candidate) {
    return { kind: 'none', path: '' };
  }
  // 补全成 pages/xxx/xxx 的形态
  if (!candidate.startsWith('pages/')) {
    if (candidate.indexOf('/') === -1) {
      // 裸 slug（如 guide-care）
      candidate = 'pages/' + candidate + '/' + candidate;
    } else {
      candidate = 'pages/' + candidate;
    }
  }
  const path = '/' + candidate;
  if (TAB_PAGES.indexOf(path) >= 0) {
    return { kind: 'tab', path };
  }
  if (NORMAL_PAGES.indexOf(path) >= 0) {
    return { kind: 'page', path };
  }
  return { kind: 'none', path: '' };
}
