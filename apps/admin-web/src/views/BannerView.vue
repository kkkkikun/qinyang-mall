<template>
  <div>
    <div class="page-block">
      <div class="page-toolbar">
        <span class="muted">轮播仅在启用状态且处于投放期内时对顾客端展示。</span>
        <span class="page-toolbar-spacer"></span>
        <t-button v-if="can('banner.manage')" theme="primary" @click="openCreate">
          新增轮播
        </t-button>
      </div>

      <t-table
        row-key="id"
        :data="tableData"
        :columns="columns"
        :loading="loading"
                :empty="emptyHint('还没有轮播图', '首页轮播为空时顾客看到的是常规商品流')"
        :pagination="{ current: 1, pageSize: 999, total: rows.length }"
        :bordered="false"
      />
    </div>

    <t-dialog
      v-model:visible="dialogVisible"
      :header="editingId ? '编辑轮播' : '新增轮播'"
      width="620px"
      :footer="false"
      @close="handleDialogClose"
    >
      <t-form :rules="rules" label-align="top">
        <div class="form-grid">
          <t-form-item label="标题" name="title">
            <t-input v-model="form.title" placeholder="如 秋冬新品 · 羊绒衣橱" />
          </t-form-item>
          <t-form-item label="图片地址" name="imageUrl">
            <t-input v-model="form.imageUrl" placeholder="可手动填写，或使用下方上传按钮" />
          </t-form-item>
          <t-form-item label="跳转类型" name="linkType">
            <t-select v-model="form.linkType" :options="linkTypeOptions" />
          </t-form-item>
          <t-form-item label="跳转目标" name="linkValue">
            <t-input
              v-model="form.linkValue"
              :placeholder="linkValuePlaceholder"
              :disabled="form.linkType === 'NONE'"
            />
          </t-form-item>
          <t-form-item label="排序值" name="sortOrder">
            <t-input v-model="form.sortOrder" placeholder="数值越小越靠前" />
          </t-form-item>
          <t-form-item label="状态" name="status">
            <t-select v-model="form.status" :options="statusOptions" />
          </t-form-item>
          <t-form-item label="投放开始" name="startAt">
            <t-date-picker
              v-model="form.startAt"
              value-type="YYYY-MM-DD HH:mm:ss"
              format="YYYY-MM-DD HH:mm:ss"
              enable-time-picker
              clearable
              placeholder="不填表示立即投放"
            />
          </t-form-item>
          <t-form-item label="投放结束" name="endAt">
            <t-date-picker
              v-model="form.endAt"
              value-type="YYYY-MM-DD HH:mm:ss"
              format="YYYY-MM-DD HH:mm:ss"
              enable-time-picker
              clearable
              placeholder="不填表示长期投放"
            />
          </t-form-item>
        </div>

        <div class="page-toolbar">
          <label class="qy-upload-button">
            <input type="file" accept="image/*" :disabled="uploading" @change="handleFileChange" />
            <span>{{ uploading ? '上传中…' : '上传轮播图' }}</span>
          </label>
          <span v-if="form.imageUrl" class="muted">当前图片：{{ form.imageUrl }}</span>
        </div>

        <t-button theme="primary" :loading="saving" @click="handleSave">保存</t-button>
        <t-button theme="default" class="ml-8" @click="dialogVisible = false">取消</t-button>
      </t-form>
    </t-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, h, onMounted, reactive, ref, type VNode } from 'vue';
import { Button, MessagePlugin, Popconfirm, Switch, Tag } from 'tdesign-vue-next';
import type { BannerDto, BannerUpsertRequest } from '@qinyang/contracts';
import { bannerApi, mediaApi } from '../api/admin';
import { toErrorMessage } from '../api/http';
import { useAuthStore } from '../stores/auth';
import { hasPermission, type PermissionKey } from '../utils/permissions';
import { formatDateTime } from '../utils/format';
import { cell, emptyHint, toTableData } from '../utils/table';

const auth = useAuthStore();

function can(key: PermissionKey): boolean {
  return hasPermission(auth.user?.role, key);
}

const rows = ref<BannerDto[]>([]);
const loading = ref(false);

const dialogVisible = ref(false);
const saving = ref(false);
const uploading = ref(false);
const editingId = ref('');

interface BannerFormModel {
  title: string;
  imageUrl: string;
  linkType: BannerDto['linkType'];
  linkValue: string;
  sortOrder: string;
  status: BannerDto['status'];
  startAt: string;
  endAt: string;
}

const form = reactive<BannerFormModel>({
  title: '',
  imageUrl: '',
  linkType: 'NONE',
  linkValue: '',
  sortOrder: '0',
  status: 'ACTIVE',
  startAt: '',
  endAt: '',
});

const rules = {
  title: [{ required: true, message: '请输入标题' }],
  imageUrl: [{ required: true, message: '请填写或上传轮播图片' }],
};

const linkTypeOptions = [
  { label: '不跳转', value: 'NONE' },
  { label: '商品', value: 'PRODUCT' },
  { label: '分类', value: 'CATEGORY' },
  { label: '页面路径', value: 'PAGE' },
];

const statusOptions = [
  { label: '启用', value: 'ACTIVE' },
  { label: '停用', value: 'DISABLED' },
];

const linkValuePlaceholder = computed(() => {
  switch (form.linkType) {
    case 'PRODUCT':
      return '商品 ID';
    case 'CATEGORY':
      return '分类 ID';
    case 'PAGE':
      return '小程序页面路径，如 /pages/category/index';
    default:
      return '不跳转时可留空';
  }
});

const tableData = computed(() => toTableData(rows.value));

const columns = [
  {
    colKey: 'imageUrl',
    title: '图片',
    width: 90,
    cell: cell<BannerDto>((row) =>
      row.imageUrl
        ? h('img', {
            src: row.imageUrl,
            alt: row.title,
            style: 'width:60px;height:36px;object-fit:cover;border-radius:4px;',
          })
        : h('span', { class: 'muted' }, '—'),
    ),
  },
  { colKey: 'title', title: '标题', width: 220 },
  {
    colKey: 'linkType',
    title: '跳转',
    width: 160,
    cell: cell<BannerDto>((row) =>
      h('span', null, `${linkTypeLabel(row.linkType)}${row.linkValue ? ' · ' + row.linkValue : ''}`),
    ),
  },
  { colKey: 'sortOrder', title: '排序', width: 80 },
  {
    colKey: 'status',
    title: '启用',
    width: 90,
    cell: cell<BannerDto>((row) =>
      can('banner.manage')
        ? h(Switch, {
            value: row.status === 'ACTIVE',
            onChange: (value: string | number | boolean) =>
              handleToggleStatus(row, value === true),
          })
        : h(
            Tag,
            { theme: row.status === 'ACTIVE' ? 'success' : 'default', variant: 'light' },
            () => (row.status === 'ACTIVE' ? '启用' : '停用'),
          ),
    ),
  },
  {
    colKey: 'period',
    title: '投放期',
    width: 260,
    cell: cell<BannerDto>((row) =>
      h(
        'span',
        { class: 'muted' },
        `${row.startAt ? formatDateTime(row.startAt) : '立即'} ~ ${row.endAt ? formatDateTime(row.endAt) : '长期'}`,
      ),
    ),
  },
  {
    colKey: 'operation',
    title: '操作',
    width: 220,
    cell: cell<BannerDto>((row) => {
      const actions: VNode[] = [];
      if (can('banner.manage')) {
        actions.push(
          h(Button, { theme: 'default', size: 'small', onClick: () => openEdit(row) }, () => '编辑'),
        );
        actions.push(
          h(Button, { theme: 'default', size: 'small', onClick: () => handleMove(row, -1) }, () => '上移'),
        );
        actions.push(
          h(Button, { theme: 'default', size: 'small', onClick: () => handleMove(row, 1) }, () => '下移'),
        );
      }
      if (can('banner.delete')) {
        actions.push(
          h(
            Popconfirm,
            {
              content: '确认删除该轮播？',
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
        return h('span', { class: 'muted' }, '仅查看');
      }
      return h('div', { style: 'display:flex; gap:6px; flex-wrap:wrap;' }, actions);
    }),
  },
];

function linkTypeLabel(type: BannerDto['linkType']): string {
  return linkTypeOptions.find((item) => item.value === type)?.label ?? type;
}

async function load(): Promise<void> {
  loading.value = true;
  try {
    rows.value = await bannerApi.list();
  } catch (error) {
    MessagePlugin.error(toErrorMessage(error, '轮播加载失败'));
  } finally {
    loading.value = false;
  }
}

function openCreate(): void {
  editingId.value = '';
  form.title = '';
  form.imageUrl = '';
  form.linkType = 'NONE';
  form.linkValue = '';
  form.sortOrder = String(rows.value.length);
  form.status = 'ACTIVE';
  form.startAt = '';
  form.endAt = '';
  dialogVisible.value = true;
}

function openEdit(row: BannerDto): void {
  editingId.value = row.id;
  form.title = row.title;
  form.imageUrl = row.imageUrl;
  form.linkType = row.linkType;
  form.linkValue = row.linkValue ?? '';
  form.sortOrder = String(row.sortOrder);
  form.status = row.status;
  form.startAt = row.startAt ?? '';
  form.endAt = row.endAt ?? '';
  dialogVisible.value = true;
}

function handleDialogClose(): void {
  editingId.value = '';
}

async function handleSave(): Promise<void> {
  if (saving.value) {
    return;
  }
  if (!form.title.trim() || !form.imageUrl.trim()) {
    MessagePlugin.error('请填写标题与轮播图片');
    return;
  }
  const payload: BannerUpsertRequest = {
    title: form.title.trim(),
    imageUrl: form.imageUrl.trim(),
    linkType: form.linkType,
    linkValue: form.linkType === 'NONE' ? null : form.linkValue.trim() || null,
    sortOrder: Number(form.sortOrder) || 0,
    status: form.status,
    startAt: form.startAt || null,
    endAt: form.endAt || null,
  };
  saving.value = true;
  try {
    if (editingId.value) {
      await bannerApi.update(editingId.value, payload);
      MessagePlugin.success('轮播已更新');
    } else {
      await bannerApi.create(payload);
      MessagePlugin.success('轮播已创建');
    }
    dialogVisible.value = false;
    await load();
  } catch (error) {
    MessagePlugin.error(toErrorMessage(error, '保存失败'));
  } finally {
    saving.value = false;
  }
}

async function handleToggleStatus(row: BannerDto, value: boolean): Promise<void> {
  try {
    await bannerApi.update(row.id, {
      title: row.title,
      imageUrl: row.imageUrl,
      linkType: row.linkType,
      linkValue: row.linkValue ?? null,
      sortOrder: row.sortOrder,
      status: value ? 'ACTIVE' : 'DISABLED',
      startAt: row.startAt ?? null,
      endAt: row.endAt ?? null,
    });
    await load();
  } catch (error) {
    MessagePlugin.error(toErrorMessage(error, '状态更新失败'));
  }
}

async function handleMove(row: BannerDto, offset: number): Promise<void> {
  const index = rows.value.findIndex((item) => item.id === row.id);
  const target = rows.value[index + offset];
  if (!target) {
    MessagePlugin.info('已经在边界位置');
    return;
  }
  try {
    await bannerApi.update(row.id, { ...toPayload(row), sortOrder: target.sortOrder });
    await bannerApi.update(target.id, { ...toPayload(target), sortOrder: row.sortOrder });
    await load();
  } catch (error) {
    MessagePlugin.error(toErrorMessage(error, '排序更新失败'));
  }
}

async function handleRemove(row: BannerDto): Promise<void> {
  try {
    await bannerApi.remove(row.id);
    MessagePlugin.success('轮播已删除');
    await load();
  } catch (error) {
    MessagePlugin.error(toErrorMessage(error, '删除失败'));
  }
}

async function handleFileChange(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0] ?? null;
  input.value = '';
  if (!file) {
    return;
  }
  uploading.value = true;
  try {
    const uploaded = await mediaApi.upload(file);
    form.imageUrl = uploaded.url;
    MessagePlugin.success('图片已上传');
  } catch (error) {
    MessagePlugin.error(toErrorMessage(error, '图片上传失败'));
  } finally {
    uploading.value = false;
  }
}

function toPayload(row: BannerDto): BannerUpsertRequest {
  return {
    title: row.title,
    imageUrl: row.imageUrl,
    linkType: row.linkType,
    linkValue: row.linkValue ?? null,
    sortOrder: row.sortOrder,
    status: row.status,
    startAt: row.startAt ?? null,
    endAt: row.endAt ?? null,
  };
}

onMounted(load);
</script>

<style scoped>
.qy-upload-button {
  display: inline-flex;
  align-items: center;
  height: 32px;
  padding: 0 14px;
  border-radius: 3px;
  background: var(--qy-tan);
  color: #fff;
  font-size: var(--qy-font-base);
  cursor: pointer;
  line-height: 1;
}

.qy-upload-button input {
  display: none;
}

.qy-upload-button:hover {
  background: var(--qy-gold);
}
</style>
