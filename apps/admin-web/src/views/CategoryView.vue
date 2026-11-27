<template>
  <div>
    <div class="page-block">
      <div class="page-toolbar">
        <span class="muted">分类为树形结构；新增、修改、删除仅店主可执行。</span>
        <span class="page-toolbar-spacer"></span>
        <t-button v-if="can('category.manage')" theme="primary" @click="openCreate">
          新增分类
        </t-button>
      </div>

      <t-table
        row-key="id"
        :data="tableData"
        :columns="columns"
        :loading="loading"
                :empty="emptyHint('还没有分类', '先建一个分类，商品才能挂到分类下')"
        :pagination="{ current: 1, pageSize: 999, total: rows.length }"
        :bordered="false"
      />
    </div>

    <t-dialog
      v-model:visible="dialogVisible"
      :header="editingId ? '编辑分类' : '新增分类'"
      :footer="false"
      @close="handleDialogClose"
    >
      <t-form :data="form" :rules="rules" label-align="top">
        <t-form-item label="分类编码" name="code">
          <t-input v-model="form.code" placeholder="如 men-top" :disabled="editingId !== ''" />
          <div v-if="editingId" class="muted form-tip">
            编码创建后不可修改：编码是引用键（量体模板的适用分类存的就是它），改了会让该分类下的商品匹配不到量体模板。需要更名请直接改「分类名称」。
          </div>
        </t-form-item>
        <t-form-item label="分类名称" name="name">
          <t-input v-model="form.name" placeholder="如 上装" />
        </t-form-item>
        <t-form-item label="上级分类" name="parentId">
          <t-select v-model="form.parentId" :options="parentOptions" placeholder="不选则为一级分类" clearable />
        </t-form-item>
        <t-form-item label="排序值" name="sortOrder">
          <t-input v-model="form.sortOrder" placeholder="数值越小越靠前" />
        </t-form-item>
        <t-form-item label="状态" name="status">
          <t-select v-model="form.status" :options="statusOptions" />
        </t-form-item>

        <t-button theme="primary" :loading="saving" @click="handleSave">保存</t-button>
        <t-button theme="default" class="ml-8" @click="dialogVisible = false">取消</t-button>
      </t-form>
    </t-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, h, onMounted, reactive, ref, type VNode } from 'vue';
import { Button, MessagePlugin, Popconfirm, Tag } from 'tdesign-vue-next';
import type { CategoryDto, CategoryUpsertRequest } from '@qinyang/contracts';
import { categoryApi } from '../api/admin';
import { toErrorMessage } from '../api/http';
import { useAuthStore } from '../stores/auth';
import { hasPermission, type PermissionKey } from '../utils/permissions';
import { toCategoryRows, toNonNegativeInt, type CategoryRow } from '../utils/format';
import { cell, emptyHint, toTableData } from '../utils/table';

const auth = useAuthStore();

function can(key: PermissionKey): boolean {
  return hasPermission(auth.user?.role, key);
}

const rows = ref<CategoryRow[]>([]);
const loading = ref(false);
const tree = ref<CategoryDto[]>([]);

const dialogVisible = ref(false);
const saving = ref(false);
const editingId = ref('');
/** 编辑前的原始分类编码（服务端不允许修改编码，编辑时按原值提交） */
const editingCode = ref('');

interface CategoryFormModel {
  code: string;
  name: string;
  parentId: string;
  sortOrder: string;
  status: 'ACTIVE' | 'DISABLED';
}

const form = reactive<CategoryFormModel>({
  code: '',
  name: '',
  parentId: '',
  sortOrder: '0',
  status: 'ACTIVE',
});

const rules = {
  code: [{ required: true, message: '请输入分类编码' }],
  name: [{ required: true, message: '请输入分类名称' }],
};

const statusOptions = [
  { label: '启用', value: 'ACTIVE' },
  { label: '停用', value: 'DISABLED' },
];

/**
 * 「上级分类」候选项。
 *
 * 服务端 `categories.service.ts` 的 assertParent 只接受**一级分类**作为父分类
 * （父分类 level ≥ 2 会被拒），也不允许把分类挂到自己的子孙下。
 * 这里先按同一口径过滤，避免商家选到一个必然被服务端拒绝的选项。
 */
const parentOptions = computed(() => {
  const excluded = new Set<string>();
  if (editingId.value) {
    excluded.add(editingId.value);
    for (const id of collectDescendantIds(editingId.value)) {
      excluded.add(id);
    }
  }
  return rows.value
    .filter((item) => item.level === 0 && !excluded.has(item.id))
    .map((item) => ({ label: `${item.name}（一级分类）`, value: item.id }));
});

/** 某个分类下的全部子孙 id（防止把自己挂到自己的下级下面） */
function collectDescendantIds(rootId: string): string[] {
  const result: string[] = [];
  const walk = (parentId: string): void => {
    rows.value
      .filter((item) => item.parentId === parentId)
      .forEach((child) => {
        result.push(child.id);
        walk(child.id);
      });
  };
  walk(rootId);
  return result;
}

const tableData = computed(() => toTableData(rows.value));

const columns = [
  {
    colKey: 'name',
    title: '分类名称',
    width: 320,
    cell: cell<CategoryRow>((row) =>
      h('span', { style: `padding-left:${row.level * 20}px;` }, row.name),
    ),
  },
  { colKey: 'code', title: '编码', width: 180 },
  { colKey: 'level', title: '层级', width: 90 },
  { colKey: 'sortOrder', title: '排序', width: 90 },
  {
    colKey: 'productCount',
    title: '商品数',
    width: 100,
    cell: cell<CategoryRow>((row) =>
      row.productCount === undefined ? h('span', { class: 'muted' }, '—') : h('span', null, String(row.productCount)),
    ),
  },
  {
    colKey: 'status',
    title: '状态',
    width: 100,
    cell: cell<CategoryRow>((row) =>
      h(
        Tag,
        { theme: row.status === 'ACTIVE' ? 'success' : 'default', variant: 'light' },
        () => (row.status === 'ACTIVE' ? '启用' : '停用'),
      ),
    ),
  },
  {
    colKey: 'operation',
    title: '操作',
    width: 180,
    cell: cell<CategoryRow>((row) => {
      const actions: VNode[] = [];
      if (can('category.manage')) {
        actions.push(
          h(Button, { theme: 'default', size: 'small', onClick: () => openEdit(row) }, () => '编辑'),
        );
        actions.push(
          h(
            Popconfirm,
            {
              content: '确认删除该分类？分类下仍有商品时无法删除。',
              theme: 'danger',
              onConfirm: () => handleRemove(row),
            },
            {
              default: () =>
                h(Button, { theme: 'danger', variant: 'outline', size: 'small' }, () => '删除'),
            },
          ),
        );
      }
      if (!actions.length) {
        return h('span', { class: 'muted' }, '仅店主可维护');
      }
      return h('div', { style: 'display:flex; gap:6px;' }, actions);
    }),
  },
];

async function load(): Promise<void> {
  loading.value = true;
  try {
    tree.value = await categoryApi.list();
    rows.value = toCategoryRows(tree.value);
  } catch (error) {
    MessagePlugin.error(toErrorMessage(error, '分类加载失败'));
  } finally {
    loading.value = false;
  }
}

function openCreate(): void {
  editingId.value = '';
  editingCode.value = '';
  form.code = '';
  form.name = '';
  form.parentId = '';
  form.sortOrder = '0';
  form.status = 'ACTIVE';
  dialogVisible.value = true;
}

function openEdit(row: CategoryRow): void {
  editingId.value = row.id;
  // 记住原始编码：编辑时服务端会因为「编码被改」返回 409，
  // 这里统一提交打开抽屉时的原值，避免任何客户端处理差异触发误判。
  editingCode.value = row.code;
  form.code = row.code;
  form.name = row.name;
  form.parentId = row.parentId ?? '';
  form.sortOrder = String(row.sortOrder);
  form.status = row.status;
  dialogVisible.value = true;
}

function handleDialogClose(): void {
  editingId.value = '';
}

async function handleRemove(row: CategoryRow): Promise<void> {
  try {
    await categoryApi.remove(row.id);
    MessagePlugin.success('分类已删除');
    await load();
  } catch (error) {
    MessagePlugin.error(toErrorMessage(error, '删除失败'));
  }
}

async function handleSave(): Promise<void> {
  if (saving.value) {
    return;
  }
  if (!form.code.trim() || !form.name.trim()) {
    MessagePlugin.error('请填写分类编码与名称');
    return;
  }
  const payload: CategoryUpsertRequest = {
    // 编辑态提交原始编码：服务端把「编码变更」视为 409，改名请走分类名称
    code: editingId.value ? editingCode.value : form.code.trim(),
    name: form.name.trim(),
    parentId: form.parentId || null,
    sortOrder: toNonNegativeInt(form.sortOrder),
    status: form.status,
  };
  saving.value = true;
  try {
    if (editingId.value) {
      await categoryApi.update(editingId.value, payload);
      MessagePlugin.success('分类已更新');
    } else {
      await categoryApi.create(payload);
      MessagePlugin.success('分类已创建');
    }
    dialogVisible.value = false;
    await load();
  } catch (error) {
    MessagePlugin.error(toErrorMessage(error, '保存失败'));
  } finally {
    saving.value = false;
  }
}

onMounted(load);
</script>
