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

/** 提交载荷指纹：只关心「内容变了没」，不看顺序 */
function fingerprint(payload: CustomizationRequestCreateRequest): string {
  const measurements = (payload.measurements || [])
    .map((m) => `${m.fieldCode}=${m.value}`)
    .sort()
    .join('|');
  const contact = payload.contact || ({} as CustomizationRequestCreateRequest['contact']);
  return [
    payload.productId,
    measurements,
    contact.name,
    contact.phone,
    contact.region,
    contact.detail,
    payload.remark || ''
  ].join('#');
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
    /** 上一次提交载荷的指纹：用来判断「顾客改了内容」还是「只是重试」 */
    submitFingerprint: '',
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

  /**
   * 按载荷决定 submitId 是否需要轮换。
   *
   * 抽成独立方法是为了能被页面级执行验证直接调用（不必真的提交）。
   *
   * - 载荷变了（顾客改了量体值）→ 换新 submitId，
   *   否则服务端幂等会把**上一次**的申请返回，改过的量体值被静默丢弃；
   * - 载荷没变（只是重试）→ 保留同一个 submitId，
   *   靠幂等兜住「其实已入库但响应丢了」，不产生重复申请。
   */
  syncSubmitId(payload: CustomizationRequestCreateRequest): string {
    const fp = fingerprint(payload);
    const lastFp = String(this.data.submitFingerprint || '');
    let submitId = this.data.submitId;
    if (lastFp && lastFp !== fp) {
      submitId = randomId();
    }
    this.setData({ submitId, submitFingerprint: fp });
    return submitId;
  },

  submit() {
    if (this.data.submitting) {
      return;
    }
    const detail = this.data.detail as ProductDetail | null;
    if (!detail) {
      /*
       * 此前这里是**静默 return**：商品信息没加载出来时，顾客填完整张量体表单
       * 点「提交」毫无反应，只能反复点。
       *
       * 注意这个判断必须排在表单校验**之前** ——
       * 否则空表单会先弹「请填写称呼」，把真正的原因盖掉。
       */
      wx.showToast({
        title: '商品信息加载失败，请下拉刷新后重试',
        icon: 'none',
        duration: 2400
      });
      return;
    }
    const problems = this.validate();
    if (problems.length) {
      wx.showToast({ title: problems[0], icon: 'none', duration: 2400 });
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

    /*
     * submitId 的轮换规则（本轮审计 P1）：
     *
     * 服务端按 submitId 幂等 —— 同一个 submitId 只会有一条申请，
     * 再次提交直接返回**旧的那条**（量体值被静默丢弃）。
     *
     * 两种场景要区别对待：
     * - **顾客改了内容**再提交 → 必须换新 submitId，否则改过的量体值被丢弃
     *   （量体值直接决定成衣尺寸，是数据正确性事故）；
     * - **顾客什么都没改，只是重试**（比如上次响应超时、其实已入库）
     *   → 必须保留同一个 submitId，才能吃到幂等、避免重复申请。
     */
    payload.submitId = this.syncSubmitId(payload);

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
        // 不换 submitId：载荷没变就重试，靠幂等兜住「其实已入库但响应丢了」。
        // 顾客改了内容时，下一次 submit() 会因为指纹变化自动换新 id。
        this.setData({ submitting: false });
        wx.showToast({
          title: '提交未成功，请到「我的申请」确认是否已提交',
          icon: 'none',
          duration: 2600
        });
      });
  },

  goContact() {
    wx.navigateTo({ url: '/pages/contact/contact' });
  },

  goGuide() {
    wx.navigateTo({ url: '/pages/guide-top/guide-top' });
  }
});
