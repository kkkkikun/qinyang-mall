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

  async create(dto: CategoryUpsertRequest, admin: AdminPrincipal): Promise<CategoryDto> {
    const existing = await this.categories.findOne({ where: { code: dto.code } });
    if (existing) throw BusinessException.badRequest(`分类编码 ${dto.code} 已存在`);

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
