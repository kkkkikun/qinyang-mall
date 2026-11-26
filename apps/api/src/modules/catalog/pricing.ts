import { PricingMode } from '@qinyang/contracts';

export class PricingRuleException extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PricingRuleException';
  }
}

/**
 * 价格归一化（纯函数）。
 *
 * V1 全部商品为「仅报价」模式，价格恒为 null —— 后端强制，
 * 前端据此显示「待报价」，杜绝出现 0 元或编造价格。
 */
export function normalizePrice(
  mode: PricingMode,
  price: number | null | undefined,
): number | null {
  if (mode === PricingMode.QUOTE_ONLY) return null;
  if (price === null || price === undefined) {
    throw new PricingRuleException('固定价商品必须填写价格（整数分）');
  }
  if (!Number.isFinite(price) || !Number.isInteger(price)) {
    throw new PricingRuleException('价格必须为整数分');
  }
  if (price <= 0) {
    throw new PricingRuleException('价格必须大于 0');
  }
  return price;
}

/** 报价总额：金额 + 运费，均为整数分 */
export function totalOf(amountCents: number, freightCents: number): number {
  if (!Number.isInteger(amountCents) || amountCents < 0) {
    throw new PricingRuleException('报价金额必须为非负整数分');
  }
  if (!Number.isInteger(freightCents) || freightCents < 0) {
    throw new PricingRuleException('运费必须为非负整数分');
  }
  return amountCents + freightCents;
}
