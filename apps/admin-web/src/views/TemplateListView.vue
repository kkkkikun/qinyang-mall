<template>
  <div>
    <div class="page-block">
      <div class="page-toolbar">
        <span class="muted">
          模板发布后不可原地修改；再次发布会生成新版本，旧版本转为「已归档」——发布新版本会替换当前生效版本。
        </span>
        <span class="page-toolbar-spacer"></span>
        <t-button v-if="can('template.manage')" theme="primary" @click="openCreate">
          新建模板
        </t-button>
      </div>

      <t-table
        row-key="id"
        :data="tableData"
        :columns="columns"
        :loading="loading"
                :empty="emptyHint('还没有量体模板', '量体模板决定顾客提交申请时要填写哪些尺寸')"
        :pagination="{ current: 1, pageSize: 999, total: rows.length }"
        :bordered="false"
      />
    </div>

    <!-- 查看模板 -->
    <t-drawer v-model:visible="viewVisible" header="模板详情" size="760px" :footer="false">
      <div v-if="!viewTemplate" class="empty-text">加载中…</div>
      <div v-else>
        <t-descriptions :column="3" bordered size="small">
          <t-descriptions-item label="编码">{{ viewTemplate.code }}</t-descriptions-item>
          <t-descriptions-item label="名称">{{ viewTemplate.name }}</t-descriptions-item>
          <t-descriptions-item label="版本">v{{ viewTemplate.version }}</t-descriptions-item>
          <t-descriptions-item label="状态">
            <t-tag :theme="templateStatusTheme(viewTemplate.status)" variant="light">
              {{ TEMPLATE_STATUS_LABELS[viewTemplate.status] }}
            </t-tag>
          </t-descriptions-item>
          <t-descriptions-item label="更新时间">
            {{ formatDateTime(viewTemplate.updatedAt) }}
          </t-descriptions-item>
          <t-descriptions-item label="适用分类">
            {{ categoryNames(viewTemplate.applicableCategories) }}
          </t-descriptions-item>
        </t-descriptions>

        <div v-if="viewTemplate.summary" class="muted mt-8">
          {{ viewTemplate.summary }}
        </div>

        <div v-for="section in viewTemplate.measurementSections" :key="section.sectionId" class="measure-section mt-16">
          <div class="measure-section-head">
            <span>{{ section.title }}</span>
            <span class="muted">
              {{ MEASUREMENT_TYPE_LABELS[section.measurementType] }}
            </span>
          </div>
          <div v-if="section.description" class="muted pad-top-8">
            {{ section.description }}
          </div>
          <div class="measure-field-list">
            <div v-for="field in section.measurementFields" :key="field.fieldCode" class="measure-field">
              <div>
                {{ field.fieldName }}
                <span class="muted">（{{ field.fieldCode }} / {{ field.unit }}）</span>
                <span v-if="field.required" class="text-red">*</span>
              </div>
              <div class="measure-field-value">
                <span v-if="field.min !== null && field.min !== undefined">范围 {{ field.min }} ~ {{ field.max ?? '—' }}</span>
                <span v-else-if="field.step">步进 {{ field.step }}</span>
                <span v-else class="muted">未限定范围</span>
              </div>
              <div v-if="field.instruction" class="muted">{{ field.instruction }}</div>
              <div v-if="field.tips && field.tips.length" class="muted">
                测量提示：{{ field.tips.join('；') }}
              </div>
              <div v-if="field.illustration" class="muted">示意图：{{ field.illustration }}</div>
            </div>
          </div>
        </div>
      </div>
    </t-drawer>

    <!-- 编辑 / 新建模板 -->
    <t-dialog
      v-model:visible="editVisible"
      :header="editingId ? '编辑模板草稿' : '新建模板'"
      width="880px"
      :footer="false"
    >
      <t-form :data="form" :rules="rules" label-align="top">
        <div class="form-grid">
          <t-form-item label="模板编码" name="code">
            <t-input v-model="form.code" placeholder="如 TOP-001" :disabled="Boolean(editingId)" />
          </t-form-item>
          <t-form-item label="模板名称" name="name">
            <t-input v-model="form.name" placeholder="如 上装量体模板" />
          </t-form-item>
          <t-form-item label="适用分类" name="applicableCategories">
            <t-select
              v-model="form.applicableCategories"
              multiple
              :options="categoryOptions"
              placeholder="选择该模板适用的商品分类"
            />
          </t-form-item>
          <t-form-item label="说明" name="summary">
            <t-input v-model="form.summary" placeholder="选填" />
          </t-form-item>
        </div>

        <div class="section-title mt-12">量体分节</div>
        <div v-for="(section, sectionIndex) in form.sections" :key="section.sectionId" class="measure-section">
          <div class="measure-section-head">
            <span>第 {{ sectionIndex + 1 }} 节</span>
            <t-popconfirm
              content="删除该分节及其下所有字段，确认删除？"
              theme="danger"
              @confirm="removeSection(sectionIndex)"
            >
              <t-button theme="danger" variant="outline" size="small">删除分节</t-button>
            </t-popconfirm>
          </div>
          <div class="measure-field-list" style="grid-template-columns: repeat(2, minmax(0, 1fr))">
            <div class="measure-field">
              <div>分节标题</div>
              <t-input v-model="section.title" placeholder="如 身体尺寸" />
            </div>
            <div class="measure-field">
              <div>测量类型</div>
              <t-select v-model="section.measurementType" :options="measurementTypeOptions" />
            </div>
            <div class="measure-field" style="grid-column: 1 / -1">
              <div>分节说明</div>
              <t-input v-model="section.description" placeholder="选填" />
            </div>
          </div>

          <div style="padding: 0 12px 12px">
            <table class="qy-field-table">
              <thead>
                <tr>
                  <th style="width: 22%">字段编码</th>
                  <th style="width: 22%">字段名称</th>
                  <th style="width: 12%">单位</th>
                  <th style="width: 12%">最小值</th>
                  <th style="width: 12%">最大值</th>
                  <th style="width: 10%">必填</th>
                  <th style="width: 10%">操作</th>
                </tr>
              </thead>
              <tbody>
                <template
                  v-for="(field, fieldIndex) in section.fields"
                  :key="field.fieldCode || `field-${fieldIndex}`"
                >
                  <tr>
                    <td><t-input v-model="field.fieldCode" placeholder="如 chest" /></td>
                    <td><t-input v-model="field.fieldName" placeholder="如 胸围" /></td>
                    <td><t-input v-model="field.unit" placeholder="cm" /></td>
                    <td><t-input v-model="field.min" placeholder="选填" /></td>
                    <td><t-input v-model="field.max" placeholder="选填" /></td>
                    <td>
                      <t-switch v-model="field.required" />
                    </td>
                    <td>
                      <t-popconfirm
                        content="删除该字段后，量体表单将不再采集这一项。确认删除？"
                        theme="danger"
                        @confirm="removeField(sectionIndex, fieldIndex)"
                      >
                        <t-button theme="danger" variant="outline" size="small">删除字段</t-button>
                      </t-popconfirm>
                    </td>
                  </tr>
                  <!-- 字段说明区：顾客端会渲染提示与示意图，保存时必须原样带回 -->
                  <tr>
                    <td colspan="7">
                      <div class="qy-field-extra">
                        <div>
                          <div>测量提示（每行一条）</div>
                          <t-textarea
                            v-model="field.tips"
                            :rows="2"
                            placeholder="每行一条，如：量体时保持自然呼吸，不要刻意收腹"
                          />
                        </div>
                        <div>
                          <div>示意图标识</div>
                          <t-input v-model="field.illustration" placeholder="如 chest-front" />
                        </div>
                        <div>
                          <div>字段说明</div>
                          <t-input v-model="field.instruction" placeholder="选填" />
                        </div>
                      </div>
                    </td>
                  </tr>
                </template>
              </tbody>
            </table>
            <t-button theme="default" size="small" class="mt-8" @click="addField(sectionIndex)">
              添加字段
            </t-button>
          </div>
        </div>

        <t-button theme="default" size="small" @click="addSection">添加分节</t-button>

        <div class="page-toolbar mt-16">
          <t-switch v-model="form.publish" />
          <span class="muted">保存后立即发布（草稿 → 已发布；已发布模板将生成新版本）</span>
        </div>

        <t-button theme="primary" :loading="saving" @click="handleSave">保存</t-button>
        <t-button theme="default" class="ml-8" @click="editVisible = false">取消</t-button>
      </t-form>
    </t-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, h, onMounted, reactive, ref, type VNode } from 'vue';
import { Button, MessagePlugin, Popconfirm, Tag } from 'tdesign-vue-next';
import {
  MeasurementType,
  TemplateStatus,
  type CategoryDto,
  type MeasurementField,
  type MeasurementSection,
  type MeasurementTemplateDto,
  type MeasurementTemplateUpsertRequest,
} from '@qinyang/contracts';
import { categoryApi, templateApi } from '../api/admin';
import { toErrorMessage } from '../api/http';
import { useAuthStore } from '../stores/auth';
import { hasPermission, type PermissionKey } from '../utils/permissions';
import { formatDateTime, flattenCategories } from '../utils/format';
import { MEASUREMENT_TYPE_LABELS, TEMPLATE_STATUS_LABELS, templateStatusTheme } from '../utils/status';
import { cell, emptyHint, toTableData } from '../utils/table';

const auth = useAuthStore();

function can(key: PermissionKey): boolean {
  return hasPermission(auth.user?.role, key);
}

interface FieldDraft {
  fieldCode: string;
  fieldName: string;
  unit: string;
  required: boolean;
  min: string;
  max: string;
  step: string;
  instruction: string;
  /**
   * 测量提示：草稿里用「每行一条」的纯文本承载，
   * 保存时拆成字符串数组、读取时用换行拼回来（与契约 `tips: string[]` 等价）。
   */
  tips: string;
  /** 示意图标识（顾客端按标识找示意图，可为空） */
  illustration: string;
}

interface SectionDraft {
  sectionId: string;
  title: string;
  measurementType: MeasurementType;
  description: string;
  fields: FieldDraft[];
}

const rows = ref<MeasurementTemplateDto[]>([]);
const loading = ref(false);
const categories = ref<CategoryDto[]>([]);

const viewVisible = ref(false);
const viewTemplate = ref<MeasurementTemplateDto | null>(null);

const editVisible = ref(false);
const saving = ref(false);
const editingId = ref('');

const form = reactive<{
  code: string;
  name: string;
  summary: string;
  applicableCategories: string[];
  publish: boolean;
  sections: SectionDraft[];
}>({
  code: '',
  name: '',
  summary: '',
  applicableCategories: [],
  publish: false,
  sections: [],
});

const rules = {
  code: [{ required: true, message: '请输入模板编码' }],
  name: [{ required: true, message: '请输入模板名称' }],
};

const measurementTypeOptions = [
  { label: MEASUREMENT_TYPE_LABELS[MeasurementType.BODY], value: MeasurementType.BODY },
  { label: MEASUREMENT_TYPE_LABELS[MeasurementType.GARMENT_FLAT], value: MeasurementType.GARMENT_FLAT },
];

const categoryOptions = computed(() =>
  flattenCategories(categories.value).map((item) => ({ label: item.name, value: item.id })),
);

const tableData = computed(() => toTableData(rows.value));

const columns = [
  { colKey: 'code', title: '编码', width: 160 },
  { colKey: 'name', title: '名称', width: 200 },
  {
    colKey: 'version',
    title: '版本',
    width: 90,
    cell: cell<MeasurementTemplateDto>((row) => h('span', null, `v${row.version}`)),
  },
  {
    colKey: 'status',
    title: '状态',
    width: 110,
    cell: cell<MeasurementTemplateDto>((row) =>
      h(Tag, { theme: templateStatusTheme(row.status), variant: 'light' }, () =>
        TEMPLATE_STATUS_LABELS[row.status],
      ),
    ),
  },
  {
    colKey: 'applicableCategories',
    title: '适用分类',
    width: 220,
    cell: cell<MeasurementTemplateDto>((row) => h('span', null, categoryNames(row.applicableCategories))),
  },
  {
    colKey: 'updatedAt',
    title: '更新时间',
    width: 170,
    cell: cell<MeasurementTemplateDto>((row) => h('span', null, formatDateTime(row.updatedAt))),
  },
  {
    colKey: 'operation',
    title: '操作',
    width: 260,
    cell: cell<MeasurementTemplateDto>((row) => {
      const actions: VNode[] = [
        h(Button, { theme: 'default', size: 'small', onClick: () => openView(row) }, () => '查看'),
      ];
      if (can('template.manage')) {
        if (row.status === TemplateStatus.DRAFT) {
          actions.push(
            h(Button, { theme: 'default', size: 'small', onClick: () => openEdit(row) }, () => '编辑草稿'),
          );
        }
        /**
         * 发布入口只对「草稿」与「已发布」开放。
         *
         * 服务端 publish() 会先把**当前生效版本归档**再把目标置为 ACTIVE：
         * 对「已归档」的旧版本点发布，等于把线上生效的量体表单回退到旧版本，
         * 顾客端立刻看到旧表单 —— 而确认框里只有一句「确认发布该模板？」，
         * 商家完全看不出这是一次线上回滚。因此已归档版本一律不给发布入口。
         */
        if (row.status === TemplateStatus.DRAFT) {
          actions.push(
            h(
              Popconfirm,
              {
                content:
                  '发布后该模板立即对顾客端生效，并会替换当前生效版本（同编码的已发布版本将转为「已归档」）。确认发布？',
                theme: 'warning',
                onConfirm: () => handlePublish(row),
              },
              {
                default: () => h(Button, { theme: 'primary', size: 'small' }, () => '发布'),
              },
            ),
          );
        } else if (row.status === TemplateStatus.ACTIVE) {
          actions.push(
            h(
              Popconfirm,
              {
                content:
                  '继续发布会生成新版本（版本号 +1），并把当前生效版本转为「已归档」——这会替换当前生效版本。确认发布？',
                theme: 'warning',
                onConfirm: () => handlePublish(row),
              },
              {
                default: () => h(Button, { theme: 'primary', size: 'small' }, () => '发布新版本'),
              },
            ),
          );
        }
        /*
         * 删除入口只对店主开放（服务端同样限制为 OWNER）。
         *
         * 被商品引用的模板删不掉 —— 服务端会 409 并说明被几件商品引用，
         * 避免商家删掉量体模板后顾客提交定制申请被拦下却查不出原因。
         */
        if (can('template.delete')) {
          actions.push(
            h(
              Popconfirm,
              {
                content:
                  '删除后不可恢复。若该模板已被商品引用，系统会拒绝删除并告知引用数量。确认删除？',
                theme: 'danger',
                onConfirm: () => handleRemove(row),
              },
              {
                default: () => h(Button, { theme: 'danger', size: 'small' }, () => '删除'),
              },
            ),
          );
        }
      }
      return h('div', { style: 'display:flex; gap:6px; flex-wrap:wrap;' }, actions);
    }),
  },
];

function categoryNames(ids: string[]): string {
  if (!ids || ids.length === 0) {
    return '—';
  }
  const map = new Map(flattenCategories(categories.value).map((item) => [item.id, item.name]));
  return ids.map((id) => map.get(id) ?? id).join('、');
}

async function load(): Promise<void> {
  loading.value = true;
  try {
    rows.value = await templateApi.list();
  } catch (error) {
    MessagePlugin.error(toErrorMessage(error, '模板列表加载失败'));
  } finally {
    loading.value = false;
  }
}

function openView(row: MeasurementTemplateDto): void {
  viewTemplate.value = row;
  viewVisible.value = true;
}

function openCreate(): void {
  editingId.value = '';
  form.code = '';
  form.name = '';
  form.summary = '';
  form.applicableCategories = [];
  form.publish = false;
  form.sections = [newSectionDraft()];
  editVisible.value = true;
}

function openEdit(row: MeasurementTemplateDto): void {
  editingId.value = row.id;
  form.code = row.code;
  form.name = row.name;
  form.summary = row.summary ?? '';
  form.applicableCategories = [...(row.applicableCategories ?? [])];
  form.publish = false;
  form.sections = (row.measurementSections ?? []).map(toSectionDraft);
  editVisible.value = true;
}

function newSectionDraft(): SectionDraft {
  return {
    sectionId: `section-${Date.now()}`,
    title: '',
    measurementType: MeasurementType.BODY,
    description: '',
    fields: [],
  };
}

function toSectionDraft(section: MeasurementSection): SectionDraft {
  return {
    sectionId: section.sectionId,
    title: section.title,
    measurementType: section.measurementType,
    description: section.description ?? '',
    fields: (section.measurementFields ?? []).map((field) => toFieldDraft(field)),
  };
}

function toFieldDraft(field: MeasurementField): FieldDraft {
  return {
    fieldCode: field.fieldCode,
    fieldName: field.fieldName,
    unit: field.unit,
    required: field.required,
    min: field.min === null || field.min === undefined ? '' : String(field.min),
    max: field.max === null || field.max === undefined ? '' : String(field.max),
    step: field.step === null || field.step === undefined ? '' : String(field.step),
    instruction: field.instruction ?? '',
    // tips / illustration 原样带出：写死成空会让一次保存把顾客端的测量提示整片抹掉
    tips: (field.tips ?? []).join('\n'),
    illustration: field.illustration ?? '',
  };
}

/** 「每行一条」的提示文本 → 字符串数组（忽略空行） */
function splitTips(value: string | undefined): string[] {
  if (!value) {
    return [];
  }
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

/** 草稿里的文本字段 → 字符串（字段可能缺失，缺失按空串处理） */
function draftText(value: string | undefined): string {
  return typeof value === 'string' ? value : '';
}

/** 草稿里的数值字段 → 数字 | null（空串 / 非法值按未设置处理） */
function draftNumber(value: string | number | undefined): number | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function addSection(): void {
  form.sections.push(newSectionDraft());
}

function removeSection(index: number): void {
  form.sections.splice(index, 1);
}

function addField(sectionIndex: number): void {
  const section = form.sections[sectionIndex];
  if (!section) {
    return;
  }
  section.fields.push({
    fieldCode: '',
    fieldName: '',
    unit: 'cm',
    required: true,
    min: '',
    max: '',
    step: '',
    instruction: '',
    tips: '',
    illustration: '',
  });
}

function removeField(sectionIndex: number, fieldIndex: number): void {
  form.sections[sectionIndex]?.fields.splice(fieldIndex, 1);
}

function toMeasurementSections(): MeasurementSection[] {
  return form.sections.map((section) => ({
    sectionId: section.sectionId,
    title: section.title.trim(),
    measurementType: section.measurementType,
    description: section.description.trim() || undefined,
    measurementFields: (section.fields ?? []).map((field) => ({
      fieldCode: draftText(field.fieldCode).trim(),
      fieldName: draftText(field.fieldName).trim(),
      measurementType: section.measurementType,
      unit: draftText(field.unit).trim() || 'cm',
      required: field.required,
      instruction: draftText(field.instruction).trim() || undefined,
      // 原样往返：不再写死 [] / null，否则一次保存就把顾客端的测量提示与示意图全部抹掉
      tips: splitTips(draftText(field.tips)),
      illustration: draftText(field.illustration).trim() || null,
      min: draftNumber(field.min),
      max: draftNumber(field.max),
      step: draftNumber(field.step),
    })),
  }));
}

async function handleSave(): Promise<void> {
  if (saving.value) {
    return;
  }
  if (!form.code.trim() || !form.name.trim()) {
    MessagePlugin.error('请填写模板编码与名称');
    return;
  }
  const sections = toMeasurementSections();
  const invalid = sections.find(
    (section) => !section.title || section.measurementFields.some((field) => !field.fieldCode || !field.fieldName),
  );
  if (invalid) {
    MessagePlugin.error('请填写每个分节的标题与字段编码、字段名称');
    return;
  }
  const payload: MeasurementTemplateUpsertRequest = {
    code: form.code.trim(),
    name: form.name.trim(),
    applicableCategories: [...form.applicableCategories],
    summary: form.summary.trim() || null,
    measurementSections: sections,
    publish: form.publish,
  };
  saving.value = true;
  try {
    if (editingId.value) {
      await templateApi.update(editingId.value, payload);
      MessagePlugin.success('模板已保存');
    } else {
      await templateApi.create(payload);
      MessagePlugin.success(form.publish ? '模板已创建并发布' : '模板草稿已创建');
    }
    editVisible.value = false;
    await load();
  } catch (error) {
    MessagePlugin.error(toErrorMessage(error, '保存失败'));
  } finally {
    saving.value = false;
  }
}

async function handlePublish(row: MeasurementTemplateDto): Promise<void> {
  try {
    const published = await templateApi.publish(row.id);
    MessagePlugin.success(`已发布：${published.name} v${published.version}`);
    await load();
  } catch (error) {
    MessagePlugin.error(toErrorMessage(error, '发布失败'));
  }
}

/**
 * 删除模板。
 *
 * 服务端会在**模板被商品引用**时拒绝（409「该模板已被 N 件商品引用，不能删除」）——
 * 删掉后商品解析不到量体模板，顾客就提交不了定制申请。
 * 这里的提示文案要把这层风险讲清楚，不要让商家以为随便删。
 */
async function handleRemove(row: MeasurementTemplateDto): Promise<void> {
  try {
    await templateApi.remove(row.id);
    MessagePlugin.success('已删除');
    await load();
  } catch (error) {
    MessagePlugin.error(toErrorMessage(error, '删除失败'));
  }
}

onMounted(async () => {
  try {
    categories.value = await categoryApi.list();
  } catch (error) {
    MessagePlugin.error(toErrorMessage(error, '分类加载失败'));
  }
  await load();
});
</script>

<style scoped>
.qy-field-table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--qy-font-sm);
}

.qy-field-table th {
  text-align: left;
  color: var(--qy-text-2);
  font-weight: 500;
  padding: 4px 6px;
}

.qy-field-table td {
  padding: 4px 6px;
  vertical-align: middle;
}

/* 字段说明区：提示 / 示意图 / 字段说明 */
.qy-field-extra {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  padding: 4px 0;
  color: var(--qy-text-2);
  font-size: var(--qy-font-sm);
}
</style>
