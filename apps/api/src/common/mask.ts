/**
 * 敏感数据的展示口径。
 *
 * 联系方式属于敏感数据：管理端**列表**只给脱敏结果，
 * 完整号码仍然只在详情接口返回，由店员在真正处理该单时查看。
 *
 * 姓名不脱敏 —— 商家要靠姓名区分「是哪位顾客的申请」，
 * 全部变成「张*」反而让列表失去意义；手机号才是需要防批量外泄的那一项。
 */

/** 手机号脱敏：138****0007 */
export function maskPhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const trimmed = String(phone).trim();
  if (!trimmed) return null;
  if (trimmed.length <= 7) return trimmed;
  return `${trimmed.slice(0, 3)}****${trimmed.slice(-4)}`;
}
