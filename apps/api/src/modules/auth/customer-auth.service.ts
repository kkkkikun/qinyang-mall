import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { CustomerProfile } from '@qinyang/contracts';
import { Repository } from 'typeorm';
import { Customer } from '../../database/entities/customer.entity';
import { TokenService } from '../../common/tokens/token.service';
import { CustomerIdentityProvider } from './customer-identity.provider';

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
      customer = await this.repo.save(
        this.repo.create({
          openid: identity.openid,
          unionid: identity.unionid ?? null,
          nickname: identity.nickname ?? '琴扬顾客',
        }),
      );
    }

    const token = await this.tokens.signCustomer({
      sub: customer.id,
      nickname: customer.nickname,
    });

    return { token, customer: this.toProfile(customer) };
  }

  async profile(customerId: string): Promise<CustomerProfile | null> {
    const customer = await this.repo.findOne({ where: { id: customerId } });
    return customer ? this.toProfile(customer) : null;
  }

  private toProfile(customer: Customer): CustomerProfile {
    return {
      id: customer.id,
      nickname: customer.nickname,
      // 手机号只返回掩码，明文不外泄
      phoneMasked: customer.phone ? maskPhone(customer.phone) : undefined,
      createdAt: customer.createdAt.toISOString(),
    };
  }
}

const maskPhone = (phone: string): string => {
  if (phone.length < 7) return '***';
  return `${phone.slice(0, 3)}****${phone.slice(-4)}`;
};
