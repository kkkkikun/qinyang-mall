import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export interface CustomerPrincipal {
  id: string;
  nickname: string;
}

/** 取当前登录顾客 */
export const CurrentCustomer = createParamDecorator(
  (data: keyof CustomerPrincipal | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<{ customer?: CustomerPrincipal }>();
    const customer = request.customer;
    if (!customer) return undefined;
    return data ? customer[data] : customer;
  },
);
