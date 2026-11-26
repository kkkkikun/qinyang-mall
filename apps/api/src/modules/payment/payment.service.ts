import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ERROR_CODES, PaymentStatus } from '@qinyang/contracts';
import { Repository } from 'typeorm';
import { PaymentRecord } from '../../database/entities/payment-record.entity';
import { Order } from '../../database/entities/order.entity';
import { BusinessException } from '../../common/errors/business.exception';
import { DisabledPaymentGateway, PaymentGateway } from './payment.gateway';

@Injectable()
export class PaymentService {
  constructor(
    @InjectRepository(PaymentRecord)
    private readonly records: Repository<PaymentRecord>,
    @InjectRepository(Order)
    private readonly orders: Repository<Order>,
    private readonly gateway: PaymentGateway,
  ) {}

  /**
   * 发起支付。V1 恒定失败：真实收款未获批准前不允许出现「已支付」状态。
   * 只记录一条 `DISABLED` 的事实记录，便于审计「为何没有支付流水」。
   */
  async pay(orderId: string): Promise<never> {
    const order = await this.orders.findOne({ where: { id: orderId } });
    if (!order) throw BusinessException.notFound('订单不存在');

    const idempotencyKey = `order:${order.id}`;
    const existing = await this.records.findOne({ where: { idempotencyKey } });
    if (!existing) {
      await this.records.save(
        this.records.create({
          orderId: order.id,
          provider: this.gateway.provider,
          status: PaymentStatus.DISABLED,
          amountCents: order.totalCents,
          idempotencyKey,
          externalTradeId: null,
        }),
      );
    }

    throw BusinessException.conflict(
      'V1 未启用线上收款，支付功能处于明确禁用状态',
      ERROR_CODES.PAYMENT_DISABLED,
    );
  }

  /** 供查询：返回该订单的支付记录（V1 只会是 DISABLED） */
  async findByOrder(orderId: string): Promise<PaymentRecord | null> {
    return this.records.findOne({ where: { orderId }, order: { createdAt: 'DESC' } });
  }
}
