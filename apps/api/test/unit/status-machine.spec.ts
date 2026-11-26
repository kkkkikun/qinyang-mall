import {
  MeasurementSection,
  MeasurementType,
  ORDER_STATUS_TRANSITIONS,
  OrderStatus,
  REQUEST_STATUS_TRANSITIONS,
  RequestStatus,
} from '@qinyang/contracts';

/**
 * 状态机单元测试。
 *
 * 目标文档要求「必须保证状态转换合法」，因此把合法迁移表本身作为被测对象：
 * 任何被允许的迁移都必须能在目标表里找到，且终态不可再迁移。
 */
describe('定制申请状态机', () => {
  const all = Object.values(RequestStatus);

  it('终态没有任何后继', () => {
    const terminal: RequestStatus[] = [
      RequestStatus.COMPLETED,
      RequestStatus.CANCELLED,
      RequestStatus.REJECTED,
    ];
    for (const status of terminal) {
      expect(REQUEST_STATUS_TRANSITIONS[status]).toEqual([]);
    }
  });

  it('覆盖全部状态', () => {
    expect(Object.keys(REQUEST_STATUS_TRANSITIONS).sort()).toEqual([...all].sort());
  });

  it('正常主链路逐步可达', () => {
    const chain: RequestStatus[] = [
      RequestStatus.PENDING_REVIEW,
      RequestStatus.PENDING_QUOTE,
      RequestStatus.QUOTED,
      RequestStatus.CONFIRMED,
      RequestStatus.IN_PRODUCTION,
      RequestStatus.SHIPPED,
      RequestStatus.COMPLETED,
    ];
    for (let i = 0; i < chain.length - 1; i += 1) {
      expect(REQUEST_STATUS_TRANSITIONS[chain[i]]).toContain(chain[i + 1]);
    }
  });

  it('不允许跳过报价直接确认', () => {
    expect(REQUEST_STATUS_TRANSITIONS[RequestStatus.PENDING_QUOTE]).not.toContain(
      RequestStatus.CONFIRMED,
    );
    expect(REQUEST_STATUS_TRANSITIONS[RequestStatus.PENDING_REVIEW]).not.toContain(
      RequestStatus.CONFIRMED,
    );
  });

  it('报价后可重新报价（回到待报价）', () => {
    expect(REQUEST_STATUS_TRANSITIONS[RequestStatus.QUOTED]).toContain(
      RequestStatus.PENDING_QUOTE,
    );
  });

  it('已完成 / 已取消 / 已谢绝不可回退', () => {
    for (const status of [
      RequestStatus.COMPLETED,
      RequestStatus.CANCELLED,
      RequestStatus.REJECTED,
    ]) {
      expect(REQUEST_STATUS_TRANSITIONS[status]).toHaveLength(0);
    }
  });

  it('迁移目标必须是已知状态', () => {
    for (const targets of Object.values(REQUEST_STATUS_TRANSITIONS)) {
      for (const target of targets) {
        expect(all).toContain(target);
      }
    }
  });
});

describe('订单状态机', () => {
  const all = Object.values(OrderStatus);

  it('覆盖全部状态', () => {
    expect(Object.keys(ORDER_STATUS_TRANSITIONS).sort()).toEqual([...all].sort());
  });

  it('主链路：确认 → 制作 → 发货 → 完成', () => {
    expect(ORDER_STATUS_TRANSITIONS[OrderStatus.CONFIRMED]).toContain(
      OrderStatus.IN_PRODUCTION,
    );
    expect(ORDER_STATUS_TRANSITIONS[OrderStatus.IN_PRODUCTION]).toContain(
      OrderStatus.SHIPPED,
    );
    expect(ORDER_STATUS_TRANSITIONS[OrderStatus.SHIPPED]).toContain(
      OrderStatus.COMPLETED,
    );
  });

  it('未制作不能发货，未发货不能完成', () => {
    expect(ORDER_STATUS_TRANSITIONS[OrderStatus.CONFIRMED]).not.toContain(
      OrderStatus.SHIPPED,
    );
    expect(ORDER_STATUS_TRANSITIONS[OrderStatus.IN_PRODUCTION]).not.toContain(
      OrderStatus.COMPLETED,
    );
  });

  it('完成后不可再变更', () => {
    expect(ORDER_STATUS_TRANSITIONS[OrderStatus.COMPLETED]).toEqual([]);
  });
});
