import { MeasurementSection, MeasurementType } from '@qinyang/contracts';
import {
  MeasurementValidationException,
  validateMeasurements,
} from '../../src/modules/customization/measurement-validator';

const sections: MeasurementSection[] = [
  {
    sectionId: 'body',
    title: '身体测量',
    measurementType: MeasurementType.BODY,
    measurementFields: [
      {
        fieldCode: 'chest_bust',
        fieldName: '胸围',
        measurementType: MeasurementType.BODY,
        unit: 'cm',
        required: true,
        min: 60,
        max: 140,
        step: 0.5,
      },
      {
        fieldCode: 'height',
        fieldName: '身高',
        measurementType: MeasurementType.BODY,
        unit: 'cm',
        required: true,
        min: 140,
        max: 200,
        step: 0.5,
      },
      {
        fieldCode: 'weight',
        fieldName: '体重',
        measurementType: MeasurementType.BODY,
        unit: 'kg',
        required: true,
        min: 30,
        max: 150,
        step: 0.1,
      },
      {
        fieldCode: 'shoulder_body',
        fieldName: '肩宽（身体）',
        measurementType: MeasurementType.BODY,
        unit: 'cm',
        required: false,
        min: 30,
        max: 60,
      },
    ],
  },
];

const value = (fieldCode: string, fieldName: string, unit: string, v: number | null) => ({
  fieldCode,
  fieldName,
  measurementType: MeasurementType.BODY,
  unit,
  value: v,
});

describe('量体资料校验', () => {
  it('必填项齐全时通过，并按模板补齐选填项', () => {
    const result = validateMeasurements(sections, [
      value('chest_bust', '胸围', 'cm', 92),
      value('height', '身高', 'cm', 165),
      value('weight', '体重', 'kg', 55),
    ]);
    expect(result).toHaveLength(4);
    const shoulder = result.find((item) => item.fieldCode === 'shoulder_body');
    expect(shoulder?.value).toBeNull();
  });

  it('缺少必填项时报错并指出具体字段', () => {
    expect(() =>
      validateMeasurements(sections, [value('chest_bust', '胸围', 'cm', 92)]),
    ).toThrow(/身高|体重/);
  });

  it('数值超出模板区间时报错', () => {
    expect(() =>
      validateMeasurements(sections, [
        value('chest_bust', '胸围', 'cm', 200),
        value('height', '身高', 'cm', 165),
        value('weight', '体重', 'kg', 55),
      ]),
    ).toThrow(/胸围/);
  });

  it('单位与模板不一致时报错（拒绝顾客自行换算）', () => {
    expect(() =>
      validateMeasurements(sections, [
        value('chest_bust', '胸围', 'mm', 920),
        value('height', '身高', 'cm', 165),
        value('weight', '体重', 'kg', 55),
      ]),
    ).toThrow(/单位/);
  });

  it('模板之外的字段一律拒绝', () => {
    expect(() =>
      validateMeasurements(sections, [
        value('chest_bust', '胸围', 'cm', 92),
        value('height', '身高', 'cm', 165),
        value('weight', '体重', 'kg', 55),
        value('waist', '腰围', 'cm', 70),
      ]),
    ).toThrow(/不属于该商品的量体模板/);
  });

  it('异常携带业务错误码', () => {
    try {
      validateMeasurements(sections, []);
      throw new Error('应当抛出');
    } catch (error) {
      expect(error).toBeInstanceOf(MeasurementValidationException);
      expect((error as MeasurementValidationException).code).toBe('MEASUREMENT_INVALID');
    }
  });

  it('快照结构与模板字段完全一致（可回溯）', () => {
    const result = validateMeasurements(sections, [
      value('chest_bust', '胸围', 'cm', 92),
      value('height', '身高', 'cm', 165),
      value('weight', '体重', 'kg', 55),
    ]);
    expect(result.map((item) => item.fieldCode)).toEqual([
      'chest_bust',
      'height',
      'weight',
      'shoulder_body',
    ]);
  });
});
