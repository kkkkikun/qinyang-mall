import type { CategoryDto } from '@qinyang/contracts';

/** 整数分 → 元（用于展示与输入框回填） */
export function centsToYuan(cents: number): number {
  return Math.round(cents) / 100;
}

/** 元 → 整数分（提交前统一换算，禁止浮点金额入库） */
export function yuanToCents(yuan: number): number {
  return Math.round(yuan * 100);
}

/** 金额展示：¥12.00 */
export function formatYuan(cents: number): string {
  return `¥${(cents / 100).toFixed(2)}`;
}

/** ISO 时间 → 2025-01-01 12:00:00 */
export function formatDateTime(value?: string | null): string {
  if (!value) {
    return '—';
  }
  return value.replace('T', ' ').slice(0, 19);
}

/** ISO 时间 → 2025-01-01 */
export function formatDate(value?: string | null): string {
  if (!value) {
    return '—';
  }
  return value.slice(0, 10);
}

/** 分类树 → 扁平列表（保持层级顺序） */
export function flattenCategories(nodes: CategoryDto[]): CategoryDto[] {
  const result: CategoryDto[] = [];
  const walk = (list: CategoryDto[]): void => {
    list.forEach((node) => {
      result.push(node);
      if (node.children && node.children.length > 0) {
        walk(node.children);
      }
    });
  };
  walk(nodes);
  return result;
}

/** 分类树 → 带层级缩进的行（供表格渲染） */
export interface CategoryRow extends CategoryDto {
  level: number;
}

export function toCategoryRows(nodes: CategoryDto[], level = 0): CategoryRow[] {
  const result: CategoryRow[] = [];
  nodes.forEach((node) => {
    result.push({ ...node, level });
    if (node.children && node.children.length > 0) {
      result.push(...toCategoryRows(node.children, level + 1));
    }
  });
  return result;
}

/** 数字输入框 → 整数分（元输入为空视为未确认） */
export function parseYuanInput(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  const num = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(num) || num < 0) {
    return null;
  }
  return yuanToCents(num);
}
