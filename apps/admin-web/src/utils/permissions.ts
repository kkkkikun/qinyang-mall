import { AdminRole } from '@qinyang/contracts';

/**
 * 后台操作权限矩阵。
 * 对齐 docs/api/REST-CONTRACT.md 第 2 节的 OWNER / STAFF 权限列。
 */
export type PermissionKey =
  | 'product.create'
  | 'product.edit'
  | 'product.status'
  | 'category.manage'
  | 'banner.manage'
  | 'banner.delete'
  | 'request.review'
  | 'request.quote'
  | 'request.order'
  | 'order.status'
  | 'order.cancel'
  | 'template.manage'
  | 'audit.view';

const OWNER_PERMISSIONS: PermissionKey[] = [
  'product.create',
  'product.edit',
  'product.status',
  'category.manage',
  'banner.manage',
  'banner.delete',
  'request.review',
  'request.quote',
  'request.order',
  'order.status',
  'order.cancel',
  'template.manage',
  'audit.view',
];

const STAFF_PERMISSIONS: PermissionKey[] = [
  'product.create',
  'product.edit',
  'banner.manage',
  'request.review',
  'order.status',
];

export const ROLE_PERMISSIONS: Record<AdminRole, PermissionKey[]> = {
  [AdminRole.OWNER]: OWNER_PERMISSIONS,
  [AdminRole.STAFF]: STAFF_PERMISSIONS,
};

export function hasPermission(role: AdminRole | null | undefined, key: PermissionKey): boolean {
  if (!role) {
    return false;
  }
  return ROLE_PERMISSIONS[role].includes(key);
}
