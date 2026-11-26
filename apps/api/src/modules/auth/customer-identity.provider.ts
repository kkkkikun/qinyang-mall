import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface CustomerIdentity {
  openid: string;
  unionid?: string;
  nickname?: string;
}

/**
 * 顾客身份来源抽象。
 * 正式环境用微信 code2session；开发/测试环境在 WECHAT_MOCK_AUTH=true 时
 * 使用 mock 提供者，避免依赖真实 AppID 与密钥。
 */
export abstract class CustomerIdentityProvider {
  abstract resolve(code: string): Promise<CustomerIdentity>;
}

@Injectable()
export class WechatIdentityProvider extends CustomerIdentityProvider {
  private readonly logger = new Logger(WechatIdentityProvider.name);

  constructor(private readonly config: ConfigService) {
    super();
  }

  async resolve(code: string): Promise<CustomerIdentity> {
    const appId = this.config.get<string>('wechat.appId');
    const appSecret = this.config.get<string>('wechat.appSecret');
    if (!appId || !appSecret) {
      throw new Error(
        'WECHAT_APP_ID / WECHAT_APP_SECRET 未配置，无法执行 code2session（请改用 mock 模式或提供已授权配置）',
      );
    }

    const url =
      'https://api.weixin.qq.com/sns/jscode2session' +
      `?appid=${encodeURIComponent(appId)}` +
      `&secret=${encodeURIComponent(appSecret)}` +
      `&js_code=${encodeURIComponent(code)}` +
      '&grant_type=authorization_code';

    const response = await fetch(url, { method: 'GET' });
    if (!response.ok) {
      throw new Error(`WECHAT_AUTH_HTTP_${response.status}`);
    }
    const body = (await response.json()) as {
      openid?: string;
      unionid?: string;
      errcode?: number;
      errmsg?: string;
    };
    if (!body.openid) {
      // 不把微信原始错误细节回传客户端，但保留在服务端日志便于排查
      this.logger.warn(`code2session 失败 errcode=${body.errcode ?? '-'}`);
      throw new Error('WECHAT_AUTH_FAILED');
    }
    return { openid: body.openid, unionid: body.unionid };
  }
}

@Injectable()
export class MockIdentityProvider extends CustomerIdentityProvider {
  async resolve(code: string): Promise<CustomerIdentity> {
    // 约定 mock code 形如 `dev:openid-001`；未带前缀时使用 code 本身作为 openid
    const openid = code.startsWith('dev:') ? code.slice(4) : code;
    if (!openid || openid.length > 64) {
      throw new Error('INVALID_MOCK_CODE');
    }
    return { openid: `mock:${openid}`, nickname: '琴扬顾客' };
  }
}
