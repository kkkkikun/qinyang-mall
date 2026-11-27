<template>
  <div>
    <div class="page-block">
      <div class="page-toolbar">
        <span class="muted">
          图文说明页是顾客在「我的 → 量体指南 / 洗护说明 / 材质说明」里看到的内容，
          改动后立即生效。
        </span>
      </div>

      <t-table
        row-key="slug"
        :data="tableData"
        :columns="columns"
        :loading="loading"
        :empty="emptyHint('还没有图文说明页', '图文说明页由种子数据创建，一般不需要手工新增')"
        :bordered="false"
      />
    </div>

    <!-- 编辑图文说明页 -->
    <t-drawer v-model:visible="editVisible" header="编辑图文说明页" size="760px" :footer="false">
      <div v-if="!form" class="empty-text">加载中…</div>
      <t-form v-else :data="form" label-align="top">
        <t-form-item label="页面标题">
          <t-input v-model="form.title" :maxlength="128" placeholder="如 上装量体指南" />
        </t-form-item>
        <t-form-item label="摘要">
          <t-textarea
            v-model="form.summary"
            :maxlength="255"
            :autosize="{ minRows: 2, maxRows: 4 }"
            placeholder="一句话说明这页讲什么"
          />
        </t-form-item>

        <div class="section-title mt-16">分节内容</div>
        <div class="muted mt-6">
          每个分节会渲染成「标题 + 说明 + 要点列表 + 示意图」。
          勾选「量体示意图」后，顾客端会展示对应示意图、测量说明与要点 ——
          这些文字统一取自量体模板，不必在这里重复写。
        </div>

        <div v-for="(section, si) in form.sections" :key="section.id" class="guide-section mt-12">
          <div class="guide-section__hd">
            <span class="guide-section__idx">第 {{ si + 1 }} 节</span>
            <t-button
              theme="default"
              size="small"
              variant="text"
              :disabled="si === 0"
              @click="moveSection(si, -1)"
            >
              上移
            </t-button>
            <t-button
              theme="default"
              size="small"
              variant="text"
              :disabled="si === form.sections.length - 1"
              @click="moveSection(si, 1)"
            >
              下移
            </t-button>
            <t-popconfirm
              content="删除该分节？保存后立即对顾客生效，且无法撤销。"
              theme="danger"
              @confirm="removeSection(si)"
            >
              <t-button theme="danger" size="small" variant="text">删除</t-button>
            </t-popconfirm>
          </div>

          <t-input v-model="section.title" :maxlength="128" placeholder="分节标题，如 净体测量" class="mt-8" />
          <t-textarea
            v-model="section.description"
            :maxlength="2000"
            :autosize="{ minRows: 2, maxRows: 5 }"
            placeholder="分节说明"
            class="mt-8"
          />

          <div class="mt-8">
            <div class="muted mb-8">要点（每行一条）</div>
            <!--
              要点必须用独立的 itemsText 承载：
              早先用 :value="items.join('\n')" + @change 派生回填，
              输入框每次触发 change 就把换行去掉，回车打不出第二条要点。
            -->
            <t-textarea
              v-model="section.itemsText"
              :autosize="{ minRows: 3, maxRows: 10 }"
              placeholder="每行一条要点"
            />
          </div>

          <div class="mt-12">
            <div class="muted mb-8">量体示意图（可多选）</div>
            <t-select
              v-model="section.fieldCodes"
              multiple
              filterable
              :min-collapse-size="4"
              placeholder="选择该分节要展示的量体字段"
              :options="fieldOptions"
            />
            <div class="muted mt-6">
              选中字段的「名称 / 测量说明 / 提示 / 配图」统一取自已发布量体模板，顾客端不会与量体表单说法不一致。
            </div>
          </div>

          <t-input
            v-model="section.illustration"
            :maxlength="255"
            placeholder="分节示意图标识（如 chest.svg）或完整 URL（可留空）"
            class="mt-8"
          />
        </div>

        <t-button theme="default" size="small" class="mt-12" @click="addSection">添加分节</t-button>

        <div class="row gap8 mt-20">
          <t-button theme="primary" :loading="saving" :disabled="saving" @click="save">保存</t-button>
          <t-button theme="default" :disabled="saving" @click="editVisible = false">取消</t-button>
        </div>
      </t-form>
    </t-drawer>
  </div>
</template>

<script setup lang="ts">
import { computed, h, onMounted, ref } from 'vue';
import type { VNode } from 'vue';
import { Button, MessagePlugin, Popconfirm } from 'tdesign-vue-next';
import type { GuidePageDto } from '@qinyang/contracts';
import { guideApi, templateApi } from '../api/admin';
import { toErrorMessage } from '../api/http';
import { cell, emptyHint, toTableData } from '../utils/table';
import { formatDateTime } from '../utils/format';
import { hasPermission } from '../utils/permissions';
import type { PermissionKey } from '../utils/permissions';
import { useAuthStore } from '../stores/auth';

/**
 * 图文说明页维护。
 *
 * 背景：这几页（量体指南 / 洗护说明 / 材质说明）是**顾客直接看到**的内容，
 * 此前 `GuidesService.update()` 只被自己调用 —— 没有任何控制器暴露它，
 * 商家只能改种子数据，顾客端的内容**改不了**。
 */

/** 分节的编辑态：要点用文本承载，字段用编码引用 */
interface GuideSectionForm {
  id: string;
  title: string;
  description: string;
  /** 每行一条要点的原始文本 */
  itemsText: string;
  items: string[];
  illustration: string;
  fieldCodes: string[];
}

interface GuideForm {
  slug: string;
  title: string;
  summary: string;
  sections: GuideSectionForm[];
  /** 打开编辑器时的行版本：保存时回传，期间被人改过就 409，不覆盖 */
  version: number;
}

/** 可选的量体字段（按 fieldCode 去重，与服务端解析口径一致） */
interface FieldOption {
  label: string;
  value: string;
}

const auth = useAuthStore();

/** 当前账号是否有权维护图文说明 */
function can(key: PermissionKey): boolean {
  return hasPermission(auth.user?.role, key);
}

const rows = ref<GuidePageDto[]>([]);
const loading = ref(false);
const saving = ref(false);
const editVisible = ref(false);
const form = ref<GuideForm | null>(null);
const fieldOptions = ref<FieldOption[]>([]);

/** 分节 id 自增序号：按数组长度生成会在删除分节后产生重复 id */
let sectionSeq = 0;

const tableData = computed(() => toTableData(rows.value));

const columns = [
  { colKey: 'slug', title: '页面标识', width: 140 },
  { colKey: 'title', title: '标题', width: 200 },
  {
    colKey: 'sections',
    title: '分节数',
    width: 90,
    cell: cell<GuidePageDto>((row) => h('span', String((row.sections ?? []).length)))
  },
  {
    colKey: 'fields',
    title: '示意图',
    width: 90,
    cell: cell<GuidePageDto>((row) =>
      h('span', String((row.sections ?? []).reduce((sum, s) => sum + (s.fields?.length ?? 0), 0)))
    )
  },
  {
    colKey: 'status',
    title: '状态',
    width: 90,
    cell: cell<GuidePageDto>((row) =>
      h('span', row.status === 'ACTIVE' ? '已启用' : '已停用')
    )
  },
  {
    colKey: 'updatedAt',
    title: '更新时间',
    width: 170,
    cell: cell<GuidePageDto>((row) => h('span', formatDateTime(row.updatedAt)))
  },
  {
    colKey: 'op',
    title: '操作',
    width: 190,
    cell: cell<GuidePageDto>((row) => {
      const actions: VNode[] = [
        h(Button, { theme: 'default', size: 'small', onClick: () => openEdit(row) }, () => '编辑')
      ];
      // 启用 / 停用是「对顾客下线」的性质，与改文案不同 —— 仅店主可做
      if (can('guide.status')) {
        actions.push(
          h(
            Popconfirm,
            {
              content:
                row.status === 'ACTIVE'
                  ? '停用后顾客端立即看不到这一页（后台仍可编辑并随时启用）。确认停用？'
                  : '启用后顾客端立即可见这一页。确认启用？',
              theme: row.status === 'ACTIVE' ? 'warning' : 'default',
              onConfirm: () => handleStatusChange(row, row.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE')
            },
            {
              default: () =>
                h(
                  Button,
                  { theme: 'default', size: 'small' },
                  () => (row.status === 'ACTIVE' ? '停用' : '启用')
                )
            }
          )
        );
      }
      return h('div', { style: 'display:flex; gap:6px; flex-wrap:wrap;' }, actions);
    })
  }
];

async function load(): Promise<void> {
  loading.value = true;
  try {
    rows.value = await guideApi.list();
  } catch (error) {
    MessagePlugin.error(toErrorMessage(error, '图文说明加载失败'));
  } finally {
    loading.value = false;
  }
}

/**
 * 可选量体字段清单。
 *
 * 口径必须与**服务端解析**一致：只取已发布（ACTIVE）的模板，
 * 同一 fieldCode 出现在多个模板时取第一个 —— 服务端也是这个顺序
 * （templates.service.ts 的 list 按 code ASC / version DESC）。
 */
async function loadFieldOptions(): Promise<void> {
  try {
    const templates = await templateApi.list();
    const seen = new Set<string>();
    const options: FieldOption[] = [];
    for (const tpl of templates) {
      if (tpl.status !== 'ACTIVE') continue;
      for (const section of tpl.measurementSections ?? []) {
        for (const field of section.measurementFields ?? []) {
          if (!field?.fieldCode || seen.has(field.fieldCode)) continue;
          seen.add(field.fieldCode);
          options.push({ label: `${field.fieldName}（${tpl.name}）`, value: field.fieldCode });
        }
      }
    }
    fieldOptions.value = options;
  } catch (error) {
    MessagePlugin.error(toErrorMessage(error, '量体字段清单加载失败'));
  }
}

function openEdit(row: GuidePageDto): void {
  form.value = {
    slug: row.slug,
    title: String(row.title ?? ''),
    summary: row.summary ?? '',
    version: row.version ?? 0,
    sections: (row.sections ?? []).map((section) => ({
      id: section.id,
      title: String(section.title ?? ''),
      description: section.description ?? '',
      itemsText: (section.items ?? []).join('\n'),
      items: [...(section.items ?? [])],
      illustration: section.illustration ?? '',
      fieldCodes: [...(section.fieldCodes ?? [])]
    }))
  };
  editVisible.value = true;
}

function addSection(): void {
  if (!form.value) return;
  sectionSeq += 1;
  form.value.sections.push({
    // 不能用数组长度做 id：删除中间分节后再添加会产生重复 id
    id: `section-${Date.now().toString(36)}-${sectionSeq}`,
    title: '',
    description: '',
    itemsText: '',
    items: [],
    illustration: '',
    fieldCodes: []
  });
}

function removeSection(index: number): void {
  form.value?.sections.splice(index, 1);
}

function moveSection(index: number, delta: number): void {
  const sections = form.value?.sections;
  if (!sections) return;
  const target = index + delta;
  if (target < 0 || target >= sections.length) return;
  const [item] = sections.splice(index, 1);
  sections.splice(target, 0, item);
}

/** 要点文本 → 数组（保存前统一处理，过滤空行） */
function parseItems(text: string): string[] {
  return String(text ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

/** 启用 / 停用图文说明页（店主专属） */
async function handleStatusChange(
  row: GuidePageDto,
  status: 'ACTIVE' | 'DISABLED'
): Promise<void> {
  try {
    await guideApi.changeStatus(row.slug, status);
    MessagePlugin.success(status === 'ACTIVE' ? '已启用' : '已停用');
    await load();
  } catch (error) {
    MessagePlugin.error(toErrorMessage(error, '操作失败'));
  }
}

async function save(): Promise<void> {
  const current = form.value;
  if (!current) return;
  // 接口可能把空文本回传成 null（可选字段落库为 null），
  // 直接 .trim() 会抛 "Cannot read properties of null"，整次保存静默失败。
  if (!String(current.title ?? '').trim()) {
    MessagePlugin.error('请填写页面标题');
    return;
  }
  const badTitle = current.sections.findIndex((section) => !String(section.title ?? '').trim());
  if (badTitle >= 0) {
    MessagePlugin.error(`第 ${badTitle + 1} 节缺少分节标题`);
    return;
  }

  saving.value = true;
  try {
    await guideApi.update(current.slug, {
      title: String(current.title ?? '').trim(),
      summary: String(current.summary ?? '').trim() || null,
      // 回传打开时的行版本：期间有人改过这一页，服务端会 409，
      // 而不是拿旧表单把对方的改动覆盖掉
      expectedVersion: current.version || undefined,
      sections: current.sections.map((section) => ({
        id: section.id,
        title: String(section.title ?? '').trim(),
        description: String(section.description ?? '').trim() || undefined,
        items: parseItems(section.itemsText),
        illustration: String(section.illustration ?? '').trim() || null,
        fieldCodes: section.fieldCodes ?? []
      }))
    });
    MessagePlugin.success('已保存，顾客端立即生效');
    editVisible.value = false;
    await load();
  } catch (error) {
    MessagePlugin.error(toErrorMessage(error, '保存失败'));
  } finally {
    saving.value = false;
  }
}

// 必须 await：页面级执行验证依赖 onMounted 完成后数据已就位
onMounted(async () => {
  if (!can('guide.manage')) {
    MessagePlugin.error('当前账号没有图文说明的维护权限');
    return;
  }
  await Promise.all([load(), loadFieldOptions()]);
});
</script>
