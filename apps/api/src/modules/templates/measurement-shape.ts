import { MeasurementField, MeasurementSection } from '@qinyang/contracts';

/**
 * 量体模板 JSON 列的形状归一化。
 *
 * 背景（真实缺陷）：
 * 原型数据 `prototype/data/measurement_templates.json` 用 snake_case
 * （`section_id` / `measurement_fields` / `field_code` …），
 * 而契约 `MeasurementSection` / `MeasurementField` 要求 camelCase。
 * 早期种子把原型 JSON 原样写进 `measurement_sections` 列，
 * 接口于是返回 `sectionId: undefined`、`measurementFields: undefined`：
 * 顾客端量体表单渲染出 **0 个字段**，提交时 `measurements` 为空，
 * 服务端也无从校验 —— 而集成测试用的是自己构造的 camelCase 模板，
 * 所以一直没能暴露。
 *
 * 这里把两种形状统一到契约形状：
 * - 写路径（种子 / 后台新建）统一存 camelCase；
 * - 读路径（历史行）读到时归一化，保证旧数据依然可用。
 *
 * 归一化是幂等的：已经是 camelCase 的输入原样返回。
 */

interface RawField {
  [key: string]: unknown;
}

interface RawSection {
  [key: string]: unknown;
}

const asRecord = (value: unknown): RawField => {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as RawField;
  }
  return {};
};

const asArray = (value: unknown): unknown[] =>
  Array.isArray(value) ? value : [];

const pick = (source: RawField, camel: string, snake: string): unknown => {
  if (source[camel] !== undefined && source[camel] !== null) {
    return source[camel];
  }
  return source[snake];
};

const asOptionalString = (value: unknown): string | undefined =>
  typeof value === 'string' && value.length > 0 ? value : undefined;

const asOptionalNumber = (value: unknown): number | null | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

/** 单个字段 → 契约形状 */
export const toMeasurementField = (input: unknown): MeasurementField => {
  const raw = asRecord(input);
  const min = asOptionalNumber(raw.min);
  const max = asOptionalNumber(raw.max);
  const step = asOptionalNumber(raw.step);
  return {
    fieldCode: String(pick(raw, 'fieldCode', 'field_code') ?? ''),
    fieldName: String(pick(raw, 'fieldName', 'field_name') ?? ''),
    measurementType: String(
      pick(raw, 'measurementType', 'measurement_type') ?? 'body',
    ) as MeasurementField['measurementType'],
    unit: String(raw.unit ?? 'cm'),
    required: raw.required === true,
    instruction: asOptionalString(raw.instruction),
    tips: Array.isArray(raw.tips) ? raw.tips.map((tip) => String(tip)) : [],
    illustration:
      typeof raw.illustration === 'string' && raw.illustration.length > 0
        ? raw.illustration
        : null,
    min: min ?? undefined,
    max: max ?? undefined,
    step: step ?? undefined
  };
};

/** 单个分区 → 契约形状 */
export const toMeasurementSection = (input: unknown): MeasurementSection => {
  const raw = asRecord(input);
  const fields = pick(raw, 'measurementFields', 'measurement_fields');
  return {
    sectionId: String(pick(raw, 'sectionId', 'section_id') ?? ''),
    title: String(raw.title ?? ''),
    measurementType: String(
      pick(raw, 'measurementType', 'measurement_type') ?? 'body',
    ) as MeasurementSection['measurementType'],
    description: asOptionalString(raw.description),
    measurementFields: asArray(fields).map(toMeasurementField)
  };
};

/**
 * 整组分区 → 契约形状。
 *
 * @param sections JSON 列里的原始值（可能是原型 snake_case，也可能是契约 camelCase）
 */
export const toMeasurementSections = (sections: unknown): MeasurementSection[] =>
  asArray(sections).map(toMeasurementSection);

/**
 * 形状自检：分区是否含有可用字段。
 *
 * 用于「导入 / 种子」这类写路径的快速失败 ——
 * 与其把 0 字段的模板静默写进库，不如当场报错。
 */
export const assertSectionsUsable = (
  sections: MeasurementSection[],
  label: string
): void => {
  const fieldCount = sections.reduce(
    (sum, section) => sum + section.measurementFields.length,
    0
  );
  if (!sections.length || fieldCount === 0) {
    throw new Error(
      `${label}：量体分区没有任何字段（分区 ${sections.length} 个 / 字段 ${fieldCount} 个）。` +
        '这会让顾客端表单渲染为空、提交时量体资料为空。'
    );
  }
};
