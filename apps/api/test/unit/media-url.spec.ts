import { deriveThumbUrl } from '../../src/common/media-url';

describe('缩略图地址推导', () => {
  it('4x5 详情图推出 thumb', () => {
    expect(
      deriveThumbUrl('http://127.0.0.1:18110/static/products/ED-0001/IMG-0395-4x5.jpg'),
    ).toBe('http://127.0.0.1:18110/static/products/ED-0001/IMG-0395-thumb.jpg');
  });

  it('1x1 详情图推出 thumb', () => {
    expect(
      deriveThumbUrl('http://127.0.0.1:18110/static/products/ED-0001/IMG-0395-1x1.jpg'),
    ).toBe('http://127.0.0.1:18110/static/products/ED-0001/IMG-0395-thumb.jpg');
  });

  it('后台上传的素材没有变体，推导不出来（前端回退用原图）', () => {
    expect(deriveThumbUrl('http://127.0.0.1:18110/static/uploads/2026-11/1a2b3c.jpg')).toBeNull();
  });

  it('空值返回 null', () => {
    expect(deriveThumbUrl(null)).toBeNull();
    expect(deriveThumbUrl(undefined)).toBeNull();
    expect(deriveThumbUrl('')).toBeNull();
  });

  it('已经是 thumb 的不再二次推导', () => {
    expect(
      deriveThumbUrl('http://127.0.0.1:18110/static/products/ED-0001/IMG-0395-thumb.jpg'),
    ).toBeNull();
  });

  it('保留协议与域名，只改后缀', () => {
    expect(deriveThumbUrl('https://cdn.example.com/a/b/IMG-1-4x5.webp')).toBe(
      'https://cdn.example.com/a/b/IMG-1-thumb.webp',
    );
  });
});
