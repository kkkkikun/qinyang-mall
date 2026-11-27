import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { CategoryDto, CategoryUpsertRequest } from '@qinyang/contracts';
import { In, Repository } from 'typeorm';
import { Category } from '../../database/entities/category.entity';
import { Product } from '../../database/entities/product.entity';
import { BusinessException } from '../../common/errors/business.exception';
import { AuditService } from '../audit/audit.service';
import type { AdminPrincipal } from '../../common/decorators/current-admin.decorator';

@Injectable()
export class CategoriesService {
  constructor(
    @InjectRepository(Category)
    private readonly categories: Repository<Category>,
    @InjectRepository(Product)
    private readonly products: Repository<Product>,
    private readonly audit: AuditService,
  ) {}

  /** 分类树（含二级），并统计商品数 */
  async tree(onlyActive = false): Promise<CategoryDto[]> {
    const where = onlyActive ? { status: 'ACTIVE' as const } : {};
    const rows = await this.categories.find({ where, order: { sortOrder: 'ASC', name: 'ASC' } });

    const counts = new Map<string, number>();
    if (rows.length > 0) {
      const grouped = await this.products
        .createQueryBuilder('p')
        .select('p.categoryId', 'categoryId')
        .addSelect('COUNT(*)', 'cnt')
        .where({ status: 'PUBLISHED' })
        .groupBy('p.categoryId')
        .getRawMany<{ categoryId: string; cnt: string }>();
      for (const row of grouped) {
        counts.set(row.categoryId, Number(row.cnt));
      }
    }

    const byId = new Map<string, CategoryDto>();
    for (const row of rows) {
      byId.set(row.id, {
        id: row.id,
        code: row.code,
        name: row.name,
        parentId: row.parentId,
        level: row.level,
        sortOrder: row.sortOrder,
        status: row.status,
        productCount: counts.get(row.id) ?? 0,
        children: [],
      });
    }

    const roots: CategoryDto[] = [];
    for (const node of byId.values()) {
      if (node.parentId && byId.has(node.parentId)) {
        byId.get(node.parentId)?.children?.push(node);
      } else {
        roots.push(node);
      }
    }

    // 商品数向下汇总：一级分类本身不挂商品，商品在二级分组上，
    // 因此一级分类的商品数必须等于其自身 + 所有下级分组之和，
    // 否则顾客在分类栏看到的一级分类恒为 0 件。
    const rollup = (node: CategoryDto): number => {
      let sum = counts.get(node.id) ?? 0;
      for (const child of node.children ?? []) {
        sum += rollup(child);
      }
      node.productCount = sum;
      return sum;
    };
    for (const root of roots) {
      rollup(root);
    }
    return roots;
  }

  async listFlat(onlyActive = false): Promise<CategoryDto[]> {
    const where = onlyActive ? { status: 'ACTIVE' as const } : {};
    const rows = await this.categories.find({ where, order: { sortOrder: 'ASC' } });
    return rows.map((row) => ({
      id: row.id,
      code: row.code,
      name: row.name,
      parentId: row.parentId,
      level: row.level,
      sortOrder: row.sortOrder,
      status: row.status,
    }));
  }

  /**
   * 父分类合法性校验。
   *
   * 此前 `parentId` 完全不校验，于是：
   * - 把分类挂到**自己**下面 → 自己成为自己的子节点，分类树渲染成死循环；
   * - 把分类挂到**自己的子孙**下面 → 形成环，同样死循环；
   * - 挂到**不存在的**分类 → 该分类从树上「消失」（既不是根，也找不到父节点）。
   *
   * 顾客端分类页直接遍历这棵树，环会让页面无限递归。
   */
  private async assertParent(parentId: string | null | undefined, selfId: string | null): Promise<void> {
    if (!parentId) return;
    if (selfId && parentId === selfId) {
      throw BusinessException.badRequest('分类不能把自己设为父分类');
    }
    const parent = await this.categories.findOne({ where: { id: parentId } });
    if (!parent) {
      throw BusinessException.badRequest('父分类不存在');
    }
    if (parent.level >= 2) {
      throw BusinessException.badRequest('分类只有两级：一级分类 → 二级分组，不能再往下挂');
    }
    if (!selfId) return;

    // 沿父链向上走：若途中遇到自己，说明形成了环
    let cursor: Category | null = parent;
    const seen = new Set<string>();
    while (cursor) {
      if (cursor.id === selfId) {
        throw BusinessException.badRequest('不能把分类挂到自己的下级分类下面');
      }
      if (seen.has(cursor.id)) break; // 已有环（历史脏数据），到此为止
      seen.add(cursor.id);
      cursor = cursor.parentId
        ? await this.categories.findOne({ where: { id: cursor.parentId } })
        : null;
    }
  }

  async create(dto: CategoryUpsertRequest, admin: AdminPrincipal): Promise<CategoryDto> {
    const existing = await this.categories.findOne({ where: { code: dto.code } });
    if (existing) throw BusinessException.badRequest(`分类编码 ${dto.code} 已存在`);

    await this.assertParent(dto.parentId, null);

    const level = dto.parentId ? 2 : 1;
    const entity = this.categories.create({
      code: dto.code,
      name: dto.name,
      parentId: dto.parentId ?? null,
      level,
      sortOrder: dto.sortOrder ?? 0,
      status: dto.status ?? 'ACTIVE',
    });
    const saved = await this.categories.save(entity);

    await this.audit.record({
      actorId: admin.id,
      actorName: admin.displayName,
      actorRole: admin.role,
      action: 'category.create',
      targetType: 'category',
      targetId: saved.id,
      after: { code: saved.code, name: saved.name, parentId: saved.parentId },
      ip: null,
    });

    return {
      id: saved.id,
      code: saved.code,
      name: saved.name,
      parentId: saved.parentId,
      level: saved.level,
      sortOrder: saved.sortOrder,
      status: saved.status,
    };
  }

  async update(
    id: string,
    dto: CategoryUpsertRequest,
    admin: AdminPrincipal,
  ): Promise<CategoryDto> {
    const category = await this.categories.findOne({ where: { id } });
    if (!category) throw BusinessException.notFound('分类不存在');

    // 父分类校验：不能挂到自己或自己的子孙下面（会形成环，分类树会渲染成死循环）
    await this.assertParent(dto.parentId, category.id);

    const before = { code: category.code, name: category.name, parentId: category.parentId };
    category.code = dto.code;
    category.name = dto.name;
    category.parentId = dto.parentId ?? null;
    category.level = dto.parentId ? 2 : 1;
    category.sortOrder = dto.sortOrder ?? category.sortOrder;
    category.status = dto.status ?? category.status;
    const saved = await this.categories.save(category);

    await this.audit.record({
      actorId: admin.id,
      actorName: admin.displayName,
      actorRole: admin.role,
      action: 'category.update',
      targetType: 'category',
      targetId: saved.id,
      before,
      after: { code: saved.code, name: saved.name, parentId: saved.parentId },
      ip: null,
    });

    return {
      id: saved.id,
      code: saved.code,
      name: saved.name,
      parentId: saved.parentId,
      level: saved.level,
      sortOrder: saved.sortOrder,
      status: saved.status,
    };
  }

  async remove(id: string, admin: AdminPrincipal): Promise<void> {
    const category = await this.categories.findOne({ where: { id } });
    if (!category) throw BusinessException.notFound('分类不存在');

    const productCount = await this.products.count({ where: { categoryId: id } });
    if (productCount > 0) {
      throw BusinessException.badRequest(`该分类下仍有 ${productCount} 件商品，不能删除`);
    }
    const childCount = await this.categories.count({ where: { parentId: id } });
    if (childCount > 0) {
      throw BusinessException.badRequest('该分类下仍有子分类，不能删除');
    }

    await this.categories.delete({ id });
    await this.audit.record({
      actorId: admin.id,
      actorName: admin.displayName,
      actorRole: admin.role,
      action: 'category.delete',
      targetType: 'category',
      targetId: id,
      before: { code: category.code, name: category.name },
      ip: null,
    });
  }

  /** 取分类 id 及其所有子分类 id，用于商品筛选 */
  async resolveCategoryIds(categoryId: string): Promise<string[]> {
    const children = await this.categories.find({ where: { parentId: categoryId } });
    return [categoryId, ...children.map((child) => child.id)];
  }

  async countProducts(categoryIds: string[]): Promise<number> {
    if (categoryIds.length === 0) return 0;
    return this.products.count({ where: { categoryId: In(categoryIds) } });
  }
}
