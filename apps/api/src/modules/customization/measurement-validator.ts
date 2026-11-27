import {
  ERROR_CODES,
  MeasurementField,
  MeasurementFieldValue,
  MeasurementSection,
} from '@qinyang/contracts';

/** 允许的计量单位：模板与提交必须一致，不接受顾客自行换算 */
export const ALLOWED_MEASUREMENT_UNITS = new Set(['cm', 'kg']);

export interface MeasurementValidationError {
  code: string;
  message: string;
}

export class MeasurementValidationException extends Error {
  readonly code: string;

  constructor(message: string, code: string = ERROR_CODES.MEASUREMENT_INVALID) {
    super(message);
    this.name = 'MeasurementValidationException';
    this.code = code;
  }
}

/**
 * 量体资料校验（纯函数，便于单元测试）。
 *
 * 规则：
 * 1. 必填字段必须填写数值；
 * 2. 数值必须落在模板给出的 min/max 区间内；
 * 3. 单位必须与模板一致；
 * 4. 模板之外的字段一律拒绝，防止脏数据进入快照；
 * 5. 缺失的选填项补空值，保证快照结构完整、可回溯。
 */
export function validateMeasurements(
  sections: MeasurementSection[],
  input: MeasurementFieldValue[],
): MeasurementFieldValue[] {
  const templateFields = new Map<string, MeasurementField>();
  for (const section of sections ?? []) {
    for (const field of section.measurementFields ?? []) {
      templateFields.set(field.fieldCode, field);
    }
  }

  const submitted = new Map<string, MeasurementFieldValue>();
  for (const item of input ?? []) {
    const field = templateFields.get(item.fieldCode);
    if (!field) {
      // 面向顾客的文案用中文字段名，不要把英文 fieldCode 抛给顾客
      throw new MeasurementValidationException(
        `量体项「${item.fieldName || item.fieldCode}」不属于该商品的量体模板，请刷新后重新填写`,
      );
    }
    if (!ALLOWED_MEASUREMENT_UNITS.has(field.unit)) {
      throw new MeasurementValidationException(
        `量体模板字段 ${field.fieldName} 的单位配置非法：${field.unit}`,
      );
    }
    if (item.unit !== field.unit) {
      throw new MeasurementValidationException(
        `量体字段 ${field.fieldName} 的单位应为 ${field.unit}`,
      );
    }
    if (item.value !== null && item.value !== undefined) {
      if (!Number.isFinite(item.value)) {
        throw new MeasurementValidationException(`量体字段 ${field.fieldName} 的数值无效`);
      }
      if (field.min !== null && field.min !== undefined && item.value < field.min) {
        throw new MeasurementValidationException(
          `${field.fieldName} 不能小于 ${field.min}${field.unit}`,
        );
      }
      if (field.max !== null && field.max !== undefined && item.value > field.max) {
        throw new MeasurementValidationException(
          `${field.fieldName} 不能大于 ${field.max}${field.unit}`,
        );
      }
      /*
       * 模板没定义区间时的兜底：身体测量与成衣尺寸**不可能是负数**。
       *
       * 此前模板字段的 min/max 是可选的，没定义区间时任何值都收 ——
       * 于是「胸围 = -50cm」会被照单全收并写进量体快照，
       * 商家按它制作会得到一件尺寸荒谬的衣服。
       */
      const hasMin = field.min !== null && field.min !== undefined;
      if (!hasMin && item.value < 0) {
        throw new MeasurementValidationException(
          `${field.fieldName} 不能是负数`,
        );
      }
    }
    submitted.set(item.fieldCode, {
      fieldCode: item.fieldCode,
      fieldName: field.fieldName,
      measurementType: field.measurementType,
      unit: field.unit,
      value: item.value ?? null,
    });
  }

  const missing: string[] = [];
  for (const [code, field] of templateFields) {
    const value = submitted.get(code);
    if (field.required && (value?.value === null || value?.value === undefined)) {
      missing.push(field.fieldName);
    }
  }
  if (missing.length > 0) {
    throw new MeasurementValidationException(
      `以下必填量体项未完成：${missing.join('、')}`,
    );
  }

  const result: MeasurementFieldValue[] = [];
  for (const [code, field] of templateFields) {
    result.push(
      submitted.get(code) ?? {
        fieldCode: code,
        fieldName: field.fieldName,
        measurementType: field.measurementType,
        unit: field.unit,
        value: null,
      },
    );
  }
  return result;
}
