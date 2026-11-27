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
        <span class="page-toolbar-spacer"></span>
        <t-button v-if="can('product.create')" theme="primary" @click="openCreate">
          新增商品
        </t-button>
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

            <div class="muted" style="margin: 4px 0 16px">
              报价模式为「仅按量体报价」时不保存价格，前台显示「待报价」，需在定制申请中报价。
            </div>

            <t-button theme="primary" :loading="saving" @click="handleSave">保存</t-button>
            <t-button theme="default" style="margin-left: 8px" @click="drawerVisible = false">取消</t-button>
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
import { toErrorMessage } from '../api/http';
import { useAuthStore } from '../stores/auth';
import { hasPermission, type PermissionKey } from '../utils/permissions';
import { formatDateTime, formatYuan, flattenCategories } from '../utils/format';
import { productStatusTheme } from '../utils/status';
import { cell, toTableData } from '../utils/table';
import ProductMediaPanel from '../components/ProductMediaPanel.vue';

const auth = useAuthStore();

function can(key: PermissionKey): boolean {
  return hasPermission(auth.user?.role, key);
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

async function handleStatusChange(row: ProductListItem, next: ProductStatus): Promise<void> {
  try {
    await productApi.updateStatus(row.id, next);
    MessagePlugin.success(`已更新为「${PRODUCT_STATUS_LABELS[next]}」`);
    await load();
  } catch (error) {
    MessagePlugin.error(toErrorMessage(error, '状态更新失败'));
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
  drawerTab.value = 'base';
  drawerVisible.value = true;
  editingId.value = row.id;
  await reloadDetail();
  const detail = detailCache.value;
  if (!detail) {
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
}

const detailCache = ref<ProductDetail | null>(null);

async function reloadDetail(): Promise<void> {
  if (!editingId.value) {
    detailMedia.value = [];
    return;
  }
  try {
    const detail = await productApi.detail(editingId.value);
    detailCache.value = detail;
    detailMedia.value = detail.media;
  } catch (error) {
    MessagePlugin.error(toErrorMessage(error, '商品详情加载失败'));
  }
}

function handleDrawerClose(): void {
  editingId.value = '';
  detailCache.value = null;
  detailMedia.value = [];
}

async function handleSave(): Promise<void> {
  if (saving.value) {
    return;
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
    sortOrder: Number(form.sortOrder) || 0,
  };

  saving.value = true;
  try {
    if (editingId.value) {
      await productApi.update(editingId.value, payload);
      MessagePlugin.success('商品已更新');
      await reloadDetail();
    } else {
      const created = await productApi.create(payload);
      MessagePlugin.success('商品已创建（初始为草稿）');
      editingId.value = created.id;
      await reloadDetail();
    }
    await load();
  } catch (error) {
    MessagePlugin.error(toErrorMessage(error, '保存失败'));
  } finally {
    saving.value = false;
  }
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
