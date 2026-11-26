import { PricingMode } from '@qinyang/contracts';
import { PricingRuleException, normalizePrice, totalOf } from '../../src/modules/catalog/pricing';

describe('价格规则（整数分）', () => {
  it('仅报价模式恒返回 null，绝不落 0', () => {
    expect(normalizePrice(PricingMode.QUOTE_ONLY, null)).toBeNull();
    expect(normalizePrice(PricingMode.QUOTE_ONLY, 19900)).toBeNull();
    expect(normalizePrice(PricingMode.QUOTE_ONLY, 0)).toBeNull();
  });

  it('固定价必须为正整数分', () => {
    expect(normalizePrice(PricingMode.FIXED_PRICE, 19900)).toBe(19900);
    expect(() => normalizePrice(PricingMode.FIXED_PRICE, null)).toThrow(
      PricingRuleException,
    );
    expect(() => normalizePrice(PricingMode.FIXED_PRICE, 0)).toThrow(/大于 0/);
    expect(() => normalizePrice(PricingMode.FIXED_PRICE, -1)).toThrow(/大于 0/);
  });

  it('拒绝非整数分', () => {
    expect(() => normalizePrice(PricingMode.FIXED_PRICE, 199.5)).toThrow(/整数分/);
  });

  it('合计为整数分求和', () => {
    expect(totalOf(19900, 1200)).toBe(21100);
    expect(() => totalOf(19900, -1)).toThrow(PricingRuleException);
  });
});
