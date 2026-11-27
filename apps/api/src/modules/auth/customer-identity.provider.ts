import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
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
      // 服务端配置缺失是**服务端**的问题，不能让顾客端拿到 500
      this.logger.error('WECHAT_APP_ID / WECHAT_APP_SECRET 未配置，无法执行 code2session');
      throw new ServiceUnavailableException('登录服务暂时不可用，请稍后重试');
    }

    const url =
      'https://api.weixin.qq.com/sns/jscode2session' +
      `?appid=${encodeURIComponent(appId)}` +
      `&secret=${encodeURIComponent(appSecret)}` +
      `&js_code=${encodeURIComponent(code)}` +
      '&grant_type=authorization_code';

    // 超时保护：此前 fetch **没有超时**，微信侧不响应时请求会一直挂着，
    // 连接与 worker 被占满，表现为「登录转圈直到用户放弃」。
    let response: Response;
    try {
      response = await fetch(url, {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
      });
    } catch (error) {
      this.logger.error(`code2session 请求失败：${(error as Error).message}`);
      throw new ServiceUnavailableException('登录服务暂时不可用，请稍后重试');
    }
    if (!response.ok) {
      this.logger.error(`code2session HTTP ${response.status}`);
      throw new ServiceUnavailableException('登录服务暂时不可用，请稍后重试');
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
      // code 无效 / 已过期 → 这是**顾客侧**的凭据问题，回 401 让小程序提示重新授权，
      // 此前抛普通 Error 会被归一化成 500「服务器内部错误」。
      throw new UnauthorizedException('登录凭证无效或已过期，请重新进入小程序');
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
      throw new BadRequestException('登录凭证格式不正确');
    }
    return { openid: `mock:${openid}`, nickname: '琴扬顾客' };
  }
}
