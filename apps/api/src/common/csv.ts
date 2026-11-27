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

/**
 * 解析 CSV 文本为二维数组（RFC 4180）。
 *
 * 与 `buildCsv` 成对使用：
 * - 引号内的逗号、换行都按内容处理（`"含,逗号"` → 一个字段）
 * - `""` 表示一个字面的双引号
 * - 支持 \r\n 与 \n 两种换行
 * - 末尾空行会被丢弃
 *
 * @returns 行数组；每行是单元格数组（缺列补空串由调用方处理）
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let i = 0;

  const pushField = (): void => {
    row.push(field);
    field = '';
  };
  const pushRow = (): void => {
    pushField();
    // 跳过完全空白的行（尾随空行、文件末尾换行）
    if (row.some((cell) => cell.trim() !== '')) {
      rows.push(row);
    }
    row = [];
  };

  while (i < text.length) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += char;
      i += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (char === ',') {
      pushField();
      i += 1;
      continue;
    }
    if (char === '\r') {
      // \r\n 视为一个换行
      if (text[i + 1] === '\n') i += 1;
      pushRow();
      i += 1;
      continue;
    }
    if (char === '\n') {
      pushRow();
      i += 1;
      continue;
    }
    field += char;
    i += 1;
  }

  // 收尾：最后一行没有换行符时也要落表
  if (field !== '' || row.length > 0) {
    pushRow();
  }

  return rows;
}
