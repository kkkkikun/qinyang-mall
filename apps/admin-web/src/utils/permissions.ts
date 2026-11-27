import { AdminRole } from '@qinyang/contracts';

/**
 * 后台操作权限矩阵。
 * 对齐 docs/api/REST-CONTRACT.md 第 2 节的 OWNER / STAFF 权限列。
 */
export type PermissionKey =
  | 'product.create'
  | 'product.import'
  | 'product.edit'
  | 'product.status'
  | 'product.delete'
  | 'category.manage'
  | 'banner.manage'
  | 'banner.delete'
  | 'request.review'
  | 'request.quote'
  | 'request.order'
  | 'order.status'
  | 'order.cancel'
  | 'template.manage'
  | 'template.delete'
  | 'guide.manage'
  | 'audit.view';

const OWNER_PERMISSIONS: PermissionKey[] = [
  'product.create',
  'product.import',
  'product.edit',
  'product.status',
  'product.delete',
  'category.manage',
  'banner.manage',
  'banner.delete',
  'request.review',
  'request.quote',
  'request.order',
  'order.status',
  'order.cancel',
  'template.manage',
  'template.delete',
  'guide.manage',
  'audit.view',
];

const STAFF_PERMISSIONS: PermissionKey[] = [
  'product.create',
  // 批量导入与新增商品同属「录入商品资料」，店员可以做；
  // 但导入的商品一律草稿，上架仍需店主审核。
  'product.import',
  'product.edit',
  'banner.manage',
  'request.review',
  'order.status',
  // 图文说明页与「编辑商品文案」同属内容维护，店员可以做。
  'guide.manage',
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
