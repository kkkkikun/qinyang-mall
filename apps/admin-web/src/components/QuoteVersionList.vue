<template>
  <div>
    <div v-if="!quotes.length" class="empty-text">暂无报价记录</div>

    <div
      v-for="quote in sortedQuotes"
      :key="quote.id"
      class="quote-item"
      :class="{ 'is-active': quote.status === QuoteStatus.ACTIVE }"
    >
      <div class="quote-head">
        <strong>报价 v{{ quote.version }}</strong>
        <t-tag :theme="quoteStatusTheme(quote.status)" variant="light">
          {{ QUOTE_STATUS_LABELS[quote.status] }}
        </t-tag>
        <span class="text-gold">合计 {{ formatYuan(quote.totalCents) }}</span>
        <span class="page-toolbar-spacer"></span>
        <t-button
          v-if="showWithdraw && quote.status === QuoteStatus.ACTIVE"
          theme="default"
          size="small"
          @click="emit('withdraw', quote)"
        >
          撤回
        </t-button>
      </div>

      <div class="quote-meta">
        <span>货款 {{ formatYuan(quote.amountCents) }}</span>
        <span>运费 {{ formatYuan(quote.freightCents) }}</span>
        <span>制作周期 {{ quote.productionDays }} 天</span>
        <span>有效期 {{ quote.validUntil ? formatDate(quote.validUntil) : '未设置' }}</span>
        <span>创建人 {{ quote.createdByName }}</span>
        <span>创建时间 {{ formatDateTime(quote.createdAt) }}</span>
        <span v-if="quote.confirmedAt">顾客确认 {{ formatDateTime(quote.confirmedAt) }}</span>
      </div>

      <div v-if="quote.note" class="muted" style="margin-top: 6px">报价说明：{{ quote.note }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { QuoteStatus, type QuoteDto } from '@qinyang/contracts';
import { formatDate, formatDateTime, formatYuan } from '../utils/format';
import { QUOTE_STATUS_LABELS, quoteStatusTheme } from '../utils/status';

const props = withDefaults(
  defineProps<{ quotes: QuoteDto[]; showWithdraw?: boolean }>(),
  { showWithdraw: false },
);

const emit = defineEmits<{ (event: 'withdraw', quote: QuoteDto): void }>();

/** 版本倒序，最新在前 */
const sortedQuotes = computed(() => [...props.quotes].sort((a, b) => b.version - a.version));
</script>
