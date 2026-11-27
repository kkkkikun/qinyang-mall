/**
 * CSV 生成工具。
 *
 * 管理端的「导出」要能被 Excel / WPS 直接打开，因此：
 * - 带 UTF-8 BOM（否则中文乱码）；
 * - 完整转义（逗号、引号、换行都按 RFC 4180 处理）。
 */

/** 单个单元格的值类型 */
export type CsvCell = string | number | null | undefined;

/** RFC 4180 转义：含逗号/引号/换行时用双引号包裹，内部引号翻倍 */
export function escapeCsvCell(value: CsvCell): string {
  if (value === null || value === undefined) return '';
  const text = String(value);
  if (/[",\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

/**
 * 生成 CSV 文本（含 BOM）。
 *
 * @param headers 表头
 * @param rows 数据行
 */
export function buildCsv(headers: string[], rows: CsvCell[][]): string {
  const lines = [headers.map(escapeCsvCell).join(',')];
  for (const row of rows) {
    lines.push(row.map(escapeCsvCell).join(','));
  }
  // BOM：Excel / WPS 识别 UTF-8 的关键
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}

/**
 * 生成附件下载头。
 *
 * 中文文件名要同时给 ASCII 回退名与 RFC 5987 的 filename*，
 * 否则部分浏览器会把文件名显示成乱码。
 */
export function buildContentDisposition(filename: string): string {
  const fallback = filename.replace(/[^\x20-\x7e]/g, '_').replace(/"/g, '');
  const encoded = encodeURIComponent(filename);
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}

/** 生成带时间戳的文件名，如 `定制申请-20261126-1502.csv` */
export function buildExportFilename(prefix: string, at: Date = new Date()): string {
  const pad = (n: number): string => String(n).padStart(2, '0');
  const stamp =
    `${at.getFullYear()}${pad(at.getMonth() + 1)}${pad(at.getDate())}` +
    `-${pad(at.getHours())}${pad(at.getMinutes())}`;
  return `${prefix}-${stamp}.csv`;
}
