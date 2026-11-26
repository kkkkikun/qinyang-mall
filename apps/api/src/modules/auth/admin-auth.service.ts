import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { AdminRole, AdminUser, LoginRequest, LoginResponse } from '@qinyang/contracts';
import * as bcrypt from 'bcryptjs';
import { Repository } from 'typeorm';
import { AdminUser as AdminUserEntity } from '../../database/entities/admin-user.entity';
import { TokenService } from '../../common/tokens/token.service';

const BCRYPT_ROUNDS = 10;

@Injectable()
export class AdminAuthService {
  constructor(
    @InjectRepository(AdminUserEntity)
    private readonly repo: Repository<AdminUserEntity>,
    private readonly tokens: TokenService,
    private readonly config: ConfigService,
  ) {}

  async login(payload: LoginRequest): Promise<LoginResponse> {
    const user = await this.repo.findOne({ where: { username: payload.username } });
    if (!user || user.status !== 'ACTIVE') {
      // 不区分「用户不存在」与「密码错误」，避免账号枚举
      throw new UnauthorizedException('用户名或密码不正确');
    }
    const ok = await bcrypt.compare(payload.password, user.passwordHash);
    if (!ok) {
      throw new UnauthorizedException('用户名或密码不正确');
    }

    await this.repo.update(user.id, { lastLoginAt: new Date() });

    const token = await this.tokens.signAdmin({
      sub: user.id,
      username: user.username,
      displayName: user.displayName,
      role: user.role,
    });

    return {
      token,
      expiresIn: this.parseExpiresIn(this.config.get<string>('jwt.adminExpiresIn')),
      user: this.toDto(user),
    };
  }

  async findById(id: string): Promise<AdminUser | null> {
    const user = await this.repo.findOne({ where: { id } });
    return user ? this.toDto(user) : null;
  }

  /** 供种子脚本创建账号 */
  static async hashPassword(plain: string): Promise<string> {
    return bcrypt.hash(plain, BCRYPT_ROUNDS);
  }

  private toDto(user: AdminUserEntity): AdminUser {
    return {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      role: user.role,
      status: user.status,
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
    };
  }

  private parseExpiresIn(value: string | undefined): number {
    const raw = value ?? '12h';
    const match = /^(\d+)([smhd])$/.exec(raw);
    if (!match) return 43200;
    const amount = Number(match[1]);
    const unit = match[2];
    const multiplier = unit === 's' ? 1 : unit === 'm' ? 60 : unit === 'h' ? 3600 : 86400;
    return amount * multiplier;
  }
}

export { AdminRole };
