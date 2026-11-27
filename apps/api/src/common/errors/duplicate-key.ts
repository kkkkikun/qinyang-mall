/**
 * 唯一索引冲突识别。
 *
 * 背景（本轮可靠性审计）：
 * 「一个申请只能有一张订单」「同一申请同时只有一个有效报价」这类唯一性，
 * 此前只靠应用层「先查后写」保证，并发下必然失效。
 * 现在唯一性下沉到数据库，于是并发写入时后者会拿到 MySQL 的重复键错误 ——
 * 必须把它翻译成 409 冲突，让商家看到「状态冲突，请刷新重试」，
 * 而不是 500「服务器内部错误」。
 */

/** MySQL ER_DUP_ENTRY */
export function isDuplicateKey(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const candidate = error as { code?: string | number; errno?: number };
  return (
    candidate.code === 'ER_DUP_ENTRY' ||
    candidate.code === 1062 ||
    candidate.errno === 1062
  );
}
