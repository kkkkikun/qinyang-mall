/**
 * 展示层格式化工具。
 *
 * 规则：金额一律以整数分存储与传输，展示时换算为元；价格未确认时显示「待报价」，
 * 绝不编造金额。
 */

/** 整数分 → "1,234.00" */
export function formatCents(cents: number | null | undefined): string {
  if (cents === null || cents === undefined || typeof cents !== 'number' || !isFinite(cents)) {
    return '';
  }
  const fixed = (cents / 100).toFixed(2);
  const parts = fixed.split('.');
  const intPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return intPart + '.' + (parts[1] || '00');
}

/** 价格文案：未确认时返回「待报价」 */
export function priceText(cents: number | null | undefined, tbd = '待报价'): string {
  if (cents === null || cents === undefined) {
    return tbd;
  }
  return '¥' + formatCents(cents);
}

/** ISO 时间 → "2026-11-26 17:42" */
export function formatDateTime(iso?: string | null): string {
  if (!iso) {
    return '';
  }
  const date = new Date(iso);
  if (isNaN(date.getTime())) {
    return String(iso);
  }
  return formatDatePart(date) + ' ' + formatTime(date);
}

/** ISO 时间 → "2026-11-26" */
export function formatDate(iso?: string | null): string {
  if (!iso) {
    return '';
  }
  const date = new Date(iso);
  if (isNaN(date.getTime())) {
    return String(iso);
  }
  return formatDatePart(date);
}

function pad(value: number): string {
  return value < 10 ? '0' + value : String(value);
}

/** Date → "2026-11-26"（内部实现，不与对外的 formatDate 同名） */
function formatDatePart(date: Date): string {
  return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate());
}

function formatTime(date: Date): string {
  return pad(date.getHours()) + ':' + pad(date.getMinutes());
}

/** 报价是否已过有效期（用于禁用确认按钮，而不是点了再被后端拒绝） */
export function isQuoteExpired(iso?: string | null): boolean {
  if (!iso) {
    return false;
  }
  const date = new Date(iso);
  if (isNaN(date.getTime())) {
    return false;
  }
  return date.getTime() <= Date.now();
}

/** 倒计时文案：报价有效期 */
export function validUntilText(iso?: string | null): string {
  if (!iso) {
    return '待商家确认';
  }
  const date = new Date(iso);
  if (isNaN(date.getTime())) {
    return String(iso);
  }
  const diff = date.getTime() - Date.now();
  if (diff <= 0) {
    return '已过期';
  }
  const days = Math.floor(diff / 86400000);
  if (days >= 1) {
    return formatDatePart(date) + '（剩余 ' + days + ' 天）';
  }
  const hours = Math.floor(diff / 3600000);
  if (hours >= 1) {
    return formatDatePart(date) + '（剩余 ' + hours + ' 小时）';
  }
  return formatDatePart(date) + ' ' + formatTime(date);
}
