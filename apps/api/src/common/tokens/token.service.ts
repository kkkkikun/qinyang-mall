import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AdminRole } from '@qinyang/contracts';

export interface AdminTokenPayload {
  sub: string;
  username: string;
  displayName: string;
  role: AdminRole;
  typ: 'admin';
}

export interface CustomerTokenPayload {
  sub: string;
  nickname: string;
  typ: 'customer';
}

/**
 * 签发与校验两类令牌：管理员令牌与顾客令牌使用**不同的密钥与载荷类型**，
 * 避免跨端复用。顾客令牌不含任何量体或联系方式信息。
 */
@Injectable()
export class TokenService {
  private readonly adminJwt: JwtService;
  private readonly customerJwt: JwtService;

  constructor(private readonly config: ConfigService) {
    this.adminJwt = new JwtService({
      secret: this.config.get<string>('jwt.adminSecret') as string,
    });
    this.customerJwt = new JwtService({
      secret: this.config.get<string>('jwt.customerSecret') as string,
    });
  }

  signAdmin(payload: Omit<AdminTokenPayload, 'typ'>): Promise<string> {
    return this.adminJwt.signAsync(
      { ...payload, typ: 'admin' },
      { expiresIn: this.config.get<string>('jwt.adminExpiresIn') as string },
    );
  }

  signCustomer(payload: Omit<CustomerTokenPayload, 'typ'>): Promise<string> {
    return this.customerJwt.signAsync(
      { ...payload, typ: 'customer' },
      { expiresIn: this.config.get<string>('jwt.customerExpiresIn') as string },
    );
  }

  async verifyAdmin(token: string): Promise<AdminTokenPayload> {
    const payload = await this.adminJwt.verifyAsync<AdminTokenPayload>(token);
    if (payload.typ !== 'admin') throw new Error('TOKEN_TYPE_MISMATCH');
    return payload;
  }

  async verifyCustomer(token: string): Promise<CustomerTokenPayload> {
    const payload = await this.customerJwt.verifyAsync<CustomerTokenPayload>(token);
    if (payload.typ !== 'customer') throw new Error('TOKEN_TYPE_MISMATCH');
    return payload;
  }
}
