/**
 * CSV 文本工具（后台侧）。
 *
 * 服务端已经把 CSV 拼好了，这里只做「读回来数一数有多少行」，
 * 好让导出后能明确告诉商家导出了多少条。
 */

/** 统计 CSV 数据行数（不含表头）；空内容返回 0 */
export function countCsvRows(text: string): number {
  if (!text) return 0;
  const lines = text
    .replace(/^\uFEFF/, '')
    .split(/\r\n|\n|\r/)
    .filter((line) => line.trim().length > 0);
  return Math.max(0, lines.length - 1);
}
