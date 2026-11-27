/**
 * 图片类型识别（按文件真实内容，而不是客户端声明）。
 *
 * 背景（本轮安全审计 P2-2）：上传接口此前
 *   - 直接取客户端文件名的扩展名 → 可以落一个 `.html` 上去；
 *   - 只校验客户端自报的 Content-Type → multipart 的 mimetype 由客户端自填，
 *     攻击者可以把任意内容声明成 image/jpeg。
 * 两者叠加就是一次存储型 XSS：上传的 `.html` 被静态服务当 text/html 吐给浏览器。
 *
 * 这里以**文件头魔数**为准决定图片类型，扩展名也由识别结果给出，
 * 不再采信任何客户端输入。
 */

/** 按文件头识别图片类型；不是受支持的图片则返回 null */
export function detectImageExt(buffer: Buffer): string | null {
  if (!buffer || buffer.length < 3) {
    return null;
  }
  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return '.jpg';
  }
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer.length >= 8 &&
    buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return '.png';
  }
  // WebP: "RIFF" .... "WEBP"
  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return '.webp';
  }
  return null;
}
