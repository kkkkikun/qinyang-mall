/**
 * 图文指南视图模型。
 *
 * 内容来源：
 * 1. 首选后端 GET /guides/:slug（slug：measure-top / measure-bottom / care / material）；
 * 2. 接口未返回内容时，量体类指南回落到本地量体模板（data/measure_templates.ts，
 *    来自 prototype/data/measurement_templates.json），洗护 / 材质类给出「待商家提供」提示，
 *    不编造商家资料。
 */

import { GuideContent } from '../types/local';
import { MeasurementTemplateDto } from '../types/contracts';
import { MEASURE_TEMPLATES } from '../data/measure_templates';

/** 小程序内置的量体示意图（由 prototype/assets/img/measure/*.svg 转换而来） */
const MEASURE_ASSETS = [
  'chest',
  'chest_flat',
  'height',
  'hip',
  'hip_flat',
  'length',
  'neck',
  'scarf_length',
  'scarf_width',
  'shoulder_body',
  'shoulder_flat',
  'sleeve',
  'waist',
  'waist_flat',
  'weight'
];

export interface GuideFieldVM {
  key: string;
  name: string;
  instruction: string;
  tips: string[];
  image: string;
  typeLabel: string;
}

export interface GuideSectionVM {
  key: string;
  title: string;
  description: string;
  items: string[];
  image: string;
  fields: GuideFieldVM[];
}

export interface GuideVM {
  slug: string;
  title: string;
  eyebrow: string;
  summary: string;
  sections: GuideSectionVM[];
  source: 'api' | 'local';
  empty: boolean;
  /** 是否为量体类指南（决定是否展示「身高体重」提示） */
  isMeasure: boolean;
}

/** 示意图引用 → 小程序本地 PNG（小程序不支持 SVG 作为 image 源） */
export function resolveIllustration(ref?: string | null): string {
  if (!ref) {
    return '';
  }
  const match = ref.match(/([a-z_]+)\.svg$/i);
  if (match && MEASURE_ASSETS.indexOf(match[1]) >= 0) {
    return '/assets/measure/' + match[1] + '.png';
  }
  return ref;
}

function typeLabel(type: string): string {
  return type === 'garment_flat' ? '合身衣物平铺测量' : '身体测量';
}

function templateByCode(code: string): MeasurementTemplateDto | null {
  const list = MEASURE_TEMPLATES.filter((t) => t.id === code || t.code === code);
  return list.length ? list[0] : null;
}

const SLUG_TO_TEMPLATE: Record<string, string> = {
  'measure-top': 'TPL-KNIT-TOPS',
  'measure-bottom': 'TPL-BOTTOM'
};

const SLUG_TITLES: Record<string, string> = {
  'measure-top': '上装量体指南',
  'measure-bottom': '长裤量体指南',
  care: '羊绒洗护指南',
  material: '材质定制说明'
};

/** 接口内容 → 视图模型 */
function fromApi(slug: string, content: GuideContent): GuideVM {
  const sections: GuideSectionVM[] = (content.sections || []).map((section, i) => ({
    key: 's' + i,
    title: section.title || '',
    description: section.description || '',
    items: section.items || [],
    image: resolveIllustration(section.illustration),
    /*
     * 示意图字段由服务端按 `fieldCodes` 从**已发布量体模板**解析。
     *
     * 此前这里写死 `fields: []`，于是接口一有内容，
     * 量体示意图（胸围/身高/体重…）就整体消失 ——
     * 顾客看到的是纯文字说明，反而不如接口没内容时的本地模板版本。
     * 现在按服务端下发的字段元数据渲染，与量体表单里的说法保持一致。
     */
    fields: (section.fields || []).map((field) => ({
      key: field.fieldCode,
      name: field.fieldName,
      instruction: field.instruction || '',
      tips: field.tips || [],
      image: resolveIllustration(field.illustration),
      typeLabel: typeLabel(field.measurementType)
    }))
  }));
  return {
    slug,
    title: content.title || SLUG_TITLES[slug] || '指南',
    eyebrow: slug.indexOf('measure') === 0 ? '量体指南' : 'QINYANG',
    summary: content.summary || '',
    sections,
    source: 'api',
    empty: sections.length === 0,
    isMeasure: slug.indexOf('measure') === 0
  };
}

/** 本地量体模板 → 视图模型 */
function fromLocalTemplate(slug: string): GuideVM {
  const code = SLUG_TO_TEMPLATE[slug];
  const tpl = code ? templateByCode(code) : null;
  if (!tpl) {
    return {
      slug,
      title: SLUG_TITLES[slug] || '指南',
      eyebrow: 'QINYANG',
      summary: '',
      sections: [],
      source: 'local',
      empty: true,
      isMeasure: slug.indexOf('measure') === 0
    };
  }
  const sections: GuideSectionVM[] = tpl.measurementSections.map((section) => ({
    key: section.sectionId,
    title: section.title,
    description: section.description || '',
    items: [],
    image: '',
    fields: section.measurementFields.map((f) => ({
      key: f.fieldCode,
      name: f.fieldName,
      instruction: f.instruction || '',
      tips: f.tips || [],
      image: resolveIllustration(f.illustration),
      typeLabel: typeLabel(f.measurementType)
    }))
  }));
  return {
    slug,
    title: SLUG_TITLES[slug] || tpl.name,
    eyebrow: '量体指南',
    summary: tpl.summary || '',
    sections,
    source: 'local',
    empty: false,
    isMeasure: true
  };
}

/**
 * 构建指南视图模型：接口内容优先，量体类接口无内容时回落本地模板。
 */
export function buildGuideVM(slug: string, content: GuideContent | null): GuideVM {
  if (content && content.sections && content.sections.length) {
    return fromApi(slug, content);
  }
  if (SLUG_TO_TEMPLATE[slug]) {
    return fromLocalTemplate(slug);
  }
  return {
    slug,
    title: SLUG_TITLES[slug] || '指南',
    eyebrow: 'QINYANG',
    summary: '',
    sections: [],
    source: 'local',
    empty: true,
    isMeasure: slug.indexOf('measure') === 0
  };
}
