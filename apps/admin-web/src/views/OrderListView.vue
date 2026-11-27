<template>
  <div>
    <div class="page-block">
      <div class="page-toolbar">
        <t-input
          v-model="filters.keyword"
          placeholder="按订单号 / 申请号搜索"
          style="width: 240px"
          clearable
          @enter="handleSearch"
        />
        <t-select
          v-model="filters.status"
          placeholder="全部状态"
          style="width: 170px"
          clearable
          :options="statusOptions"
        />
        <t-button theme="primary" @click="handleSearch">查询</t-button>
        <t-button theme="default" @click="handleReset">重置</t-button>
        <span class="page-toolbar-spacer"></span>
        <span class="muted">V1 未启用线上收款，订单状态仅由后台推进。</span>
      </div>

      <t-table
        row-key="id"
        :data="tableData"
        :columns="columns"
        :loading="loading"
        :pagination="pagination"
        :bordered="false"
        @page-change="handlePageChange"
      />
    </div>

    <t-drawer
      v-model:visible="detailVisible"
      header="订单详情"
      size="820px"
      :footer="false"
      @close="handleDetailClose"
    >
      <div v-if="detailLoading" class="empty-text">加载中…</div>
      <div v-else-if="detail" class="detail-drawer-body">
        <div class="page-toolbar">
          <t-button
            v-if="can('order.status') && nextStatuses.length"
            theme="primary"
            size="small"
            @click="openStatusDialog"
          >
            更新制作状态
          </t-button>
          <t-button
            v-if="can('order.status') && detail.status !== OrderStatus.SHIPPED && detail.status !== OrderStatus.COMPLETED"
            theme="default"
            size="small"
            @click="openShipDialog"
          >
            填写物流
          </t-button>
          <t-popconfirm
            v-if="can('order.cancel') && canCancel"
            content="确认取消该订单？取消原因会记录在订单中。"
            theme="danger"
            @confirm="handleCancel"
          >
            <t-button theme="danger" variant="outline" size="small">取消订单</t-button>
          </t-popconfirm>
        </div>

        <div class="section-title">订单信息</div>
        <t-descriptions :column="3" bordered size="small">
          <t-descriptions-item label="订单号">{{ detail.orderNo }}</t-descriptions-item>
          <t-descriptions-item label="状态">
            <t-tag :theme="orderStatusTheme(detail.status)" variant="light">
              {{ detail.statusLabel || ORDER_STATUS_LABELS[detail.status] }}
            </t-tag>
          </t-descriptions-item>
          <t-descriptions-item label="创建时间">
            {{ formatDateTime(detail.createdAt) }}
          </t-descriptions-item>
          <t-descriptions-item label="来源申请">{{ detail.requestNo }}</t-descriptions-item>
          <t-descriptions-item label="报价版本">v{{ detail.quoteVersion }}</t-descriptions-item>
          <t-descriptions-item label="制作周期">{{ detail.productionDays }} 天</t-descriptions-item>
          <t-descriptions-item label="货款">{{ formatYuan(detail.amountCents) }}</t-descriptions-item>
          <t-descriptions-item label="运费">{{ formatYuan(detail.freightCents) }}</t-descriptions-item>
          <t-descriptions-item label="合计">
            <span class="text-gold">{{ formatYuan(detail.totalCents) }}</span>
          </t-descriptions-item>
          <t-descriptions-item label="物流公司">{{ detail.carrier || '—' }}</t-descriptions-item>
          <t-descriptions-item label="物流单号">{{ detail.trackingNo || '—' }}</t-descriptions-item>
          <t-descriptions-item label="发货时间">
            {{ detail.shippedAt ? formatDateTime(detail.shippedAt) : '—' }}
          </t-descriptions-item>
        </t-descriptions>

        <div class="section-title" style="margin-top: 20px">商品快照</div>
        <div class="snapshot-card">
          <div class="detail-grid">
            <div>
              <div class="muted">商品名称</div>
              <div>{{ detail.productSnapshot.name }}</div>
            </div>
            <div>
              <div class="muted">商品编号</div>
              <div>{{ detail.productSnapshot.code }}</div>
            </div>
            <div>
              <div class="muted">分类</div>
              <div>{{ detail.productSnapshot.categoryName }}</div>
            </div>
            <div>
              <div class="muted">报价模式</div>
              <div>
                {{
                  detail.productSnapshot.pricingMode === PricingMode.FIXED_PRICE
                    ? '固定价可直售'
                    : '仅按量体报价'
                }}
              </div>
            </div>
            <div>
              <div class="muted">快照价格</div>
              <div>
                {{
                  detail.productSnapshot.priceCents === null
                    ? '待报价'
                    : formatYuan(detail.productSnapshot.priceCents)
                }}
              </div>
            </div>
            <div>
              <div class="muted">快照图集</div>
              <div>{{ detail.productSnapshot.media?.length ?? 0 }} 张</div>
            </div>
          </div>
        </div>

        <div class="section-title" style="margin-top: 20px">量体快照</div>
        <div class="snapshot-card">
          <MeasurementSnapshotView :snapshot="detail.measurementSnapshot" />
        </div>

        <div class="section-title" style="margin-top: 20px">收货与联系方式</div>
        <div class="snapshot-card">
          <t-descriptions :column="3" size="small">
            <t-descriptions-item label="联系人">{{ detail.contact.name }}</t-descriptions-item>
            <t-descriptions-item label="电话">{{ detail.contact.phone }}</t-descriptions-item>
            <t-descriptions-item label="地区">{{ detail.contact.region }}</t-descriptions-item>
            <t-descriptions-item label="详细地址">{{ detail.contact.detail || '—' }}</t-descriptions-item>
          </t-descriptions>
          <div v-if="detail.remark" class="muted" style="margin-top: 8px">
            订单备注：{{ detail.remark }}
          </div>
        </div>

        <div class="section-title" style="margin-top: 20px">状态时间线</div>
        <div class="snapshot-card">
          <ul class="timeline">
            <li v-for="event in detail.events || []" :key="event.id" class="timeline-item">
              <div class="timeline-title">
                {{ event.fromStatus ? `${ORDER_STATUS_LABELS[event.fromStatus]} → ` : '' }}{{
                  ORDER_STATUS_LABELS[event.toStatus]
                }}
              </div>
              <div class="timeline-meta">
                {{ formatDateTime(event.createdAt) }} · {{ event.operatorName }}
                <span v-if="event.note">· {{ event.note }}</span>
              </div>
            </li>
          </ul>
          <div v-if="!detail.events || !detail.events.length" class="empty-text">暂无状态变更记录</div>
        </div>
      </div>
    </t-drawer>

    <!-- 更新制作状态 -->
    <t-dialog v-model:visible="statusVisible" header="更新制作状态" :footer="false">
      <t-form label-align="top">
        <t-form-item label="目标状态">
          <t-select v-model="statusForm.status" :options="nextStatusOptions" />
        </t-form-item>
        <t-form-item label="备注">
          <t-textarea v-model="statusForm.note" :rows="3" placeholder="选填" />
        </t-form-item>
      </t-form>
      <t-button theme="primary" :loading="submitting" @click="handleSubmitStatus">确认</t-button>
      <t-button theme="default" style="margin-left: 8px" @click="statusVisible = false">取消</t-button>
    </t-dialog>

    <!-- 填写物流 -->
    <t-dialog v-model:visible="shipVisible" header="填写物流信息" :footer="false">
      <t-form :data="shipForm" :rules="shipRules" label-align="top">
        <t-form-item label="物流公司" name="carrier">
          <t-input v-model="shipForm.carrier" placeholder="如 顺丰速运" />
        </t-form-item>
        <t-form-item label="物流单号" name="trackingNo">
          <t-input v-model="shipForm.trackingNo" placeholder="请输入运单号" />
        </t-form-item>
        <t-form-item label="备注">
          <t-textarea v-model="shipForm.note" :rows="3" placeholder="选填" />
        </t-form-item>
      </t-form>
      <t-button theme="primary" :loading="submitting" @click="handleSubmitShip">确认</t-button>
      <t-button theme="default" style="margin-left: 8px" @click="shipVisible = false">取消</t-button>
    </t-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, h, onMounted, reactive, ref, type VNode } from 'vue';
import { Button, MessagePlugin, Tag } from 'tdesign-vue-next';
import {
  ORDER_STATUS_LABELS,
  OrderStatus,
  ORDER_STATUS_TRANSITIONS,
  PricingMode,
  type OrderDto,
  type OrderListItemDto,
} from '@qinyang/contracts';
import { orderApi } from '../api/admin';
import { toErrorMessage } from '../api/http';
import { useAuthStore } from '../stores/auth';
import { hasPermission, type PermissionKey } from '../utils/permissions';
import { formatDateTime, formatYuan } from '../utils/format';
import { orderStatusTheme } from '../utils/status';
import { cell, toTableData } from '../utils/table';
import MeasurementSnapshotView from '../components/MeasurementSnapshotView.vue';

const auth = useAuthStore();

function can(key: PermissionKey): boolean {
  return hasPermission(auth.user?.role, key);
}

const filters = reactive<{ keyword: string; status: '' | OrderStatus }>({
  keyword: '',
  status: '',
});

const rows = ref<OrderListItemDto[]>([]);
const loading = ref(false);
const page = ref(1);
const pageSize = ref(10);
const pagination = reactive({ current: 1, pageSize: 10, total: 0 });
const tableData = computed(() => toTableData(rows.value));

const statusOptions = Object.values(OrderStatus).map((value) => ({
  label: ORDER_STATUS_LABELS[value],
  value,
}));

const detailVisible = ref(false);
const detailLoading = ref(false);
const detail = ref<OrderDto | null>(null);

const statusVisible = ref(false);
const shipVisible = ref(false);
const submitting = ref(false);

const statusForm = reactive<{ status: OrderStatus; note: string }>({
  status: OrderStatus.IN_PRODUCTION,
  note: '',
});

const shipForm = reactive<{ carrier: string; trackingNo: string; note: string }>({
  carrier: '',
  trackingNo: '',
  note: '',
});

const shipRules = {
  carrier: [{ required: true, message: '请输入物流公司' }],
  trackingNo: [{ required: true, message: '请输入物流单号' }],
};

/** 依据状态机表计算当前可流转到的状态 */
const nextStatuses = computed<OrderStatus[]>(() => {
  if (!detail.value) {
    return [];
  }
  return ORDER_STATUS_TRANSITIONS[detail.value.status] ?? [];
});

const nextStatusOptions = computed(() =>
  nextStatuses.value
    .filter((value) => value !== OrderStatus.CANCELLED)
    .map((value) => ({ label: ORDER_STATUS_LABELS[value], value })),
);

const canCancel = computed(() => nextStatuses.value.includes(OrderStatus.CANCELLED));

const columns = [
  { colKey: 'orderNo', title: '订单号', width: 160 },
  { colKey: 'requestNo', title: '来源申请', width: 160 },
  {
    colKey: 'productName',
    title: '商品',
    width: 180,
    // 订单列表项里的商品名在冻结快照上（productSnapshot.name），
    // 顶层并没有 productName 字段——此前这一列恒为空。
    cell: cell<OrderListItemDto>((row) =>
      h('span', null, row.productSnapshot?.name || '—'),
    ),
  },
  {
    colKey: 'status',
    title: '状态',
    width: 110,
    cell: cell<OrderDto>((row) =>
      h(Tag, { theme: orderStatusTheme(row.status), variant: 'light' }, () =>
        row.statusLabel || ORDER_STATUS_LABELS[row.status],
      ),
    ),
  },
  {
    colKey: 'totalCents',
    title: '合计',
    width: 120,
    cell: cell<OrderDto>((row) => h('span', { class: 'text-gold' }, formatYuan(row.totalCents))),
  },
  {
    colKey: 'quoteVersion',
    title: '报价版本',
    width: 100,
    cell: cell<OrderDto>((row) => h('span', null, `v${row.quoteVersion}`)),
  },
  { colKey: 'createdAt', title: '创建时间', width: 170 },
  {
    colKey: 'operation',
    title: '操作',
    width: 120,
    cell: cell<OrderDto>((row) => {
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
    const result = await orderApi.list({
      keyword: filters.keyword.trim() || undefined,
      status: filters.status === '' ? undefined : filters.status,
      page: page.value,
      pageSize: pageSize.value,
    });
    rows.value = result.items;
    pagination.current = result.page;
    pagination.pageSize = result.pageSize;
    pagination.total = result.total;
  } catch (error) {
    MessagePlugin.error(toErrorMessage(error, '订单列表加载失败'));
  } finally {
    loading.value = false;
  }
}

function handleSearch(): void {
  page.value = 1;
  void load();
}

function handleReset(): void {
  filters.keyword = '';
  filters.status = '';
  page.value = 1;
  void load();
}

/** t-table 的 page-change 事件参数为 PageInfo（current / previous / pageSize） */
function handlePageChange(pageInfo: { current: number; pageSize: number }): void {
  page.value = pageInfo.current;
  pageSize.value = pageInfo.pageSize;
  void load();
}

async function openDetail(row: OrderDto): Promise<void> {
  detailVisible.value = true;
  detailLoading.value = true;
  try {
    detail.value = await orderApi.detail(row.id);
  } catch (error) {
    MessagePlugin.error(toErrorMessage(error, '订单详情加载失败'));
  } finally {
    detailLoading.value = false;
  }
}

function handleDetailClose(): void {
  detail.value = null;
}

function openStatusDialog(): void {
  const first = nextStatuses.value[0];
  if (!first) {
    return;
  }
  statusForm.status = first;
  statusForm.note = '';
  statusVisible.value = true;
}

async function handleSubmitStatus(): Promise<void> {
  const current = detail.value;
  if (!current) {
    return;
  }
  submitting.value = true;
  try {
    await orderApi.updateStatus(current.id, {
      status: statusForm.status,
      note: statusForm.note.trim() || null,
    });
    MessagePlugin.success('订单状态已更新');
    statusVisible.value = false;
    await openDetail(current);
    await load();
  } catch (error) {
    MessagePlugin.error(toErrorMessage(error, '状态更新失败'));
  } finally {
    submitting.value = false;
  }
}

function openShipDialog(): void {
  shipForm.carrier = '';
  shipForm.trackingNo = '';
  shipForm.note = '';
  shipVisible.value = true;
}

async function handleSubmitShip(): Promise<void> {
  const current = detail.value;
  if (!current) {
    return;
  }
  if (!shipForm.carrier.trim() || !shipForm.trackingNo.trim()) {
    MessagePlugin.error('请填写物流公司与物流单号');
    return;
  }
  submitting.value = true;
  try {
    await orderApi.ship(current.id, {
      carrier: shipForm.carrier.trim(),
      trackingNo: shipForm.trackingNo.trim(),
      note: shipForm.note.trim() || null,
    });
    MessagePlugin.success('物流信息已保存');
    shipVisible.value = false;
    await openDetail(current);
    await load();
  } catch (error) {
    MessagePlugin.error(toErrorMessage(error, '填写物流失败'));
  } finally {
    submitting.value = false;
  }
}

async function handleCancel(): Promise<void> {
  const current = detail.value;
  if (!current) {
    return;
  }
  try {
    await orderApi.cancel(current.id, '店主在后台取消订单');
    MessagePlugin.success('订单已取消');
    await openDetail(current);
    await load();
  } catch (error) {
    MessagePlugin.error(toErrorMessage(error, '取消订单失败'));
  }
}

onMounted(load);
</script>

<style scoped>
.detail-drawer-body {
  padding-bottom: 24px;
}
</style>
