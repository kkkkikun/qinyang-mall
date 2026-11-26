import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AdminRole } from '@qinyang/contracts';

export interface AdminPrincipal {
  id: string;
  username: string;
  displayName: string;
  role: AdminRole;
}

/** 取当前登录管理员 */
export const CurrentAdmin = createParamDecorator(
  (data: keyof AdminPrincipal | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<{ admin?: AdminPrincipal }>();
    const admin = request.admin;
    if (!admin) return undefined;
    return data ? admin[data] : admin;
  },
);
