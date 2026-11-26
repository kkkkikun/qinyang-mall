import { Injectable } from '@nestjs/common';
import { PaymentProvider, PaymentStatus } from '@qinyang/contracts';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PaymentRecord } from '../../database/entities/payment-record.entity';

export interface PaymentIntent {
  orderId: string;
  amountCents: number;
  currency: string;
  idempotencyKey: string;
}

export interface PaymentResult {
  provider: PaymentProvider;
  status: PaymentStatus;
  externalTradeId: string | null;
}

/**
 * 支付网关抽象接口。
 *
 * V1 **不启用真实微信支付**：真实收款需商家明确批准后单独实现，
 * 届时新增一个实现类并按环境装配，本接口签名保持不变。
 */
export abstract class PaymentGateway {
  abstract readonly provider: PaymentProvider;
  abstract createPayment(intent: PaymentIntent): Promise<PaymentResult>;
  abstract queryPayment(idempotencyKey: string): Promise<PaymentResult>;
  abstract refund(idempotencyKey: string, amountCents: number): Promise<PaymentResult>;
}

/**
 * 明确禁用的适配器。任何调用都抛 PAYMENT_DISABLED，
 * **不返回伪造的已支付状态，也不生成虚假退款记录**。
 */
@Injectable()
export class DisabledPaymentGateway extends PaymentGateway {
  readonly provider = PaymentProvider.DISABLED;

  async createPayment(): Promise<PaymentResult> {
    throw new Error('PAYMENT_DISABLED');
  }

  async queryPayment(): Promise<PaymentResult> {
    throw new Error('PAYMENT_DISABLED');
  }

  async refund(): Promise<PaymentResult> {
    throw new Error('PAYMENT_DISABLED');
  }
}
