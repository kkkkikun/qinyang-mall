// 定制申请表：按量体模板动态渲染字段 + 校验 + 进度条 + 防重复提交
import { getNavMetrics } from '../../utils/nav';
import { createCustomizationRequest, product, resolveTemplate } from '../../utils/api';
import { resolveIllustration } from '../../utils/guide';
import {
  CustomizationRequestCreateRequest,
  MeasurementField,
  MeasurementFieldValue,
  MeasurementSection,
  MeasurementType,
  ProductDetail
} from '../../types/contracts';

interface FieldVM {
  code: string;
  name: string;
  type: MeasurementType;
  typeLabel: string;
  unit: string;
  required: boolean;
  instruction: string;
  tips: string[];
  image: string;
  min: number | null;
  max: number | null;
  step: number | null;
  value: string;
  error: string;
}

interface SectionVM {
  key: string;
  title: string;
  typeLabel: string;
  description: string;
  fields: FieldVM[];
}

function typeLabel(type: string): string {
  return type === 'garment_flat' ? '合身衣物平铺测量' : '身体测量';
}

function toFieldVM(field: MeasurementField): FieldVM {
  return {
    code: field.fieldCode,
    name: field.fieldName,
    type: field.measurementType,
    typeLabel: typeLabel(field.measurementType),
    unit: field.unit || 'cm',
    required: field.required,
    instruction: field.instruction || '',
    tips: field.tips || [],
    image: resolveIllustration(field.illustration),
    min: field.min === undefined ? null : field.min,
    max: field.max === undefined ? null : field.max,
    step: field.step === undefined ? null : field.step,
    value: '',
    error: ''
  };
}

function toSectionVM(section: MeasurementSection): SectionVM {
  return {
    key: section.sectionId,
    title: section.title,
    typeLabel: typeLabel(section.measurementType),
    description: section.description || '',
    fields: (section.measurementFields || []).map(toFieldVM)
  };
}

function randomId(): string {
  return 'S-' + Date.now() + '-' + Math.floor(Math.random() * 900000 + 100000);
}

Page({
  data: {
    nav: getNavMetrics(),
    loading: true,
    error: '',
    detail: null as ProductDetail | null,
    templateName: '',
    templateSummary: '',
    sections: [] as SectionVM[],
    requiredTotal: 0,
    requiredDone: 0,
    progress: 0,
    contact: { name: '', phone: '', region: '', detail: '' },
    contactError: { name: '', phone: '', region: '', detail: '' },
    remark: '',
    submitting: false,
    submitId: '',
    imgErr: {} as Record<string, boolean>
  },

  onLoad(query: Record<string, string | undefined>) {
    const productId = query && query.productId ? String(query.productId) : '';
    if (!productId) {
      this.setData({ loading: false, error: '缺少商品参数，请从商品详情页进入' });
      return;
    }
    this.setData({ submitId: randomId() });
    this.load(productId);
  },

  load(productId: string) {
    this.setData({ loading: true, error: '' });
    Promise.all([
      product(productId).catch(() => null as ProductDetail | null),
      resolveTemplate(productId).catch(() => null)
    ])
      .then((res) => {
        const detail = res[0];
        const tpl = res[1];
        if (!tpl || !tpl.measurementSections || !tpl.measurementSections.length) {
          this.setData({
            loading: false,
            detail,
            error: '该商品暂未绑定量体模板，无法提交定制申请'
          });
          return;
        }
        const sections = tpl.measurementSections.map(toSectionVM);
        let requiredTotal = 0;
        sections.forEach((s) => {
          s.fields.forEach((f) => {
            if (f.required) {
              requiredTotal += 1;
            }
          });
        });
        this.setData({
          loading: false,
          detail,
          templateName: tpl.name,
          templateSummary: tpl.summary || '',
          sections,
          requiredTotal,
          requiredDone: 0,
          progress: 0
        });
      })
      .catch(() => {
        this.setData({ loading: false, error: '量体模板加载失败，请稍后重试' });
      });
  },

  reload() {
    const detail = this.data.detail as ProductDetail | null;
    if (detail) {
      this.load(detail.id);
      return;
    }
    // 没有商品上下文时不要把错误清空 —— 那会渲染出一张空白表单，
    // 顾客点「提交定制申请」毫无反应。
    this.setData({ error: '缺少商品信息，无法提交定制申请，请返回商品页重新进入' });
  },

  goBack() {
    wx.navigateBack();
  },

  onImgErr(e: { currentTarget: { dataset: Record<string, string> } }) {
    const key = String(e.currentTarget.dataset.key || '');
    this.setData({ ['imgErr[' + key + ']']: true });
  },

  /** 量体字段输入 */
  onFieldInput(e: { currentTarget: { dataset: Record<string, string> }; detail: { value: string } }) {
    const si = Number(e.currentTarget.dataset.si || 0);
    const fi = Number(e.currentTarget.dataset.fi || 0);
    const value = e.detail.value;
    this.setData({ ['sections[' + si + '].fields[' + fi + '].value']: value });
    this.refreshProgress();
  },

  /** 联系方式输入 */
  onContactInput(e: { currentTarget: { dataset: Record<string, string> }; detail: { value: string } }) {
    const key = String(e.currentTarget.dataset.key || '');
    this.setData({ ['contact.' + key]: e.detail.value });
  },

  onRemarkInput(e: { detail: { value: string } }) {
    this.setData({ remark: e.detail.value });
  },

  /** 必填项完成进度 */
  refreshProgress() {
    const sections = this.data.sections as SectionVM[];
    let done = 0;
    let total = 0;
    sections.forEach((s) => {
      s.fields.forEach((f) => {
        if (!f.required) {
          return;
        }
        total += 1;
        if (String(f.value).trim() !== '') {
          done += 1;
        }
      });
    });
    this.setData({
      requiredDone: done,
      requiredTotal: total,
      progress: total ? Math.round((done / total) * 100) : 0
    });
  },

  /** 校验：必填 + 数值范围 */
  validate(): string[] {
    const problems: string[] = [];
    const sections = this.data.sections as SectionVM[];
    sections.forEach((s, si) => {
      s.fields.forEach((f, fi) => {
        const raw = String(f.value).trim();
        let error = '';
        if (raw === '') {
          if (f.required) {
            error = '请填写' + f.name;
          }
        } else if (!/^\d+(\.\d+)?$/.test(raw)) {
          error = f.name + ' 请填写数字（单位 ' + f.unit + '）';
        } else {
          const num = Number(raw);
          if (f.min !== null && num < f.min) {
            error = f.name + ' 不得小于 ' + f.min + f.unit;
          } else if (f.max !== null && num > f.max) {
            error = f.name + ' 不得大于 ' + f.max + f.unit;
          }
        }
        if (error) {
          problems.push(error);
        }
        this.setData({ ['sections[' + si + '].fields[' + fi + '].error']: error });
      });
    });

    const contact = this.data.contact;
    const contactError = { name: '', phone: '', region: '', detail: '' };
    if (!String(contact.name).trim()) {
      contactError.name = '请填写称呼';
    }
    const phone = String(contact.phone).trim();
    if (!phone) {
      contactError.phone = '请填写联系电话';
    } else if (!/^[0-9+\-\s]{6,20}$/.test(phone)) {
      contactError.phone = '联系电话格式不正确';
    }
    if (!String(contact.region).trim()) {
      contactError.region = '请填写省 / 市 / 区';
    }
    if (!String(contact.detail).trim()) {
      contactError.detail = '请填写详细地址';
    }
    this.setData({ contactError });
    if (contactError.name) {
      problems.push(contactError.name);
    }
    if (contactError.phone) {
      problems.push(contactError.phone);
    }
    if (contactError.region) {
      problems.push(contactError.region);
    }
    if (contactError.detail) {
      problems.push(contactError.detail);
    }
    return problems;
  },

  submit() {
    if (this.data.submitting) {
      return;
    }
    const problems = this.validate();
    if (problems.length) {
      wx.showToast({ title: problems[0], icon: 'none', duration: 2400 });
      return;
    }
    const detail = this.data.detail as ProductDetail | null;
    if (!detail) {
      return;
    }
    const sections = this.data.sections as SectionVM[];
    const measurements: MeasurementFieldValue[] = [];
    sections.forEach((s) => {
      s.fields.forEach((f) => {
        const raw = String(f.value).trim();
        if (raw === '') {
          return;
        }
        measurements.push({
          fieldCode: f.code,
          fieldName: f.name,
          measurementType: f.type,
          unit: f.unit,
          value: Number(raw)
        });
      });
    });

    const contact = this.data.contact;
    const payload: CustomizationRequestCreateRequest = {
      productId: detail.id,
      measurements,
      contact: {
        name: String(contact.name).trim(),
        phone: String(contact.phone).trim(),
        region: String(contact.region).trim(),
        detail: String(contact.detail).trim()
      },
      remark: String(this.data.remark).trim() || null,
      submitId: this.data.submitId
    };

    this.setData({ submitting: true });
    createCustomizationRequest(payload)
      .then((dto) => {
        this.setData({ submitting: false });
        wx.showToast({ title: '申请已提交', icon: 'success', duration: 1200 });
        setTimeout(() => {
          wx.redirectTo({ url: '/pages/request-detail/request-detail?id=' + dto.id });
        }, 800);
      })
      .catch(() => {
        this.setData({ submitting: false });
      });
  },

  goContact() {
    wx.navigateTo({ url: '/pages/contact/contact' });
  },

  goGuide() {
    wx.navigateTo({ url: '/pages/guide-top/guide-top' });
  }
});
