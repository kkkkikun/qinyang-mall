<template>
  <t-drawer
    :visible="props.visible"
    header="批量导入商品"
    size="760px"
    :footer="false"
    @update:visible="handleVisibleChange"
    @close="handleClose"
  >
    <div class="import-panel">
      <ol class="import-steps">
        <li>下载模板，用 Excel 填好商品资料</li>
        <li>选择 CSV 文件（自动识别 UTF-8 / GBK 编码）</li>
        <li>先「预检」看哪些行有问题，确认无误再「正式导入」</li>
      </ol>

      <div class="import-actions">
        <t-button theme="default" size="small" @click="handleDownloadTemplate">
          下载导入模板
        </t-button>
        <t-button theme="default" size="small" :loading="reading" @click="pickFile">
          选择 CSV 文件
        </t-button>
        <input
          ref="fileInput"
          class="import-file"
          type="file"
          accept=".csv,text/csv,text/plain"
          @change="handleFileChange"
        />
        <span v-if="fileName" class="muted">{{ fileName }} · {{ dataRowCount }} 行数据</span>
      </div>

      <div class="import-actions">
        <t-button
          theme="default"
          size="small"
          :loading="loading"
          :disabled="!csvText"
          @click="handlePreview"
        >
          预检（不落库）
        </t-button>
        <t-popconfirm
          content="确认正式导入？已存在的商品编号会被跳过，导入的商品一律为「草稿」，上架仍需店主审核。"
          theme="warning"
          @confirm="handleImport"
        >
          <t-button theme="primary" size="small" :loading="loading" :disabled="!csvText">
            正式导入
          </t-button>
        </t-popconfirm>
      </div>

      <t-alert
        v-if="summary"
        class="mt-12"
        :theme="summaryTheme"
        :message="summary"
        :close="false"
      />

      <div v-if="result" class="mt-12">
        <div class="section-title">导入结果</div>
        <t-table
          row-key="row"
          :data="resultRows"
          :columns="columns"
          :bordered="false"
          :empty="emptyHint('暂无结果', '选择 CSV 文件并执行预检或导入')"
        />
      </div>
    </div>
  </t-drawer>
</template>

<script setup lang="ts">
import { computed, h, ref } from 'vue';
import { MessagePlugin, Tag } from 'tdesign-vue-next';
import type { ProductImportResult, ProductImportRowResult } from '@qinyang/contracts';
import { productApi } from '../api/admin';
import { toErrorMessage } from '../api/http';
import { buildImportTemplateCsv, countCsvRows, readCsvFile } from '../utils/csv';
import { downloadCsv } from '../utils/download';
import { cell, emptyHint, toTableData } from '../utils/table';

/**
 * 商品 CSV 批量导入面板。
 *
 * 与后端约定的口径：
 * - 只新增不覆盖（编号已存在 → 跳过并给出原因）；
 * - 导入商品一律草稿，上架走店主审核；
 * - 预检（dryRun）只校验不落库。
 *
 * 面板本身不假设任何商品资料 —— 正式名称 / 价格 / 材质只能由商家在 CSV 里提供。
 */
const props = defineProps<{ visible: boolean }>();
const emit = defineEmits<{
  (event: 'update:visible', value: boolean): void;
  (event: 'imported'): void;
}>();

function handleVisibleChange(value: boolean): void {
  emit('update:visible', value);
}

const fileInput = ref<HTMLInputElement | null>(null);
const fileName = ref('');
const csvText = ref('');
const reading = ref(false);
const loading = ref(false);
const result = ref<ProductImportResult | null>(null);

const dataRowCount = computed(() => countCsvRows(csvText.value));

const resultRows = computed(() => toTableData(result.value?.rows ?? []));

const STATUS_META: Record<
  ProductImportRowResult['status'],
  { label: string; theme: 'success' | 'warning' | 'danger' | 'default' }
> = {
  CREATED: { label: '已创建', theme: 'success' },
  PENDING: { label: '待导入', theme: 'warning' },
  SKIPPED: { label: '已跳过', theme: 'default' },
  FAILED: { label: '失败', theme: 'danger' },
};

const columns = [
  { colKey: 'row', title: '行号', width: 70 },
  { colKey: 'code', title: '商品编号', width: 140 },
  { colKey: 'name', title: '商品名称', width: 160 },
  {
    colKey: 'status',
    title: '结果',
    width: 100,
    cell: cell<ProductImportRowResult>((row) =>
      h(
        Tag,
        { theme: STATUS_META[row.status].theme, variant: 'light' },
        () => STATUS_META[row.status].label,
      ),
    ),
  },
  {
    colKey: 'reason',
    title: '说明',
    width: 320,
    cell: cell<ProductImportRowResult>((row) =>
      row.reason
        ? h('span', { class: 'text-red' }, row.reason)
        : h('span', { class: 'muted' }, '—'),
    ),
  },
];

const summary = computed(() => {
  const data = result.value;
  if (!data) return '';
  const parts = [`共 ${data.total} 行`];
  if (data.dryRun) {
    parts.push(`校验通过 ${data.pending} 行`);
  } else {
    parts.push(`成功创建 ${data.created} 件`);
  }
  if (data.skipped > 0) parts.push(`跳过 ${data.skipped} 行`);
  if (data.failed > 0) parts.push(`失败 ${data.failed} 行`);
  return parts.join('，');
});

const summaryTheme = computed<'success' | 'warning' | 'error' | 'info'>(() => {
  const data = result.value;
  if (!data) return 'info';
  if (data.failed > 0) return 'warning';
  if (!data.dryRun && data.created > 0) return 'success';
  return 'info';
});

function pickFile(): void {
  fileInput.value?.click();
}

async function handleFileChange(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  reading.value = true;
  try {
    csvText.value = await readCsvFile(file);
    fileName.value = file.name;
    result.value = null;
    if (!csvText.value.trim()) {
      MessagePlugin.error('文件内容为空');
    }
  } catch (error) {
    MessagePlugin.error(toErrorMessage(error, '文件读取失败'));
  } finally {
    reading.value = false;
    // 允许重新选择同一个文件
    input.value = '';
  }
}

function handleDownloadTemplate(): void {
  const text = buildImportTemplateCsv();
  const ok = downloadCsv(text, '商品导入模板.csv');
  if (!ok) {
    MessagePlugin.info('当前环境不支持下载，模板内容如下：\n' + text);
  }
}

async function run(dryRun: boolean): Promise<void> {
  if (!csvText.value) {
    MessagePlugin.error('请先选择 CSV 文件');
    return;
  }
  loading.value = true;
  try {
    const data = await productApi.importProducts({ csv: csvText.value, dryRun });
    result.value = data;
    if (dryRun) {
      MessagePlugin.info(
        data.failed > 0
          ? `预检完成：${data.failed} 行有问题，请修正后再导入`
          : '预检完成，未发现数据问题',
      );
    } else {
      MessagePlugin.success(
        `导入完成：创建 ${data.created} 件，跳过 ${data.skipped} 行，失败 ${data.failed} 行`,
      );
      emit('imported');
    }
  } catch (error) {
    MessagePlugin.error(toErrorMessage(error, dryRun ? '预检失败' : '导入失败'));
  } finally {
    loading.value = false;
  }
}

function handlePreview(): Promise<void> {
  return run(true);
}

function handleImport(): Promise<void> {
  return run(false);
}

function handleClose(): void {
  csvText.value = '';
  fileName.value = '';
  result.value = null;
}
</script>

<style scoped>
.import-panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.import-steps {
  margin: 0;
  padding-left: 20px;
  color: var(--qy-text-2, #666);
  font-size: var(--qy-font-sm, 13px);
  line-height: 1.9;
}

.import-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.import-file {
  display: none;
}
</style>
