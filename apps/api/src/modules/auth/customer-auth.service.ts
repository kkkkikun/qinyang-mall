import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { CustomerProfile } from '@qinyang/contracts';
import { Repository } from 'typeorm';
import { Customer } from '../../database/entities/customer.entity';
import { TokenService } from '../../common/tokens/token.service';
import { CustomerIdentityProvider, type CustomerIdentity } from './customer-identity.provider';
import { maskPhone } from '../../common/mask';
import { isDuplicateKey } from '../../common/errors/duplicate-key';

export interface CustomerLoginResult {
  token: string;
  customer: CustomerProfile;
}

@Injectable()
export class CustomerAuthService {
  constructor(
    @InjectRepository(Customer)
    private readonly repo: Repository<Customer>,
    private readonly tokens: TokenService,
    private readonly identity: CustomerIdentityProvider,
  ) {}

  async login(code: string): Promise<CustomerLoginResult> {
    const identity = await this.identity.resolve(code);

    let customer = await this.repo.findOne({ where: { openid: identity.openid } });
    if (!customer) {
      customer = await this.insertCustomer(identity);
    }

    const token = await this.tokens.signCustomer({
      sub: customer.id,
      nickname: customer.nickname,
    });

    return { token, customer: this.toProfile(customer) };
  }

  /**
   * 首次登录落库。
   *
   * 顾客端「双击 / 弱网重试」会让同一个 code 并发触发两次登录：
   * 两次都查不到这个 openid → 都去 INSERT → 后到者撞唯一索引 UQ_customers_openid。
   * 登录是全站最高频的顾客动作，此前这个冲突直接冒泡成 500「服务器内部错误」，
   * 顾客看到的是「登录失败，请重试」，重试又再撞一次。
   *
   * 这里把重复键当作**幂等**：回查该 openid 已有的顾客并复用，
   * 两次登录都成功，customers 表里始终只有一行。
   */
  private async insertCustomer(identity: CustomerIdentity): Promise<Customer> {
    try {
      return await this.repo.save(
        this.repo.create({
          openid: identity.openid,
          unionid: identity.unionid ?? null,
          nickname: identity.nickname ?? '琴扬顾客',
        }),
      );
    } catch (error) {
      if (isDuplicateKey(error)) {
        const existing = await this.repo.findOne({ where: { openid: identity.openid } });
        if (existing) {
          return existing;
        }
      }
      throw error;
    }
  }

  async profile(customerId: string): Promise<CustomerProfile | null> {
    const customer = await this.repo.findOne({ where: { id: customerId } });
    return customer ? this.toProfile(customer) : null;
  }

  private toProfile(customer: Customer): CustomerProfile {
    return {
      id: customer.id,
      nickname: customer.nickname,
      // 手机号只返回掩码，明文不外泄。
      // 脱敏口径统一走 common/mask：此前这里自己实现了一份
      // （< 7 位返回 '***'），与后台列表 / CSV 导出口径不一致，
      // 同一号码在两处显示成两种样子。
      phoneMasked: customer.phone ? (maskPhone(customer.phone) ?? undefined) : undefined,
      createdAt: customer.createdAt.toISOString(),
    };
  }
}
