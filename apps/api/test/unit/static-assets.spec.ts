import type { NestExpressApplication } from '@nestjs/platform-express';
import {
  mountStaticAssets,
  resolveStaticPrefix,
} from '../../src/common/static-assets';

/**
 * 静态资源挂载回归测试。
 *
 * 背景：容器化部署把「可写存储」与「只读商品媒体目录」拆成两个根，
 * 但对外共用 /static 前缀。此前主图 404 的故障即由此处漏配引起，
 * 因此这里锁定前缀推导与双根挂载顺序。
 */
describe('静态资源挂载', () => {
  const createApp = () => {
    const calls: Array<{ root: string; prefix: string }> = [];
    const app = {
      useStaticAssets: (root: string, options: { prefix: string }) => {
        calls.push({ root, prefix: options.prefix });
      },
    } as unknown as NestExpressApplication;
    return { app, calls };
  };

  describe('resolveStaticPrefix', () => {
    it('从带端口的基地址推导前缀', () => {
      expect(resolveStaticPrefix('http://127.0.0.1:18110/static')).toBe('/static');
    });

    it('兼容 https 与多级路径', () => {
      expect(resolveStaticPrefix('https://mall.example.com/assets/static')).toBe(
        '/assets/static',
      );
    });

    it('无路径时回退为 /static', () => {
      expect(resolveStaticPrefix('http://127.0.0.1:18110')).toBe('/static');
    });

    it('空值回退为 /static', () => {
      expect(resolveStaticPrefix('')).toBe('/static');
    });
  });

  describe('mountStaticAssets', () => {
    it('只挂可写存储根时不做多余挂载', () => {
      const { app, calls } = createApp();
      mountStaticAssets(app, {
        storageRoot: '/app/storage',
        mediaRoot: '',
        publicBaseUrl: 'http://127.0.0.1:18110/static',
      });
      expect(calls).toEqual([{ root: '/app/storage', prefix: '/static' }]);
    });

    it('配置媒体根时两个根共用同一前缀，且媒体根排在后面兜底', () => {
      const { app, calls } = createApp();
      mountStaticAssets(app, {
        storageRoot: '/app/storage',
        mediaRoot: '/app/media',
        publicBaseUrl: 'http://127.0.0.1:18110/static',
      });
      expect(calls).toEqual([
        { root: '/app/storage', prefix: '/static' },
        { root: '/app/media', prefix: '/static' },
      ]);
    });

    it('媒体根为空白字符时视为未配置', () => {
      const { app, calls } = createApp();
      mountStaticAssets(app, {
        storageRoot: '/app/storage',
        mediaRoot: '   ',
        publicBaseUrl: 'http://127.0.0.1:18110/static',
      });
      expect(calls).toHaveLength(1);
    });
  });
});
