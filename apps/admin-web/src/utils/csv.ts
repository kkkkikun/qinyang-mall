/**
 * CSV 文本工具（后台侧）。
 *
 * 服务端已经把 CSV 拼好了，这里只做「读回来数一数有多少行」，
 * 好让导出后能明确告诉商家导出了多少条。
 *
 * 另外承担「本地读文件 → 提交给服务端」这一步的编码兼容：
 * 中文 Windows 的 Excel 默认把 CSV 存成 GBK，直接按 UTF-8 读会全是乱码。
 */

import { PRODUCT_IMPORT_CSV_HEADERS } from '@qinyang/contracts';

/**
 * 统计 CSV 数据行数（不含表头）；空内容返回 0。
 *
 * 按 **CSV 记录** 计数，而不是按物理行数：导出的列里有商家备注等自由文本，
 * 里面可能有换行；这类字段在 CSV 里是带引号的跨行字段，
 * 按 `\n` 切分会把一条记录算成多条，导出提示的条数就会虚高。
 */
export function countCsvRows(text: string): number {
  if (!text) return 0;
  const body = text.replace(/^\uFEFF/, '');

  let records = 0;
  let inQuotes = false;
  /** 当前记录里是否已有内容（区分「空行」与「一行只有一个空字段」） */
  let hasContent = false;

  for (let i = 0; i < body.length; i += 1) {
    const char = body[i];

    if (inQuotes) {
      if (char === '"') {
        // "" 是引号转义，仍在引号内
        if (body[i + 1] === '"') {
          i += 1;
          continue;
        }
        inQuotes = false;
      }
      // 引号内的换行属于字段内容，不能当作记录边界
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      hasContent = true;
      continue;
    }
    if (char === '\r') {
      continue;
    }
    if (char === '\n') {
      if (hasContent) {
        records += 1;
      }
      hasContent = false;
      continue;
    }
    if (char.trim().length > 0) {
      hasContent = true;
    }
  }

  // 末尾没有换行时，最后一条记录还没被计数
  if (hasContent) {
    records += 1;
  }

  // 减去表头
  return Math.max(0, records - 1);
}

/**
 * 读取本地 CSV 文件的文本内容。
 *
 * 编码策略：先按 UTF-8 严格解码；失败则按 GBK 再试一次。
 * （Excel 中文版另存为 CSV 时默认写 GBK/GB18030。）
 */
export async function readCsvFile(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch {
    try {
      return new TextDecoder('gbk').decode(buffer);
    } catch {
      // 极端情况下退回非严格 UTF-8，至少不会整个失败
      return new TextDecoder('utf-8').decode(buffer);
    }
  }
}

/**
 * 生成导入模板 CSV（表头 + 一行占位说明）。
 *
 * 占位内容全部带括号说明，**不含任何真实经营数据** ——
 * 正式名称 / 价格 / 材质必须由商家填写，系统不代填。
 */
export function buildImportTemplateCsv(): string {
  const placeholderRow = [
    'QY-XXX-001',
    '（请填写商品名称）',
    '（请填写分类编号）',
    '仅按量体报价',
    '',
    '（请填写材质）',
    '',
    '（请填写商品简介）',
    '（请填写洗护说明）',
    '',
    '0',
  ];
  const escape = (value: string): string =>
    /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
  const lines = [
    PRODUCT_IMPORT_CSV_HEADERS.map(escape).join(','),
    placeholderRow.map(escape).join(','),
  ];
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}
