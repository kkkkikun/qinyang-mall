import { Transform } from 'class-transformer';

/**
 * 输入文本规范化。
 *
 * 背景（本轮输入校验审计）：
 * 后台表单与 CSV 导入走的是两条路径，而**服务端此前既不 trim 也不拦空串**，
 * 于是同一个商品编号的两种写法会并存成两条记录：
 *
 * ```
 * POST /admin/products  {"code":" PROBE-001 "}   → 落库 " PROBE-001 "
 * POST /admin/products  {"code":"PROBE-001"}     → 落库 "PROBE-001"
 * GET  /admin/products?keyword=PROBE-001         → 命中 2 条，看起来像重复商品
 * ```
 *
 * 唯一索引拦不住（两个字符串确实不同），业务层的「编号已存在」检查也拦不住。
 * 商家会以为系统出了重复商品的 bug。
 *
 * 更糟的是**两条录入路径口径不一致**：CSV 导入会 trim，表单创建不会 ——
 * 商家用 Excel 导进来的商品编号是干净的，再用表单建一个带空格的同名编号就会重复。
 *
 * 这里把规范化收敛到**一处**，由 DTO 统一声明：
 * - `Trim()`：字符串去首尾空白（非字符串原样返回）；
 * - `TrimNullable()`：去首尾空白，并把空串归一为 `null`（「清空该字段」的语义）。
 */

/** 字符串去首尾空白 */
export function Trim(): PropertyDecorator {
  return Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));
}

/**
 * 可选文本：去首尾空白，空串归一为 `null`。
 *
 * 归一为 `null` 而不是报错：商家**清空**某个可选字段时前端会提交空串，
 * 那应当表示「清空」，不能被校验拦成 400。
 */
export function TrimNullable(): PropertyDecorator {
  return Transform(({ value }) => {
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    return trimmed === '' ? null : trimmed;
  });
}
