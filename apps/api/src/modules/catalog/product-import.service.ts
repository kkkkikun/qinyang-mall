import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  PricingMode,
  ProductImportRequest,
  ProductImportResult,
  ProductImportRowResult,
  ProductImportRowStatus,
  ProductStatus,
  PRODUCT_IMPORT_CSV_HEADERS,
  PRODUCT_IMPORT_PRICING_MODE_ALIASES,
} from '@qinyang/contracts';
import { Repository } from 'typeorm';
import { Category } from '../../database/entities/category.entity';
import { MeasurementTemplate } from '../../database/entities/measurement-template.entity';
import { Product } from '../../database/entities/product.entity';
import { BusinessException } from '../../common/errors/business.exception';
import { parseCsv } from '../../common/csv';
import { AuditService } from '../audit/audit.service';
import type { AdminPrincipal } from '../../common/decorators/current-admin.decorator';

/** 单次导入的最大数据行数 */
const MAX_ROWS = 500;
/** 单元格文本长度上限（与 DTO 字段约束保持一致） */
const MAX_TEXT = {
  code: 32,
  name: 128,
  subtitle: 255,
  material: 128,
  description: 2000,
  careGuide: 2000,
} as const;

/** 一行 CSV 解析后的中间结构 */
interface ParsedRow {
  /** CSV 中的行号（表头为 1，数据首行为 2） */
  row: number;
  code: string;
  name: string;
  categoryId: string;
  pricingMode: PricingMode;
  priceCents: number | null;
  material: string | null;
  subtitle: string | null;
  description: string | null;
  careGuide: string | null;
  measurementTemplateId: string | null;
  sortOrder: number;
}

/** 解析失败的行 */
interface RowError {
  row: number;
  code: string;
  name: string;
  reason: string;
}

/**
 * 商品 CSV 批量导入。
 *
 * 背景：首期商品 76 件，每件要填编号 / 名称 / 分类 / 报价模式 / 价格 /
 * 材质 / 简介 / 洗护 / 模板 / 排序 十个字段。逐件在后台表单里录，
 * 既慢又容易录错；而「填错了再改回来」的成本更高。
 *
 * 设计口径（刻意保守，不替商家做主）：
 * - **只新增，不覆盖**：编号已存在的行一律跳过并给出原因，绝不覆盖既有商品；
 * - **一律草稿**：导入的商品状态固定为 DRAFT，上架仍走店主审核流程；
 * - **逐行结论**：每行都返回 CREATED / SKIPPED / FAILED 与原因，
 *   商家能立刻知道是哪一行、错在哪，不需要猜；
 * - **预检模式**（dryRun）：只校验不落库，先看结论再决定是否正式导入；
 * - **不编造任何经营数据**：CSV 里没有的名称、价格、材质不会被补默认值，
 *   缺什么就报「缺什么」。
 */
@Injectable()
export class ProductImportService {
  private readonly logger = new Logger(ProductImportService.name);

  constructor(
    @InjectRepository(Product)
    private readonly products: Repository<Product>,
    @InjectRepository(Category)
    private readonly categories: Repository<Category>,
    @InjectRepository(MeasurementTemplate)
    private readonly templates: Repository<MeasurementTemplate>,
    private readonly audit: AuditService,
  ) {}

  async importFromCsv(
    dto: ProductImportRequest,
    admin: AdminPrincipal,
  ): Promise<ProductImportResult> {
    const dryRun = dto.dryRun === true;
    const text = stripBom(dto.csv ?? '');
    if (!text.trim()) {
      throw BusinessException.badRequest('CSV 内容为空');
    }

    const table = parseCsv(text);
    if (table.length === 0) {
      throw BusinessException.badRequest('CSV 内容为空');
    }

    const header = table[0].map((cell) => cell.trim());
    const index = buildHeaderIndex(header);
    const missing = requiredHeaders().filter((name) => index.get(name) === undefined);
    if (missing.length > 0) {
      throw BusinessException.badRequest(
        `CSV 缺少必需的表头：${missing.join('、')}。标准表头为：${PRODUCT_IMPORT_CSV_HEADERS.join('、')}`,
      );
    }

    const dataRows = table.slice(1);
    if (dataRows.length === 0) {
      throw BusinessException.badRequest('CSV 只有表头，没有数据行');
    }
    if (dataRows.length > MAX_ROWS) {
      throw BusinessException.badRequest(
        `单次最多导入 ${MAX_ROWS} 行，当前 ${dataRows.length} 行，请分批导入`,
      );
    }

    // 预加载引用表，避免逐行查库（76 行 × 3 次查询 = 228 次往返）
    const [categoryRows, templateRows, existingRows] = await Promise.all([
      this.categories.find(),
      this.templates.find(),
      this.products.find({ select: { id: true, code: true } }),
    ]);

    const categoryByRef = new Map<string, Category>();
    for (const category of categoryRows) {
      categoryByRef.set(category.code.toLowerCase(), category);
      categoryByRef.set(category.id.toLowerCase(), category);
    }
    const templateByRef = new Map<string, MeasurementTemplate>();
    for (const template of templateRows) {
      if (template.status === 'ARCHIVED') continue;
      templateByRef.set(template.code.toLowerCase(), template);
      templateByRef.set(template.id.toLowerCase(), template);
    }
    const existingCodes = new Set(existingRows.map((row) => row.code));

    const rows: ProductImportRowResult[] = [];
    const valid: ParsedRow[] = [];
    const errors: RowError[] = [];
    const seenCodes = new Map<string, number>();

    for (let i = 0; i < dataRows.length; i += 1) {
      const cells = dataRows[i];
      const rowNumber = i + 2; // 表头占第 1 行
      const code = (cells[index.get('商品编号') as number] ?? '').trim();
      const name = (cells[index.get('商品名称') as number] ?? '').trim();

      const parsed = this.parseRow(cells, index, rowNumber, categoryByRef, templateByRef);
      if ('reason' in parsed) {
        errors.push({ row: rowNumber, code, name, reason: parsed.reason });
        continue;
      }

      // 文件内编号重复
      const firstRow = seenCodes.get(parsed.code);
      if (firstRow !== undefined) {
        errors.push({
          row: rowNumber,
          code: parsed.code,
          name: parsed.name,
          reason: `商品编号与第 ${firstRow} 行重复`,
        });
        continue;
      }
      seenCodes.set(parsed.code, rowNumber);

      // 与库中已有商品重复 → 跳过（不覆盖）
      if (existingCodes.has(parsed.code)) {
        rows.push({
          row: rowNumber,
          code: parsed.code,
          name: parsed.name,
          status: 'SKIPPED',
          productId: null,
          reason: `商品编号 ${parsed.code} 已存在，已跳过（不覆盖既有商品）`,
        });
        continue;
      }

      valid.push(parsed);
    }

    let created = 0;
    const createdRows: { code: string; id: string }[] = [];

    if (!dryRun) {
      for (const item of valid) {
        try {
          const saved = await this.insertProduct(item, admin);
          created += 1;
          createdRows.push({ code: saved.code, id: saved.id });
          rows.push({
            row: item.row,
            code: item.code,
            name: item.name,
            status: 'CREATED',
            productId: saved.id,
            reason: null,
          });
        } catch (error) {
          errors.push({
            row: item.row,
            code: item.code,
            name: item.name,
            reason: error instanceof Error && error.message ? error.message : '写入失败',
          });
        }
      }
    } else {
      for (const item of valid) {
        rows.push({
          row: item.row,
          code: item.code,
          name: item.name,
          status: 'PENDING',
          productId: null,
          reason: null,
        });
      }
    }

    for (const failure of errors) {
      rows.push({
        row: failure.row,
        code: failure.code,
        name: failure.name,
        status: 'FAILED',
        productId: null,
        reason: failure.reason,
      });
    }

    rows.sort((a, b) => a.row - b.row);

    const result: ProductImportResult = {
      dryRun,
      total: dataRows.length,
      created,
      pending: dryRun ? valid.length : 0,
      skipped: rows.filter((row) => row.status === 'SKIPPED').length,
      failed: rows.filter((row) => row.status === 'FAILED').length,
      rows,
    };

    await this.audit.record({
      actorId: admin.id,
      actorName: admin.displayName,
      actorRole: admin.role,
      action: dryRun ? 'product.import.preview' : 'product.import',
      targetType: 'product',
      targetId: null,
      after: {
        dryRun,
        total: result.total,
        created: result.created,
        pending: result.pending,
        skipped: result.skipped,
        failed: result.failed,
        // 审计只保留事实摘要，不落经营数据原文
        codes: createdRows.slice(0, 200).map((item) => item.code),
        failures: errors.slice(0, 50).map((item) => ({
          row: item.row,
          code: item.code,
          reason: item.reason,
        })),
      },
      ip: null,
    });

    return result;
  }

  // ───────────────────────── 内部实现 ─────────────────────────

  /** 解析单行；返回 ParsedRow 或 { reason } */
  private parseRow(
    cells: string[],
    index: Map<string, number>,
    rowNumber: number,
    categoryByRef: Map<string, Category>,
    templateByRef: Map<string, MeasurementTemplate>,
  ): ParsedRow | RowError {
    const cell = (name: string): string => {
      const at = index.get(name);
      if (at === undefined) return '';
      return (cells[at] ?? '').trim();
    };

    const code = cell('商品编号');
    if (!code) return { row: rowNumber, code: '', name: '', reason: '缺少商品编号' };
    if (code.length > MAX_TEXT.code) {
      return {
        row: rowNumber,
        code,
        name: '',
        reason: `商品编号超过 ${MAX_TEXT.code} 个字符`,
      };
    }

    const name = cell('商品名称');
    if (!name) {
      return { row: rowNumber, code, name: '', reason: '缺少商品名称' };
    }
    if (name.length > MAX_TEXT.name) {
      return {
        row: rowNumber,
        code,
        name,
        reason: `商品名称超过 ${MAX_TEXT.name} 个字符`,
      };
    }

    const categoryRef = cell('分类编号');
    if (!categoryRef) {
      return { row: rowNumber, code, name, reason: '缺少分类编号' };
    }
    const category = categoryByRef.get(categoryRef.toLowerCase());
    if (!category) {
      return {
        row: rowNumber,
        code,
        name,
        reason: `分类「${categoryRef}」不存在（可填分类编号 code 或分类 id）`,
      };
    }
    if (category.status !== 'ACTIVE') {
      return {
        row: rowNumber,
        code,
        name,
        reason: `分类「${category.name}」已停用，不能挂载商品`,
      };
    }

    const pricingMode = this.parsePricingMode(cell('报价模式'));
    if (!pricingMode) {
      return {
        row: rowNumber,
        code,
        name,
        reason: `报价模式「${cell('报价模式')}」无法识别（可用：仅按量体报价 / 固定价可直售）`,
      };
    }

    let priceCents: number | null = null;
    const priceText = cell('价格(元)');
    if (pricingMode === PricingMode.FIXED_PRICE) {
      if (!priceText) {
        return { row: rowNumber, code, name, reason: '固定价可直售模式必须填写「价格(元)」' };
      }
      const price = Number(priceText);
      if (!Number.isFinite(price) || price <= 0) {
        return {
          row: rowNumber,
          code,
          name,
          reason: `价格「${priceText}」不是合法的正数`,
        };
      }
      if (price > 1000000) {
        return { row: rowNumber, code, name, reason: '价格超过 100 万元上限' };
      }
      priceCents = Math.round(price * 100);
    } else if (priceText) {
      // 仅按量体报价却填了价格：静默忽略会丢数据，必须报错让商家自己决定
      return {
        row: rowNumber,
        code,
        name,
        reason: '仅按量体报价模式不能填写价格，请清空「价格(元)」或改用固定价可直售',
      };
    }

    const subtitle = cell('副标题');
    if (subtitle.length > MAX_TEXT.subtitle) {
      return {
        row: rowNumber,
        code,
        name,
        reason: `副标题超过 ${MAX_TEXT.subtitle} 个字符`,
      };
    }
    const material = cell('材质');
    if (material.length > MAX_TEXT.material) {
      return { row: rowNumber, code, name, reason: `材质超过 ${MAX_TEXT.material} 个字符` };
    }
    const description = cell('商品简介');
    if (description.length > MAX_TEXT.description) {
      return {
        row: rowNumber,
        code,
        name,
        reason: `商品简介超过 ${MAX_TEXT.description} 个字符`,
      };
    }
    const careGuide = cell('洗护说明');
    if (careGuide.length > MAX_TEXT.careGuide) {
      return {
        row: rowNumber,
        code,
        name,
        reason: `洗护说明超过 ${MAX_TEXT.careGuide} 个字符`,
      };
    }

    let measurementTemplateId: string | null = null;
    const templateRef = cell('量体模板编号');
    if (templateRef) {
      const template = templateByRef.get(templateRef.toLowerCase());
      if (!template) {
        return {
          row: rowNumber,
          code,
          name,
          reason: `量体模板「${templateRef}」不存在（可填模板 code 或模板 id）`,
        };
      }
      measurementTemplateId = template.id;
    }

    let sortOrder = 0;
    const sortText = cell('排序');
    if (sortText) {
      const value = Number(sortText);
      if (!Number.isInteger(value) || value < 0 || value > 999999) {
        return { row: rowNumber, code, name, reason: `排序「${sortText}」必须是非负整数` };
      }
      sortOrder = value;
    }

    return {
      row: rowNumber,
      code,
      name,
      categoryId: category.id,
      pricingMode,
      priceCents,
      material: material || null,
      subtitle: subtitle || null,
      description: description || null,
      careGuide: careGuide || null,
      measurementTemplateId,
      sortOrder,
    };
  }

  private parsePricingMode(text: string): PricingMode | null {
    if (!text) return PricingMode.QUOTE_ONLY; // 留空按默认「仅按量体报价」
    return PRODUCT_IMPORT_PRICING_MODE_ALIASES[text] ?? null;
  }

  /** 落库一行（导入商品一律草稿） */
  private async insertProduct(item: ParsedRow, admin: AdminPrincipal): Promise<Product> {
    const entity = this.products.create({
      code: item.code,
      name: item.name,
      subtitle: item.subtitle,
      categoryId: item.categoryId,
      pricingMode: item.pricingMode,
      priceCents: item.priceCents,
      material: item.material,
      description: item.description,
      careGuide: item.careGuide,
      measurementTemplateId: item.measurementTemplateId,
      sortOrder: item.sortOrder,
      // 与 POST /admin/products 保持一致：新增一律草稿，上架是店主专属动作
      status: ProductStatus.DRAFT,
      createdById: admin.id,
      publishedAt: null,
    });
    return this.products.save(entity);
  }
}

/** 去掉 UTF-8 BOM */
function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/** 必须存在的表头 */
function requiredHeaders(): string[] {
  return ['商品编号', '商品名称', '分类编号'];
}

/** 表头 → 列下标（表头名去空白、忽略大小写差异不影响中文） */
function buildHeaderIndex(header: string[]): Map<string, number> {
  const index = new Map<string, number>();
  header.forEach((raw, i) => {
    const name = raw.replace(/^\uFEFF/, '').trim();
    if (!name || index.has(name)) return;
    index.set(name, i);
  });
  return index;
}
