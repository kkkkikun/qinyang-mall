/**
 * 媒体缩略图地址推导。
 *
 * 背景（本轮性能审计 P1-5）：
 * 图片流水线 `tools/build_media.py` 为每张商品图产出三档变体 ——
 *   4x5（900×1125，详情）/ 1x1（1000×1000，详情）/ thumb（600×600，列表）
 * 三档变体**同目录、同 basename，只有后缀不同**
 * （`IMG-0395-4x5.jpg` / `IMG-0395-1x1.jpg` / `IMG-0395-thumb.jpg`）。
 *
 * 而数据库 `product_media.url` 里存的一直是 4x5 详情图，
 * 于是列表卡片、详情页缩略图网格全部在拉 130 KB 级别的大图：
 * 首屏 18 张图实测 2.49 MB，而用 thumb 只要 0.76 MB（-69%）。
 *
 * 这里按命名约定从详情图地址推导缩略图地址：
 *   - 推导出 thumb → 前端用小图；
 *   - 推导不出（后台上传的素材没有变体）→ 返回 null，前端回退用原图。
 * 好处是不需要改表、不需要重新灌种子数据。
 */

/** 详情变体后缀 → 缩略图后缀 */
const VARIANT_SUFFIX = /-(4x5|1x1)(\.[a-z0-9]+)$/i;

/** 由详情图地址推导缩略图地址；推不出来返回 null */
export function deriveThumbUrl(url: string | null | undefined): string | null {
  if (!url) {
    return null;
  }
  const matched = VARIANT_SUFFIX.exec(url);
  if (!matched) {
    return null;
  }
  return `${url.slice(0, matched.index)}-thumb${matched[2]}`;
}
