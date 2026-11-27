<template>
  <div>
    <div class="page-block">
      <div class="page-toolbar">
        <t-input
          v-model="filters.keyword"
          placeholder="按申请编号 / 顾客姓名 / 手机号 / 商品搜索"
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
        <t-button theme="default" :loading="exporting" @click="handleExport">导出 CSV</t-button>
      </div>

      <t-table
        row-key="id"
        :data="tableData"
        :columns="columns"
        :loading="loading"
                :empty="emptyHint('还没有定制申请', '顾客提交定制申请后会出现在这里；也可以调整筛选条件再看看')"
        :pagination="pagination"
        :bordered="false"
        @page-change="handlePageChange"
      />
    </div>

    <!-- 详情抽屉 -->
    <t-drawer
      v-model:visible="detailVisible"
      header="定制申请详情"
      size="820px"
      :footer="false"
      @close="handleDetailClose"
    >
      <div v-if="detailLoading" class="empty-text">加载中…</div>
      <div v-else-if="detail" class="detail-drawer-body">
        <div class="page-toolbar">
          <t-button
            v-if="canReview"
            theme="primary"
            size="small"
            @click="openReview('APPROVE')"
          >
            审核通过
          </t-button>
          <t-button v-if="canReview" theme="danger" variant="outline" size="small" @click="openReview('REJECT')">
            谢绝申请
          </t-button>
          <t-button
            v-if="can('request.quote') && canCreateQuote"
            theme="primary"
            size="small"
            @click="openQuoteDialog"
          >
            创建报价
          </t-button>
          <!-- 已报价/已确认的申请，店员此前无法退回，只能找开发改库 -->
          <t-popconfirm
            v-if="can('request.quote') && canReQuote"
            content="退回后申请回到「待报价」，可重新创建报价版本（顾客会看到状态变化）。确认退回？"
            theme="warning"
            @confirm="handleReQuote"
          >
            <t-button theme="default" size="small">退回重新报价</t-button>
          </t-popconfirm>
          <!-- 建单后顾客立刻能看到订单，误建会多出一条业务记录 -->
          <t-popconfirm
            v-if="can('request.order') && canCreateOrder"
            content="将按当前已确认报价生成订单，顾客会立即看到。确认创建？"
            theme="warning"
            @confirm="handleCreateOrder"
          >
            <t-button theme="primary" size="small">创建订单</t-button>
          </t-popconfirm>
        </div>

        <div class="section-title">申请信息</div>
        <t-descriptions :column="3" bordered size="small">
          <t-descriptions-item label="申请编号">{{ detail.requestNo }}</t-descriptions-item>
          <t-descriptions-item label="状态">
            <t-tag :theme="requestStatusTheme(detail.status)" variant="light">
              {{ detail.statusLabel || REQUEST_STATUS_LABELS[detail.status] }}
            </t-tag>
          </t-descriptions-item>
          <t-descriptions-item label="提交时间">
            {{ formatDateTime(detail.createdAt) }}
          </t-descriptions-item>
          <t-descriptions-item label="商品">
            {{ detail.productName }}（{{ detail.productCode }}）
          </t-descriptions-item>
          <t-descriptions-item label="量体模板">
            {{ detail.templateName }} · v{{ detail.templateVersion }}
          </t-descriptions-item>
          <t-descriptions-item label="关联订单">
            {{ detail.orderNo || '—' }}
          </t-descriptions-item>
        </t-descriptions>

        <div class="section-title mt-20">量体资料</div>
        <div class="snapshot-card">
          <MeasurementSnapshotView :snapshot="detail.measurements" />
        </div>

        <div class="section-title mt-20">联系方式</div>
        <div class="snapshot-card">
          <t-descriptions :column="3" size="small">
            <t-descriptions-item label="联系人">{{ detail.contact.name }}</t-descriptions-item>
            <t-descriptions-item label="电话">{{ detail.contact.phone }}</t-descriptions-item>
            <t-descriptions-item label="地区">{{ detail.contact.region }}</t-descriptions-item>
            <t-descriptions-item label="详细地址">
              {{ detail.contact.detail || '—' }}
            </t-descriptions-item>
          </t-descriptions>
          <div v-if="detail.remark" class="muted mt-8">
            顾客备注：{{ detail.remark }}
          </div>
        </div>

        <div class="section-title mt-20">报价历史</div>
        <QuoteVersionList
          :quotes="quotes"
          :show-withdraw="can('request.quote') && canWithdrawQuote"
          @withdraw="handleWithdrawQuote"
        />

        <div class="section-title mt-20">处理时间线</div>
        <div class="snapshot-card">
          <ul class="timeline">
            <li v-for="(item, index) in timeline" :key="index" class="timeline-item">
              <div class="timeline-title">{{ item.title }}</div>
              <div class="timeline-meta">{{ item.meta }}</div>
            </li>
          </ul>
          <div class="muted mt-8">
            时间线依据申请记录、报价版本与订单生成信息整理。
          </div>
        </div>
      </div>
    </t-drawer>

    <!-- 审核弹窗 -->
    <t-dialog
      v-model:visible="reviewVisible"
      :header="reviewAction === 'APPROVE' ? '审核通过' : '谢绝申请'"
      :footer="false"
    >
      <t-form label-align="top">
        <t-form-item label="审核备注">
          <t-textarea v-model="reviewNote" :rows="3" placeholder="选填，会记录在申请上" />
        </t-form-item>
      </t-form>
      <t-button theme="primary" :loading="submitting" @click="handleSubmitReview">确认</t-button>
      <t-button theme="default" class="ml-8" @click="reviewVisible = false">取消</t-button>
    </t-dialog>

    <!-- 报价弹窗 -->
    <t-dialog
      v-model:visible="quoteVisible"
      header="创建报价"
      width="560px"
      :footer="false"
    >
      <t-form :data="quoteForm" :rules="quoteRules" label-align="top">
        <div class="form-grid">
          <t-form-item label="货款金额（元）" name="amountYuan">
            <t-input v-model="quoteForm.amountYuan" placeholder="单位：元，提交后按整数分存储" />
          </t-form-item>
          <t-form-item label="运费（元）" name="freightYuan">
            <t-input v-model="quoteForm.freightYuan" placeholder="单位：元" />
          </t-form-item>
          <t-form-item label="制作周期（天）" name="productionDays">
            <t-input v-model="quoteForm.productionDays" placeholder="如 25" />
          </t-form-item>
          <t-form-item label="报价有效期" name="validUntil">
            <t-date-picker
              v-model="quoteForm.validUntil"
              value-type="YYYY-MM-DD HH:mm:ss"
              format="YYYY-MM-DD HH:mm:ss"
              enable-time-picker
              clearable
              placeholder="选填"
            />
          </t-form-item>
          <t-form-item label="报价说明" name="note" class="span-2">
            <t-textarea v-model="quoteForm.note" :rows="3" placeholder="选填" />
          </t-form-item>
        </div>
        <div class="muted form-tip">
          创建新报价会生成新版本，历史版本自动置为「已被新版本取代」。
        </div>
        <t-button
          v-if="latestQuote"
          theme="default"
          size="small"
          class="mb-16"
          @click="handleReuseLastQuote"
        >
          沿用上一版（货款 {{ formatYuan(latestQuote.amountCents) }} · 运费
          {{ formatYuan(latestQuote.freightCents) }} · {{ latestQuote.productionDays }} 天）
        </t-button>
      </t-form>
      <t-button theme="primary" :loading="submitting" @click="handleSubmitQuote">提交报价</t-button>
      <t-button theme="default" class="ml-8" @click="quoteVisible = false">取消</t-button>
    </t-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, h, onMounted, reactive, ref, type VNode } from 'vue';
import { Button, MessagePlugin, Tag } from 'tdesign-vue-next';
import {
  QuoteStatus,
  RequestStatus,
  REQUEST_STATUS_LABELS,
  type AdminCustomizationRequestListItemDto,
  type CustomizationRequestDto,
  type QuoteDto,
} from '@qinyang/contracts';
import { customizationRequestApi, orderApi, quoteApi } from '../api/admin';
import { toErrorMessage } from '../api/http';
import { useAuthStore } from '../stores/auth';
import { hasPermission, type PermissionKey } from '../utils/permissions';
import { formatDateTime, formatYuan } from '../utils/format';
import { requestStatusTheme } from '../utils/status';
import { cell, emptyHint, toTableData } from '../utils/table';
import { downloadCsv } from '../utils/download';
import { countCsvRows } from '../utils/csv';
import MeasurementSnapshotView from '../components/MeasurementSnapshotView.vue';
import QuoteVersionList from '../components/QuoteVersionList.vue';

const auth = useAuthStore();

function can(key: PermissionKey): boolean {
  return hasPermission(auth.user?.role, key);
}

const filters = reactive<{ keyword: string; status: '' | RequestStatus }>({
  keyword: '',
  status: '',
});

const rows = ref<AdminCustomizationRequestListItemDto[]>([]);
const loading = ref(false);
const exporting = ref(false);
const page = ref(1);
const pageSize = ref(10);
const pagination = reactive({ current: 1, pageSize: 10, total: 0 });
const tableData = computed(() => toTableData(rows.value));

const statusOptions = Object.values(RequestStatus).map((value) => ({
  label: REQUEST_STATUS_LABELS[value],
  value,
}));

const detailVisible = ref(false);
const detailLoading = ref(false);
const detail = ref<CustomizationRequestDto | null>(null);
const quotes = ref<QuoteDto[]>([]);

const reviewVisible = ref(false);
const reviewAction = ref<'APPROVE' | 'REJECT'>('APPROVE');
const reviewNote = ref('');

const quoteVisible = ref(false);
const submitting = ref(false);

const quoteForm = reactive({
  amountYuan: '',
  freightYuan: '0',
  productionDays: '25',
  validUntil: '',
  note: '',
});

const quoteRules = {
  amountYuan: [{ required: true, message: '请输入货款金额' }],
  productionDays: [{ required: true, message: '请输入制作周期' }],
};

const canReview = computed(
  () => can('request.review') && detail.value?.status === RequestStatus.PENDING_REVIEW,
);

/** 仅在「待报价 / 重新报价」状态下允许创建新报价 */
const canCreateQuote = computed(
  () =>
    detail.value?.status === RequestStatus.PENDING_QUOTE ||
    detail.value?.status === RequestStatus.QUOTED,
);

/** 顾客已确认报价后才可生成订单 */
const canCreateOrder = computed(
  () =>
    detail.value?.status === RequestStatus.CONFIRMED &&
    Boolean(detail.value?.activeQuote && detail.value.activeQuote.status === QuoteStatus.ACTIVE),
);

const timeline = computed<{ title: string; meta: string }[]>(() => {
  const current = detail.value;
  if (!current) {
    return [];
  }
  const items: { title: string; meta: string }[] = [
    { title: '提交定制申请', meta: formatDateTime(current.createdAt) },
  ];
  [...quotes.value]
    .sort((a, b) => a.version - b.version)
    .forEach((quote) => {
      items.push({
        title: `创建报价 v${quote.version}（合计 ${formatYuan(quote.totalCents)}）`,
        meta: `${formatDateTime(quote.createdAt)} · ${quote.createdByName}`,
      });
    });
  const confirmed = quotes.value.find((quote) => quote.confirmedAt);
  if (confirmed) {
    items.push({
      title: `顾客确认报价 v${confirmed.version}`,
      meta: formatDateTime(confirmed.confirmedAt),
    });
  }
  if (current.orderId) {
    items.push({ title: `生成订单 ${current.orderNo ?? ''}`, meta: formatDateTime(current.updatedAt) });
  }
  items.push({
    title: `当前状态：${current.statusLabel || REQUEST_STATUS_LABELS[current.status]}`,
    meta: `最近更新 ${formatDateTime(current.updatedAt)}`,
  });
  return items;
});

const columns = [
  { colKey: 'requestNo', title: '申请编号', width: 160 },
  {
    colKey: 'customerName',
    title: '顾客',
    width: 150,
    cell: cell<AdminCustomizationRequestListItemDto>((row) => {
      // 只显示姓名与脱敏手机号；完整联系方式在详情抽屉里看
      const name = row.customerName || '（未填写）';
      const phone = row.customerPhoneMasked;
      return h('div', { class: 'cell-stack' }, [
        h('span', null, name),
        phone ? h('span', { class: 'text-muted' }, phone) : null,
      ]);
    }),
  },
  { colKey: 'productName', title: '商品', width: 200 },
  {
    colKey: 'templateName',
    title: '量体模板',
    width: 180,
    cell: cell<CustomizationRequestDto>((row) =>
      h('span', null, `${row.templateName} · v${row.templateVersion}`),
    ),
  },
  {
    colKey: 'status',
    title: '状态',
    width: 120,
    cell: cell<CustomizationRequestDto>((row) =>
      h(Tag, { theme: requestStatusTheme(row.status), variant: 'light' }, () =>
        row.statusLabel || REQUEST_STATUS_LABELS[row.status],
      ),
    ),
  },
  {
    colKey: 'quote',
    title: '当前报价',
    width: 140,
    cell: cell<CustomizationRequestDto>((row) => {
      if (!row.activeQuote) {
        return h(Tag, { theme: 'warning', variant: 'light' }, () => '待报价');
      }
      return h('span', { class: 'text-gold' }, formatYuan(row.activeQuote.totalCents));
    }),
  },
  { colKey: 'createdAt', title: '提交时间', width: 170 },
  {
    colKey: 'operation',
    title: '操作',
    width: 120,
    cell: cell<CustomizationRequestDto>((row) => {
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
    const result = await customizationRequestApi.list({
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
    MessagePlugin.error(toErrorMessage(error, '申请列表加载失败'));
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

/**
 * 导出当前筛选结果为 CSV。
 *
 * 导出的是**当前筛选条件**下的单子（与列表所见一致），
 * 手机号脱敏、不含量体明细 —— 导出文件会离开后台。
 */
async function handleExport(): Promise<void> {
  exporting.value = true;
  try {
    const { text, filename } = await customizationRequestApi.exportCsv({
      status: filters.status || undefined,
      keyword: filters.keyword.trim() || undefined,
    });
    downloadCsv(text, filename);
    const count = countCsvRows(text);
    MessagePlugin.success(count > 0 ? `已导出 ${count} 条申请` : '当前筛选条件下没有可导出的申请');
  } catch (error) {
    MessagePlugin.error(toErrorMessage(error, '导出失败'));
  } finally {
    exporting.value = false;
  }
}

/** t-table 的 page-change 事件参数为 PageInfo（current / previous / pageSize） */
function handlePageChange(pageInfo: { current: number; pageSize: number }): void {
  page.value = pageInfo.current;
  pageSize.value = pageInfo.pageSize;
  void load();
}

async function openDetail(row: CustomizationRequestDto): Promise<void> {
  detailVisible.value = true;
  detailLoading.value = true;
  try {
    const [detailResult, quoteList] = await Promise.all([
      customizationRequestApi.detail(row.id),
      customizationRequestApi.quoteHistory(row.id),
    ]);
    detail.value = detailResult;
    quotes.value = quoteList;
  } catch (error) {
    MessagePlugin.error(toErrorMessage(error, '申请详情加载失败'));
  } finally {
    detailLoading.value = false;
  }
}

function handleDetailClose(): void {
  detail.value = null;
  quotes.value = [];
}

function openReview(action: 'APPROVE' | 'REJECT'): void {
  reviewAction.value = action;
  reviewNote.value = '';
  reviewVisible.value = true;
}

async function handleSubmitReview(): Promise<void> {
  const current = detail.value;
  if (!current) {
    return;
  }
  submitting.value = true;
  try {
    await customizationRequestApi.review(current.id, reviewAction.value, reviewNote.value.trim());
    MessagePlugin.success(reviewAction.value === 'APPROVE' ? '已审核通过' : '已谢绝申请');
    reviewVisible.value = false;
    await openDetail(current);
    await load();
  } catch (error) {
    MessagePlugin.error(toErrorMessage(error, '审核失败'));
  } finally {
    submitting.value = false;
  }
}

/**
 * 最近一版报价（按版本号倒序取第一条有效版本）。
 *
 * 改价时沿用上一版的金额/运费/周期是最高频的操作 ——
 * 此前每一版都要把三个数字重新敲一遍。
 */
const latestQuote = computed<QuoteDto | null>(() => {
  const list = [...quotes.value].sort((a, b) => b.version - a.version);
  return list.find((quote) => quote.status !== QuoteStatus.REJECTED) ?? list[0] ?? null;
});

/** 一键把上一版的金额、运费、制作周期填进表单（有效期与说明不沿用） */
function handleReuseLastQuote(): void {
  const quote = latestQuote.value;
  if (!quote) {
    return;
  }
  quoteForm.amountYuan = (quote.amountCents / 100).toFixed(2);
  quoteForm.freightYuan = (quote.freightCents / 100).toFixed(2);
  quoteForm.productionDays = String(quote.productionDays);
  MessagePlugin.success('已填入上一版的货款、运费与制作周期');
}

function openQuoteDialog(): void {
  quoteForm.amountYuan = '';
  quoteForm.freightYuan = '0';
  quoteForm.productionDays = '25';
  quoteForm.validUntil = '';
  quoteForm.note = '';
  quoteVisible.value = true;
}

async function handleSubmitQuote(): Promise<void> {
  const current = detail.value;
  if (!current) {
    return;
  }
  const amount = Number(quoteForm.amountYuan);
  const freight = Number(quoteForm.freightYuan || '0');
  const days = Number(quoteForm.productionDays);
  if (!Number.isFinite(amount) || amount <= 0) {
    MessagePlugin.error('请输入有效的货款金额（单位：元）');
    return;
  }
  if (!Number.isFinite(freight) || freight < 0) {
    MessagePlugin.error('请输入有效的运费（单位：元）');
    return;
  }
  if (!Number.isFinite(days) || days <= 0) {
    MessagePlugin.error('请输入有效的制作周期');
    return;
  }
  submitting.value = true;
  try {
    await customizationRequestApi.createQuote(current.id, {
      amountCents: Math.round(amount * 100),
      freightCents: Math.round(freight * 100),
      productionDays: Math.round(days),
      validUntil: quoteForm.validUntil || null,
      note: quoteForm.note.trim() || null,
    });
    MessagePlugin.success('报价已创建');
    quoteVisible.value = false;
    await openDetail(current);
    await load();
  } catch (error) {
    MessagePlugin.error(toErrorMessage(error, '创建报价失败'));
  } finally {
    submitting.value = false;
  }
}

async function handleWithdrawQuote(quote: QuoteDto): Promise<void> {
  const current = detail.value;
  if (!current) {
    return;
  }
  try {
    await quoteApi.withdraw(quote.id);
    MessagePlugin.success('报价已撤回');
    await openDetail(current);
    await load();
  } catch (error) {
    MessagePlugin.error(toErrorMessage(error, '撤回报价失败'));
  }
}

/** 能否撤回报价：顾客尚未确认时才允许收回重报（与服务端守卫一致） */
const canWithdrawQuote = computed(
  () =>
    detail.value !== null &&
    (detail.value.status === RequestStatus.PENDING_REVIEW ||
      detail.value.status === RequestStatus.PENDING_QUOTE ||
      detail.value.status === RequestStatus.QUOTED),
);

/** 是否可以「退回重新报价」：已报价或已确认的申请 */
const canReQuote = computed(
  () =>
    detail.value !== null &&
    (detail.value.status === RequestStatus.QUOTED ||
      detail.value.status === RequestStatus.CONFIRMED),
);

/** 退回重新报价：把申请打回待报价，店员可再创建一个报价版本 */
async function handleReQuote(): Promise<void> {
  const current = detail.value;
  if (!current) {
    return;
  }
  try {
    await customizationRequestApi.changeStatus(
      current.id,
      RequestStatus.PENDING_QUOTE,
      '退回重新报价',
    );
    MessagePlugin.success('已退回待报价，可重新创建报价');
    await openDetail(current);
    await load();
  } catch (error) {
    MessagePlugin.error(toErrorMessage(error, '退回失败'));
  }
}

async function handleCreateOrder(): Promise<void> {
  const current = detail.value;
  if (!current || !current.activeQuote) {
    MessagePlugin.error('当前没有可用于生成订单的有效报价');
    return;
  }
  try {
    const order = await orderApi.create({
      requestId: current.id,
      quoteId: current.activeQuote.id,
    });
    MessagePlugin.success(`订单已创建：${order.orderNo}`);
    await openDetail(current);
    await load();
  } catch (error) {
    MessagePlugin.error(toErrorMessage(error, '创建订单失败'));
  }
}

onMounted(load);
</script>

<style scoped>
.detail-drawer-body {
  padding-bottom: 24px;
}
</style>
