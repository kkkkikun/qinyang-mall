<template>
  <div>
    <div class="page-block">
      <div class="page-toolbar">
        <t-input
          v-model="filters.keyword"
          placeholder="按编号 / 名称搜索"
          style="width: 240px"
          clearable
          @enter="handleSearch"
        />
        <t-select
          v-model="filters.categoryId"
          placeholder="全部分类"
          style="width: 180px"
          clearable
          :options="categoryOptions"
        />
        <t-select
          v-model="filters.status"
          placeholder="全部状态"
          style="width: 150px"
          clearable
          :options="statusOptions"
        />
        <t-select
          v-model="filters.pricingMode"
          placeholder="全部报价模式"
          style="width: 170px"
          clearable
          :options="pricingOptions"
        />
        <t-button theme="primary" @click="handleSearch">查询</t-button>
        <t-button theme="default" @click="handleReset">重置</t-button>
        <div class="page-toolbar-actions">
          <template v-if="can('product.status')">
            <span v-if="selectedIds.length > 0" class="muted">已选 {{ selectedIds.length }} 件</span>
            <t-popconfirm
              content="确认将所选商品批量提交审核？草稿商品需先提交审核才能上架。"
              theme="warning"
              @confirm="handleBatchStatus(ProductStatus.PENDING_REVIEW)"
            >
              <t-button theme="default" size="small" :disabled="selectedIds.length === 0">
                批量提交审核
              </t-button>
            </t-popconfirm>
            <t-popconfirm
              content="确认将所选商品批量下架？下架后顾客端立即看不到这些商品。"
              theme="warning"
              @confirm="handleBatchStatus(ProductStatus.OFFLINE)"
            >
              <t-button theme="default" size="small" :disabled="selectedIds.length === 0">
                批量下架
              </t-button>
            </t-popconfirm>
            <t-popconfirm
              content="确认将所选商品批量上架？上架后顾客端立即可见。"
              theme="warning"
              @confirm="handleBatchStatus(ProductStatus.PUBLISHED)"
            >
              <t-button theme="default" size="small" :disabled="selectedIds.length === 0">
                批量上架
              </t-button>
            </t-popconfirm>
          </template>
          <t-button v-if="can('product.create')" theme="primary" @click="openCreate">
            新增商品
          </t-button>
          <t-button
            v-if="can('product.import')"
            theme="default"
            @click="importVisible = true"
          >
            批量导入
          </t-button>
        </div>
      </div>

      <t-table
        row-key="id"
        :data="tableData"
        :columns="columns"
        :loading="loading"
                :empty="emptyHint('没有匹配的商品', '换个关键词或清空筛选条件试试')"
        :pagination="pagination"
        :bordered="false"
        :selected-row-keys="selectedIds"
        :row-selectable="() => can('product.status')"
        @select-change="handleSelectChange"
        @page-change="handlePageChange"
      />
    </div>

    <t-drawer
      v-model:visible="drawerVisible"
      :header="drawerTitle"
      size="720px"
      :footer="false"
      @close="handleDrawerClose"
    >
      <t-tabs v-model="drawerTab">
        <t-tab-panel value="base" label="基本信息">
          <t-form :data="form" :rules="rules" label-align="top">
            <div class="form-grid">
              <t-form-item label="商品编号" name="code">
                <t-input v-model="form.code" placeholder="如 QY-TS-001" />
              </t-form-item>
              <t-form-item label="商品名称" name="name">
                <t-input v-model="form.name" placeholder="如 圆领羊绒衫" />
              </t-form-item>
              <t-form-item label="副标题" name="subtitle">
                <t-input v-model="form.subtitle" placeholder="选填" />
              </t-form-item>
              <t-form-item label="所属分类" name="categoryId">
                <t-select v-model="form.categoryId" :options="categoryOptions" placeholder="请选择分类" />
              </t-form-item>
              <t-form-item label="报价模式" name="pricingMode">
                <t-select v-model="form.pricingMode" :options="pricingOptions" />
              </t-form-item>
              <t-form-item v-if="form.pricingMode === PricingMode.FIXED_PRICE" label="固定价（元）" name="priceYuan">
                <t-input v-model="form.priceYuan" placeholder="单位：元，保存后按整数分存储" />
              </t-form-item>
              <t-form-item label="材质" name="material">
                <t-input v-model="form.material" placeholder="如 100% 山羊绒" />
              </t-form-item>
              <t-form-item label="关联量体模板" name="measurementTemplateId">
                <t-select
                  v-model="form.measurementTemplateId"
                  :options="templateOptions"
                  placeholder="选填"
                  clearable
                />
              </t-form-item>
              <t-form-item label="排序值" name="sortOrder">
                <t-input v-model="form.sortOrder" placeholder="数值越小越靠前" />
              </t-form-item>
              <t-form-item label="洗涤保养" name="careGuide" class="span-2">
                <t-textarea v-model="form.careGuide" placeholder="选填" :rows="2" />
              </t-form-item>
              <t-form-item label="商品详情" name="description" class="span-2">
                <t-textarea v-model="form.description" placeholder="选填" :rows="4" />
              </t-form-item>
            </div>

            <div v-if="detailError" class="text-red form-tip">
              商品详情加载失败，当前表单为空且不能保存。请关闭抽屉后重新打开该商品。
            </div>

            <div class="muted form-tip">
              报价模式为「仅按量体报价」时不保存价格，前台显示「待报价」，需在定制申请中报价。
            </div>

            <t-button theme="primary" :loading="saving" :disabled="detailError" @click="handleSave">
              保存
            </t-button>
            <t-button theme="default" class="ml-8" @click="drawerVisible = false">取消</t-button>
          </t-form>
        </t-tab-panel>

        <t-tab-panel value="media" label="图集管理">
          <ProductMediaPanel
            :product-id="currentProductId"
            :media="detailMedia"
            @changed="reloadDetail"
          />
        </t-tab-panel>
      </t-tabs>
    </t-drawer>

    <ProductImportPanel v-model:visible="importVisible" @imported="handleImported" />
  </div>
</template>

<script setup lang="ts">
import { computed, h, onMounted, reactive, ref, type VNode } from 'vue';
import { Button, MessagePlugin, Popconfirm, Tag } from 'tdesign-vue-next';
import {
  PricingMode,
  ProductStatus,
  PRODUCT_STATUS_LABELS,
  TemplateStatus,
  type CategoryDto,
  type MeasurementTemplateDto,
  type ProductDetail,
  type ProductListItem,
  type ProductUpsertRequest,
} from '@qinyang/contracts';
import { categoryApi, productApi, templateApi } from '../api/admin';
import { ApiError, toErrorMessage } from '../api/http';
import { useAuthStore } from '../stores/auth';
import { hasPermission, type PermissionKey } from '../utils/permissions';
import { formatDateTime, formatYuan, flattenCategories, toNonNegativeInt } from '../utils/format';
import { productStatusTheme } from '../utils/status';
import { cell, emptyHint, toTableData } from '../utils/table';
import ProductMediaPanel from '../components/ProductMediaPanel.vue';
import ProductImportPanel from '../components/ProductImportPanel.vue';

const auth = useAuthStore();

function can(key: PermissionKey): boolean {
  return hasPermission(auth.user?.role, key);
}

/** 批量导入面板显隐 */
const importVisible = ref(false);

/** 导入完成后刷新列表 */
function handleImported(): void {
  page.value = 1;
  void load();
}

/* ------------------------------ 列表 ------------------------------ */

/** 筛选值统一用空串表示「不限」，避免向受控组件传 undefined */
const filters = reactive<{
  keyword: string;
  categoryId: string;
  status: '' | ProductStatus;
  pricingMode: '' | PricingMode;
}>({
  keyword: '',
  categoryId: '',
  status: '',
  pricingMode: '',
});

const rows = ref<ProductListItem[]>([]);
const loading = ref(false);
const page = ref(1);
const pageSize = ref(10);

const categories = ref<CategoryDto[]>([]);
const templates = ref<MeasurementTemplateDto[]>([]);

const categoryOptions = computed(() =>
  flattenCategories(categories.value).map((item) => ({ label: item.name, value: item.id })),
);

const templateOptions = computed(() =>
  templates.value
    .filter((item) => item.status !== TemplateStatus.ARCHIVED)
    .map((item) => ({
      label: `${item.name} v${item.version}`,
      value: item.id,
    })),
);

const statusOptions = Object.values(ProductStatus).map((value) => ({
  label: PRODUCT_STATUS_LABELS[value],
  value,
}));

const pricingOptions = [
  { label: '仅按量体报价', value: PricingMode.QUOTE_ONLY },
  { label: '固定价可直售', value: PricingMode.FIXED_PRICE },
];

const pagination = reactive({ current: 1, pageSize: 10, total: 0 });
const tableData = computed(() => toTableData(rows.value));

interface StatusAction {
  label: string;
  to: ProductStatus;
}

/** 商品状态流转（OWNER 专属执行，后端仍会校验合法性） */
const STATUS_ACTIONS: Record<ProductStatus, StatusAction[]> = {
  [ProductStatus.DRAFT]: [{ label: '提交审核', to: ProductStatus.PENDING_REVIEW }],
  [ProductStatus.PENDING_REVIEW]: [
    { label: '发布', to: ProductStatus.PUBLISHED },
    { label: '退回草稿', to: ProductStatus.DRAFT },
  ],
  [ProductStatus.PUBLISHED]: [{ label: '下架', to: ProductStatus.OFFLINE }],
  [ProductStatus.OFFLINE]: [{ label: '重新上架', to: ProductStatus.PUBLISHED }],
};

const columns = [
  {
    colKey: 'coverUrl',
    title: '主图',
    width: 80,
    cell: cell<ProductListItem>((row) =>
      row.coverUrl
        ? h('img', {
            // 列表用缩略图（600×600）：后台一屏几十行，用详情大图会白白多传几十 MB
            src: row.coverThumbUrl || row.coverUrl,
            alt: row.name,
            style: 'width:48px;height:48px;object-fit:cover;border-radius:4px;',
          })
        : h('span', { class: 'muted' }, '—'),
    ),
  },
  { colKey: 'code', title: '编号', width: 130 },
  { colKey: 'name', title: '名称', width: 200 },
  { colKey: 'categoryName', title: '分类', width: 120 },
  {
    colKey: 'status',
    title: '状态',
    width: 110,
    cell: cell<ProductListItem>((row) =>
      h(Tag, { theme: productStatusTheme(row.status), variant: 'light' }, () =>
        PRODUCT_STATUS_LABELS[row.status],
      ),
    ),
  },
  {
    colKey: 'pricingMode',
    title: '报价模式',
    width: 130,
    cell: cell<ProductListItem>((row) =>
      h(
        Tag,
        { theme: row.pricingMode === PricingMode.FIXED_PRICE ? 'primary' : 'default', variant: 'light' },
        () => (row.pricingMode === PricingMode.FIXED_PRICE ? '固定价可直售' : '仅按量体报价'),
      ),
    ),
  },
  {
    colKey: 'priceCents',
    title: '价格',
    width: 130,
    cell: cell<ProductListItem>((row) => {
      if (row.priceCents === null) {
        return h(
          Tag,
          { theme: 'warning', variant: 'light' },
          () => (row.pricingMode === PricingMode.QUOTE_ONLY ? '待报价' : '未设置价格'),
        );
      }
      return h('span', { class: 'text-gold' }, formatYuan(row.priceCents));
    }),
  },
  {
    colKey: 'updatedAt',
    title: '更新时间',
    width: 170,
    cell: cell<ProductListItem>((row) => h('span', null, formatDateTime(row.updatedAt))),
  },
  {
    colKey: 'operation',
    title: '操作',
    width: 260,
    cell: cell<ProductListItem>((row) => {
      const actions: VNode[] = [];
      actions.push(
        h(
          Button,
          { theme: 'default', size: 'small', onClick: () => openEdit(row) },
          () => '编辑',
        ),
      );
      if (can('product.status')) {
        STATUS_ACTIONS[row.status].forEach((action) => {
          const button = h(
            Button,
            {
              theme: 'default',
              size: 'small',
            },
            () => action.label,
          );
          // 下架与退回草稿会让顾客立刻看不到这款商品，属于破坏性操作，
          // 此前点一下就直接落库，误点无法挽回。
          if (DESTRUCTIVE_STATUS.includes(action.to)) {
            actions.push(
              h(
                Popconfirm,
                {
                  content: `确认将「${row.name}」${action.label}？${action.to === ProductStatus.OFFLINE ? '顾客端将不再展示该商品。' : ''}`,
                  theme: 'warning',
                  onConfirm: () => handleStatusChange(row, action.to),
                },
                { default: () => button },
              ),
            );
          } else {
            actions.push(
              h(
                Button,
                {
                  theme: 'default',
                  size: 'small',
                  onClick: () => handleStatusChange(row, action.to),
                },
                () => action.label,
              ),
            );
          }
        });
      }
      /*
       * 删除入口只对店主开放（服务端同样限制为 OWNER）。
       *
       * 服务端的删除口径：已发布商品要先下架；被定制申请引用过的商品不能删
       * （申请、报价、订单都指向它，删掉后历史单据就断了线）。
       * 这两条限制会在点击时以 409 的原文告诉商家。
       */
      if (can('product.delete') && row.status !== ProductStatus.PUBLISHED) {
        actions.push(
          h(
            Popconfirm,
            {
              content:
                '删除后不可恢复。若该商品已被定制申请引用，系统会拒绝删除并说明原因。确认删除？',
              theme: 'danger',
              onConfirm: () => handleRemove(row),
            },
            { default: () => h(Button, { theme: 'danger', size: 'small' }, () => '删除') },
          ),
        );
      }
      return h('div', { style: 'display:flex; gap:6px; flex-wrap:wrap;' }, actions);
    }),
  },
];

async function load(): Promise<void> {
  loading.value = true;
  try {
    const result = await productApi.list({
      keyword: filters.keyword.trim() || undefined,
      categoryId: filters.categoryId || undefined,
      status: filters.status === '' ? undefined : filters.status,
      pricingMode: filters.pricingMode === '' ? undefined : filters.pricingMode,
      page: page.value,
      pageSize: pageSize.value,
    });
    rows.value = result.items;
    pagination.current = result.page;
    pagination.pageSize = result.pageSize;
    pagination.total = result.total;
  } catch (error) {
    MessagePlugin.error(toErrorMessage(error, '商品列表加载失败'));
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
  filters.categoryId = '';
  filters.status = '';
  filters.pricingMode = '';
  page.value = 1;
  void load();
}

/** t-table 的 page-change 事件参数为 PageInfo（current / previous / pageSize） */
function handlePageChange(pageInfo: { current: number; pageSize: number }): void {
  page.value = pageInfo.current;
  pageSize.value = pageInfo.pageSize;
  void load();
}

/** 需要二次确认的状态变更（会让顾客端看不到这款商品） */
const DESTRUCTIVE_STATUS: ProductStatus[] = [ProductStatus.OFFLINE, ProductStatus.DRAFT];

/** 批量操作选中的商品 id（仅店主可上下架） */
const selectedIds = ref<string[]>([]);

function handleSelectChange(keys: (string | number)[]): void {
  selectedIds.value = keys.map((key) => String(key));
}

/**
 * 批量上下架。
 *
 * 单条失败不影响其余（后端逐条返回原因），这里把失败原因一并提示出来，
 * 商家不会遇到「批量操作后不知道哪几件没成功」的情况。
 */
async function handleBatchStatus(next: ProductStatus): Promise<void> {
  const ids = [...selectedIds.value];
  if (ids.length === 0) {
    return;
  }
  try {
    const result = await productApi.batchUpdateStatus(ids, next);
    if (result.skipped.length > 0) {
      MessagePlugin.warning(
        `已更新 ${result.updated} 件，${result.skipped.length} 件未成功：${result.skipped[0].reason}`,
      );
    } else {
      MessagePlugin.success(`已批量更新 ${result.updated} 件商品`);
    }
    selectedIds.value = [];
    await load();
  } catch (error) {
    MessagePlugin.error(toErrorMessage(error, '批量操作失败'));
  }
}

async function handleStatusChange(row: ProductListItem, next: ProductStatus): Promise<void> {
  try {
    await productApi.updateStatus(row.id, next);
    MessagePlugin.success(`已更新为「${PRODUCT_STATUS_LABELS[next]}」`);
    await load();
  } catch (error) {
    MessagePlugin.error(toErrorMessage(error, '状态更新失败'));
  }
}

/**
 * 删除商品。
 *
 * 服务端会拒绝删除「已发布」与「已被定制申请引用」的商品（409），
 * 并在消息里说清楚原因 —— 这里直接把服务端的话透给商家。
 */
async function handleRemove(row: ProductListItem): Promise<void> {
  try {
    await productApi.remove(row.id);
    MessagePlugin.success('已删除');
    await load();
  } catch (error) {
    MessagePlugin.error(toErrorMessage(error, '删除失败'));
  }
}

/* ------------------------------ 编辑抽屉 ------------------------------ */

interface ProductFormModel {
  code: string;
  name: string;
  subtitle: string;
  categoryId: string;
  pricingMode: PricingMode;
  priceYuan: string;
  material: string;
  description: string;
  careGuide: string;
  measurementTemplateId: string;
  sortOrder: string;
}

const drawerVisible = ref(false);
const drawerTab = ref('base');
const saving = ref(false);
const editingId = ref<string>('');
const detailMedia = ref<ProductDetail['media']>([]);
const currentProductId = computed(() => editingId.value || null);

const drawerTitle = computed(() => (editingId.value ? '编辑商品' : '新增商品'));

const form = reactive<ProductFormModel>({
  code: '',
  name: '',
  subtitle: '',
  categoryId: '',
  pricingMode: PricingMode.QUOTE_ONLY,
  priceYuan: '',
  material: '',
  description: '',
  careGuide: '',
  measurementTemplateId: '',
  sortOrder: '0',
});

const rules = {
  code: [{ required: true, message: '请输入商品编号' }],
  name: [{ required: true, message: '请输入商品名称' }],
  categoryId: [{ required: true, message: '请选择所属分类' }],
};

function resetForm(): void {
  form.code = '';
  form.name = '';
  form.subtitle = '';
  form.categoryId = categories.value[0]?.id ?? '';
  form.pricingMode = PricingMode.QUOTE_ONLY;
  form.priceYuan = '';
  form.material = '';
  form.description = '';
  form.careGuide = '';
  form.measurementTemplateId = '';
  form.sortOrder = '0';
}

function openCreate(): void {
  editingId.value = '';
  detailMedia.value = [];
  drawerTab.value = 'base';
  resetForm();
  drawerVisible.value = true;
}

async function openEdit(row: ProductListItem): Promise<void> {
  // 先回到「新建态」：否则上一件商品的表单内容会留在抽屉里，
  // 一旦本次详情加载失败，商家看到的就是「A 的编号 + B 的标题」。
  resetForm();
  resetDetailState();
  drawerTab.value = 'base';
  drawerVisible.value = true;
  editingId.value = row.id;
  await reloadDetail();
  const detail = detailCache.value;
  if (!detail) {
    // 详情加载失败：表单保持空白且保存被禁用，绝不让旧数据留在抽屉里
    return;
  }
  form.code = detail.code;
  form.name = detail.name;
  form.subtitle = detail.subtitle ?? '';
  form.categoryId = detail.categoryId;
  form.pricingMode = detail.pricingMode;
  form.priceYuan = detail.priceCents === null ? '' : String(detail.priceCents / 100);
  form.material = detail.material ?? '';
  form.description = detail.description ?? '';
  form.careGuide = detail.careGuide ?? '';
  form.measurementTemplateId = detail.measurementTemplateId ?? '';
  form.sortOrder = String(detail.sortOrder ?? 0);
  // 记录「这份表单是从哪条详情填出来的」，保存前据此校验（见 handleSave）
  formSource.value = { id: detail.id, code: detail.code, name: detail.name };
  /*
   * 记录「打开抽屉时看到的行版本」（乐观锁）。
   *
   * 商品编辑抽屉用的是**详情**（列表行里没有版本字段），
   * 所以版本取自详情返回的 `version`。
   * 保存时随请求回传：期间别人改过这件商品 → 服务端 409，
   * 而不是用这份陈旧的表单把对方的改动覆盖掉。
   */
  formVersion.value = detail.version;
}

const detailCache = ref<ProductDetail | null>(null);

/** 详情加载失败标记：为 true 时禁止保存（抽屉里可能残留旧数据） */
const detailError = ref(false);

/**
 * 表单来源快照。
 *
 * 记录当前表单是从哪一条详情的哪份数据填出来的。
 * 保存前用它比对「快照 vs 当前详情」：
 * 两者不一致说明详情在表单填好之后被改过（并发修改或陈旧数据），
 * 此时保存会把别人的改动覆盖掉，必须拒绝。
 */
const formSource = ref<{ id: string; code: string; name: string } | null>(null);

/**
 * 打开抽屉时商品详情的行版本（乐观锁）。
 *
 * 与 `formSource` 平行：一个是「表单内容出自哪条详情」，
 * 这个是「那条详情当时的版本号」，保存时原样回传给服务端做比对。
 */
const formVersion = ref<number | null>(null);

/**
 * 清空抽屉里的详情相关状态。
 *
 * 单独抽成函数而不是在调用处直接赋值：
 * 直接给 `detailCache.value = null` 会让 TS 把该属性在整个函数里收窄成 null，
 * 后面读到的详情就变成了 never 类型。
 */
function resetDetailState(): void {
  detailCache.value = null;
  detailMedia.value = [];
  formSource.value = null;
  formVersion.value = null;
  detailError.value = false;
}

async function reloadDetail(): Promise<void> {
  if (!editingId.value) {
    detailMedia.value = [];
    return;
  }
  try {
    const detail = await productApi.detail(editingId.value);
    detailCache.value = detail;
    detailMedia.value = detail.media;
    detailError.value = false;
  } catch (error) {
    // 清空详情缓存：留着旧数据会让商家在失败后仍然能保存（写到错误的商品上）
    detailCache.value = null;
    detailMedia.value = [];
    detailError.value = true;
    MessagePlugin.error(toErrorMessage(error, '商品详情加载失败'));
  }
}

function handleDrawerClose(): void {
  editingId.value = '';
  resetDetailState();
}

async function handleSave(): Promise<void> {
  if (saving.value) {
    return;
  }
  if (editingId.value) {
    // 编辑态：必须有一份属于当前商品的详情，否则表单里可能是上一件商品的数据
    const detail = detailCache.value;
    const source = formSource.value;
    if (!detail || !source) {
      MessagePlugin.error('商品详情未加载成功，请关闭抽屉后重新打开该商品再保存');
      return;
    }
    if (detail.id !== editingId.value || source.id !== editingId.value) {
      MessagePlugin.error('当前表单与商品详情不一致，请关闭抽屉后重新打开该商品再保存');
      return;
    }
    if (source.code !== detail.code || source.name !== detail.name) {
      // 详情在表单填好之后被改过（他人修改或陈旧数据），保存会覆盖掉新值
      MessagePlugin.error('该商品已被修改，请关闭抽屉后重新打开再保存，以免覆盖他人改动');
      return;
    }
  }
  if (!form.code.trim() || !form.name.trim() || !form.categoryId) {
    MessagePlugin.error('请填写商品编号、名称并选择分类');
    return;
  }
  if (form.pricingMode === PricingMode.FIXED_PRICE) {
    const price = Number(form.priceYuan);
    if (!Number.isFinite(price) || price <= 0) {
      MessagePlugin.error('固定价商品请填写有效价格（单位：元）');
      return;
    }
  }

  const payload: ProductUpsertRequest = {
    code: form.code.trim(),
    name: form.name.trim(),
    subtitle: form.subtitle.trim() || null,
    categoryId: form.categoryId,
    pricingMode: form.pricingMode,
    priceCents:
      form.pricingMode === PricingMode.FIXED_PRICE ? Math.round(Number(form.priceYuan) * 100) : null,
    material: form.material.trim() || null,
    description: form.description.trim() || null,
    careGuide: form.careGuide.trim() || null,
    measurementTemplateId: form.measurementTemplateId || null,
    sortOrder: toNonNegativeInt(form.sortOrder),
  };
  // 编辑态带上「打开抽屉时看到的行版本」：期间被人改过就 409，不覆盖对方的改动
  if (editingId.value && formVersion.value !== null) {
    payload.expectedVersion = formVersion.value;
  }

  saving.value = true;
  try {
    if (editingId.value) {
      await productApi.update(editingId.value, payload);
      MessagePlugin.success('商品已更新');
      await reloadDetail();
      // 保存成功后表单与最新详情对齐，重置快照（避免下一次保存被误判为陈旧）
      const refreshed = detailCache.value;
      formSource.value = refreshed
        ? { id: refreshed.id, code: refreshed.code, name: refreshed.name }
        : null;
      // 行版本同步到最新详情：本次保存已经用掉了旧版本，再存一次要用新的
      formVersion.value = refreshed ? refreshed.version : null;
    } else {
      const created = await productApi.create(payload);
      MessagePlugin.success('商品已创建（初始为草稿）');
      editingId.value = created.id;
      await reloadDetail();
      const refreshed = detailCache.value;
      formSource.value = refreshed
        ? { id: refreshed.id, code: refreshed.code, name: refreshed.name }
        : null;
      formVersion.value = refreshed ? refreshed.version : null;
    }
    await load();
  } catch (error) {
    MessagePlugin.error(toSaveErrorMessage(error, '保存失败'));
  } finally {
    saving.value = false;
  }
}

/**
 * 保存失败时的提示文案。
 *
 * 409（行版本对不上 / 已发布商品改价的权限闸门）的服务端文案
 * 本身就是写给商家看的中文，直接透出即可 ——
 * 不要把原始错误码或异常堆栈丢给商家看。
 */
function toSaveErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError && error.isConflict) {
    return error.message || fallback;
  }
  return toErrorMessage(error, fallback);
}

onMounted(async () => {
  try {
    const [categoryTree, templateList] = await Promise.all([categoryApi.list(), templateApi.list()]);
    categories.value = categoryTree;
    templates.value = templateList;
    resetForm();
  } catch (error) {
    MessagePlugin.error(toErrorMessage(error, '基础数据加载失败'));
  }
  await load();
});
</script>
