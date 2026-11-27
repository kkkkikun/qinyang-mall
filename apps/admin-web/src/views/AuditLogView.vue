<template>
  <div>
    <div class="page-block">
      <div class="page-toolbar">
        <t-input v-model="filters.action" placeholder="操作标识，如 PRODUCT_STATUS_CHANGE" style="width: 220px" clearable />
        <t-input v-model="filters.targetType" placeholder="对象类型，如 PRODUCT" style="width: 180px" clearable />
        <t-input v-model="filters.targetId" placeholder="对象 ID" style="width: 180px" clearable />
        <t-input v-model="filters.actorId" placeholder="操作人 ID" style="width: 180px" clearable />
        <t-button theme="primary" @click="handleSearch">查询</t-button>
        <t-button theme="default" @click="handleReset">重置</t-button>
      </div>

      <t-table
        row-key="id"
        :data="tableData"
        :columns="columns"
        :loading="loading"
                :empty="emptyHint('没有操作记录', '关键的审核、报价、订单操作都会留痕在这里')"
        :pagination="pagination"
        :bordered="false"
        @page-change="handlePageChange"
      />
    </div>

    <t-drawer v-model:visible="detailVisible" header="审计日志详情" size="820px" :footer="false">
      <div v-if="!detail" class="empty-text">加载中…</div>
      <div v-else>
        <t-descriptions :column="3" bordered size="small">
          <t-descriptions-item label="操作">{{ detail.action }}</t-descriptions-item>
          <t-descriptions-item label="对象类型">{{ detail.targetType }}</t-descriptions-item>
          <t-descriptions-item label="对象 ID">{{ detail.targetId || '—' }}</t-descriptions-item>
          <t-descriptions-item label="操作人">{{ detail.actorName }}</t-descriptions-item>
          <t-descriptions-item label="角色">{{ roleLabel(detail.actorRole) }}</t-descriptions-item>
          <t-descriptions-item label="时间">{{ formatDateTime(detail.createdAt) }}</t-descriptions-item>
          <t-descriptions-item label="来源 IP">{{ detail.ip || '—' }}</t-descriptions-item>
        </t-descriptions>

        <div class="section-title mt-20">变更前后对比</div>
        <div v-if="!diffRows.length" class="empty-text">该记录没有可对比的数据</div>
        <div v-else class="diff-grid">
          <div class="diff-block">
            <div class="diff-block-head">变更前</div>
            <div v-for="row in diffRows" :key="row.key" class="diff-key" :class="{ 'is-changed': row.changed }">
              <span class="muted">{{ row.key }}</span>
              <span class="diff-value">{{ row.beforeText }}</span>
            </div>
          </div>
          <div class="diff-block">
            <div class="diff-block-head">变更后</div>
            <div v-for="row in diffRows" :key="row.key" class="diff-key" :class="{ 'is-changed': row.changed }">
              <span class="muted">{{ row.key }}</span>
              <span class="diff-value">{{ row.afterText }}</span>
            </div>
          </div>
        </div>
      </div>
    </t-drawer>
  </div>
</template>

<script setup lang="ts">
import { computed, h, onMounted, reactive, ref, type VNode } from 'vue';
import { Button, MessagePlugin } from 'tdesign-vue-next';
import { AdminRole, type AuditLogDto } from '@qinyang/contracts';
import { auditLogApi } from '../api/admin';
import { toErrorMessage } from '../api/http';
import { formatDateTime } from '../utils/format';
import { cell, emptyHint, toTableData } from '../utils/table';

const filters = reactive({
  action: '',
  targetType: '',
  targetId: '',
  actorId: '',
});

const rows = ref<AuditLogDto[]>([]);
const loading = ref(false);
const page = ref(1);
const pageSize = ref(10);
const pagination = reactive({ current: 1, pageSize: 10, total: 0 });
const tableData = computed(() => toTableData(rows.value));

const detailVisible = ref(false);
const detail = ref<AuditLogDto | null>(null);

interface DiffRow {
  key: string;
  beforeText: string;
  afterText: string;
  changed: boolean;
}

const diffRows = computed<DiffRow[]>(() => {
  const current = detail.value;
  if (!current) {
    return [];
  }
  const before = toRecord(current.before);
  const after = toRecord(current.after);
  const keys = Array.from(new Set([...Object.keys(before), ...Object.keys(after)]));
  return keys.map((key) => {
    const beforeText = stringify(before[key]);
    const afterText = stringify(after[key]);
    return { key, beforeText, afterText, changed: beforeText !== afterText };
  });
});

function toRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function stringify(value: unknown): string {
  if (value === undefined) {
    return '—';
  }
  if (value === null) {
    return 'null';
  }
  if (typeof value === 'string') {
    return value;
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function roleLabel(role: AdminRole | null): string {
  if (role === AdminRole.OWNER) {
    return '店主';
  }
  if (role === AdminRole.STAFF) {
    return '店员';
  }
  return '—';
}

const columns = [
  {
    colKey: 'createdAt',
    title: '时间',
    width: 170,
    cell: cell<AuditLogDto>((row) => h('span', null, formatDateTime(row.createdAt))),
  },
  { colKey: 'actorName', title: '操作人', width: 120 },
  {
    colKey: 'actorRole',
    title: '角色',
    width: 90,
    cell: cell<AuditLogDto>((row) => h('span', null, roleLabel(row.actorRole))),
  },
  { colKey: 'action', title: '操作', width: 240 },
  { colKey: 'targetType', title: '对象类型', width: 140 },
  {
    colKey: 'targetId',
    title: '对象 ID',
    width: 200,
    cell: cell<AuditLogDto>((row) => h('span', { class: 'muted' }, row.targetId || '—')),
  },
  {
    colKey: 'ip',
    title: 'IP',
    width: 140,
    cell: cell<AuditLogDto>((row) => h('span', { class: 'muted' }, row.ip || '—')),
  },
  {
    colKey: 'operation',
    title: '操作',
    width: 100,
    cell: cell<AuditLogDto>((row) => {
      const actions: VNode[] = [
        h(Button, { theme: 'default', size: 'small', onClick: () => openDetail(row) }, () => '详情'),
      ];
      return h('div', { style: 'display:flex; gap:6px;' }, actions);
    }),
  },
];

async function load(): Promise<void> {
  loading.value = true;
  try {
    const result = await auditLogApi.list({
      action: filters.action.trim() || undefined,
      targetType: filters.targetType.trim() || undefined,
      targetId: filters.targetId.trim() || undefined,
      actorId: filters.actorId.trim() || undefined,
      page: page.value,
      pageSize: pageSize.value,
    });
    rows.value = result.items;
    pagination.current = result.page;
    pagination.pageSize = result.pageSize;
    pagination.total = result.total;
  } catch (error) {
    MessagePlugin.error(toErrorMessage(error, '审计日志加载失败'));
  } finally {
    loading.value = false;
  }
}

function handleSearch(): void {
  page.value = 1;
  void load();
}

function handleReset(): void {
  filters.action = '';
  filters.targetType = '';
  filters.targetId = '';
  filters.actorId = '';
  page.value = 1;
  void load();
}

/** t-table 的 page-change 事件参数为 PageInfo（current / previous / pageSize） */
function handlePageChange(pageInfo: { current: number; pageSize: number }): void {
  page.value = pageInfo.current;
  pageSize.value = pageInfo.pageSize;
  void load();
}

function openDetail(row: AuditLogDto): void {
  detail.value = row;
  detailVisible.value = true;
}

onMounted(load);
</script>
