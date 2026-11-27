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
  // 号码下限是 6 位（DTO 允许 6–32），此前 ≤7 位直接返回原文 ——
  // 6~7 位的号码会在管理端列表与 CSV 导出里完整暴露。
  if (trimmed.length <= 4) return '*'.repeat(trimmed.length);
  if (trimmed.length <= 7) return `${trimmed.slice(0, 2)}***${trimmed.slice(-1)}`;
  return `${trimmed.slice(0, 3)}****${trimmed.slice(-4)}`;
}
