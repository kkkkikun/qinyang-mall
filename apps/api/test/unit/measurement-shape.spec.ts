import { MeasurementType } from '@qinyang/contracts';
import {
  assertSectionsUsable,
  toMeasurementField,
  toMeasurementSections,
} from '../../src/modules/templates/measurement-shape';

/**
 * 量体模板形状归一化测试。
 *
 * 这组用例守的是一个真实缺陷：原型数据是 snake_case、契约是 camelCase，
 * 不归一化时接口返回 `measurementFields: undefined`，
 * 顾客端量体表单渲染为空、服务端校验形同虚设。
 */
describe('量体模板形状归一化', () => {
  const snakeSection = {
    section_id: 'body',
    title: '身体测量',
    measurement_type: 'body',
    description: '先量三围',
    measurement_fields: [
      {
        field_code: 'chest_bust',
        field_name: '胸围',
        measurement_type: 'body',
        unit: 'cm',
        required: true,
        instruction: '自然呼吸',
        tips: ['不要勒紧'],
        illustration: 'prototype/assets/img/measure/chest.svg',
        min: 60,
        max: 140,
        step: 0.5
      },
      {
        field_code: 'weight',
        field_name: '体重',
        measurement_type: 'body',
        unit: 'kg',
        required: false,
        min: 30,
        max: 150,
        step: 0.1
      }
    ]
  };

  it('把原型的 snake_case 分区转成契约的 camelCase', () => {
    const [section] = toMeasurementSections([snakeSection]);
    expect(section.sectionId).toBe('body');
    expect(section.title).toBe('身体测量');
    expect(section.measurementType).toBe('body');
    expect(section.measurementFields).toHaveLength(2);
  });

  it('把原型的 snake_case 字段转成契约的 camelCase', () => {
    const [section] = toMeasurementSections([snakeSection]);
    const field = section.measurementFields[0];
    expect(field.fieldCode).toBe('chest_bust');
    expect(field.fieldName).toBe('胸围');
    expect(field.measurementType).toBe('body');
    expect(field.unit).toBe('cm');
    expect(field.required).toBe(true);
    expect(field.min).toBe(60);
    expect(field.max).toBe(140);
    expect(field.step).toBe(0.5);
    expect(field.tips).toEqual(['不要勒紧']);
  });

  it('已经是 camelCase 的输入保持不变（幂等）', () => {
    const camel = {
      sectionId: 'body',
      title: '身体测量',
      measurementType: 'body',
      measurementFields: [
        {
          fieldCode: 'height',
          fieldName: '身高',
          measurementType: 'body',
          unit: 'cm',
          required: true
        }
      ]
    };
    const [section] = toMeasurementSections([camel]);
    expect(section.sectionId).toBe('body');
    expect(section.measurementFields[0].fieldCode).toBe('height');
    expect(section.measurementFields[0].required).toBe(true);
  });

  it('两种形状混用也能得到一致的字段集合', () => {
    const camel = {
      sectionId: 'body',
      title: '身体测量',
      measurementType: 'body',
      measurementFields: [
        {
          fieldCode: 'chest_bust',
          field_name: '胸围',
          measurement_type: 'body',
          unit: 'cm',
          required: true
        }
      ]
    };
    const [section] = toMeasurementSections([camel]);
    expect(section.measurementFields[0].fieldCode).toBe('chest_bust');
    expect(section.measurementFields[0].fieldName).toBe('胸围');
  });

  it('缺省值有安全兜底：必填 false、上下限 undefined、单位 cm', () => {
    const field = toMeasurementField({ field_code: 'x', field_name: 'X' });
    expect(field.required).toBe(false);
    expect(field.unit).toBe('cm');
    expect(field.min).toBeUndefined();
    expect(field.max).toBeUndefined();
    expect(field.tips).toEqual([]);
    expect(field.illustration).toBeNull();
  });

  it('非法输入不会抛出，产出空数组', () => {
    expect(toMeasurementSections(undefined)).toEqual([]);
    expect(toMeasurementSections('not-an-array')).toEqual([]);
    expect(toMeasurementSections([null])[0].measurementFields).toEqual([]);
  });

  it('分区没有字段时 assertSectionsUsable 报错（防止静默写空模板）', () => {
    expect(() => assertSectionsUsable([], '模板 A')).toThrow(/没有任何字段/);
    expect(() =>
      assertSectionsUsable(
        [
          {
            sectionId: 's',
            title: 't',
            measurementType: MeasurementType.BODY,
            measurementFields: []
          }
        ],
        '模板 B'
      )
    ).toThrow(/模板 B/);
  });

  it('有字段的模板通过校验', () => {
    expect(() =>
      assertSectionsUsable(toMeasurementSections([snakeSection]), '模板 C')
    ).not.toThrow();
  });
});
