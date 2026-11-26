import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AdminRole } from '@qinyang/contracts';
import { BusinessException } from '../errors/business.exception';
import { ROLES_KEY } from '../decorators/roles.decorator';
import type { AdminRequest } from './admin-auth.guard';

/** 角色校验：未标注 @Roles 的接口允许任何已登录管理员 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<AdminRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const request = context.switchToHttp().getRequest<AdminRequest>();
    const admin = request.admin;
    if (!admin) throw BusinessException.unauthorized();
    if (!required.includes(admin.role)) {
      throw BusinessException.forbidden('当前账号没有执行该操作的权限');
    }
    return true;
  }
}
