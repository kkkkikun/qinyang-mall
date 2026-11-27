import { detectImageExt } from '../../src/common/image-type';

describe('图片类型识别（按文件内容，不信客户端声明）', () => {
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
  const webp = Buffer.concat([
    Buffer.from('RIFF', 'ascii'),
    Buffer.from([0x24, 0x00, 0x00, 0x00]),
    Buffer.from('WEBP', 'ascii'),
  ]);

  it('识别 JPEG', () => {
    expect(detectImageExt(jpeg)).toBe('.jpg');
  });

  it('识别 PNG', () => {
    expect(detectImageExt(png)).toBe('.png');
  });

  it('识别 WebP', () => {
    expect(detectImageExt(webp)).toBe('.webp');
  });

  it('HTML 内容不被当成图片（堵存储型 XSS）', () => {
    const html = Buffer.from('<!doctype html><script>alert(1)</script>', 'utf-8');
    expect(detectImageExt(html)).toBeNull();
  });

  it('SVG 内容不被当成图片（SVG 可携带脚本）', () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>', 'utf-8');
    expect(detectImageExt(svg)).toBeNull();
  });

  it('空内容与过短内容返回 null', () => {
    expect(detectImageExt(Buffer.alloc(0))).toBeNull();
    expect(detectImageExt(Buffer.from([0xff]))).toBeNull();
  });

  it('GIF 不在受支持范围内（此前 MIME 白名单也不含 GIF）', () => {
    const gif = Buffer.from('GIF89a', 'ascii');
    expect(detectImageExt(gif)).toBeNull();
  });
});
