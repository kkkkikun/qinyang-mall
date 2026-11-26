import type { VNode } from 'vue';

/**
 * t-table 列定义辅助。
 *
 * 背景：tdesign-vue-next 的 `cell` 回调第二个参数是宽泛的表格行类型，
 * 而业务 DTO 均为 interface（无法直接赋值给索引签名类型）。
 * 这里统一用 `cell()` 包一层，在回调内部把行数据断言回具体 DTO，
 * 既避免 `any`，又不受第三方类型定义细节影响。
 */
export interface TableCellContext {
  row: unknown;
}

export type TableCellFn = (h: unknown, context: TableCellContext) => VNode;

/** 生成一个单元格渲染函数 */
export function cell<T>(render: (row: T) => VNode): TableCellFn {
  return (_h, context) => render(context.row as T);
}

/**
 * t-table 的 `data` 属性在 tdesign 类型定义中为宽泛索引签名数组，
 * 业务 DTO 是 interface，无法直接赋值；这里统一收口一次转换。
 */
export function toTableData<T>(rows: readonly T[]): never[] {
  return rows as unknown as never[];
}
