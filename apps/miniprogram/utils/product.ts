/**
 * 商品卡视图模型。
 *
 * 契约里的 ProductListItem 只提供 priceCents（整数分，未确认时为 null），
 * 页面展示需要「¥1,234.00」或「待报价」，这里做一次纯展示层的转换，
 * 不新增业务字段含义。
 */

import { ProductListItem, PricingMode } from '../types/contracts';
import { priceText } from './format';

export interface ProductCardVM {
  id: string;
  code: string;
  name: string;
  subtitle: string;
  categoryName: string;
  coverUrl: string;
  /** 展示用价格文案：已确认显示金额，未确认显示「待报价」 */
  priceLabel: string;
  priceCents: number | null;
  pricingMode: string;
  /** 是否为「按量体报价」款式 */
  quoteOnly: boolean;
}

export function toProductCards(items: ProductListItem[]): ProductCardVM[] {
  return items.map((item) => ({
    id: item.id,
    code: item.code,
    name: item.name,
    subtitle: item.subtitle || '',
    categoryName: item.categoryName || '',
    coverUrl: item.coverUrl || '',
    priceLabel: priceText(item.priceCents),
    priceCents: item.priceCents,
    pricingMode: item.pricingMode,
    quoteOnly: item.pricingMode === PricingMode.QUOTE_ONLY
  }));
}
