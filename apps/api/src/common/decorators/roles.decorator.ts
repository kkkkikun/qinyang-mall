import { SetMetadata } from '@nestjs/common';
import { AdminRole } from '@qinyang/contracts';

export const IS_PUBLIC_KEY = 'qinyang:isPublic';
export const ROLES_KEY = 'qinyang:roles';

/** 标记接口无需登录（公开只读接口） */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/** 限制可访问的角色；未标注时任何已登录角色均可访问 */
export const Roles = (...roles: AdminRole[]) => SetMetadata(ROLES_KEY, roles);
