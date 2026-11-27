<template>
  <div>
    <div class="stat-grid">
      <div class="stat-card">
        <t-statistic :value="stats.pendingReview" title="待审核申请" />
      </div>
      <div class="stat-card">
        <t-statistic :value="stats.pendingQuote" title="待报价申请" />
      </div>
      <div class="stat-card">
        <t-statistic :value="stats.quoted" title="待顾客确认报价" />
      </div>
      <div class="stat-card">
        <t-statistic :value="stats.inProduction" title="制作中订单" />
      </div>
      <div class="stat-card">
        <t-statistic :value="stats.publishedProducts" title="已发布商品" />
      </div>
      <div class="stat-card">
        <t-statistic :value="stats.draftProducts" title="草稿商品" />
      </div>
      <div class="stat-card">
        <t-statistic :value="stats.activeBanners" title="在投轮播" />
      </div>
      <div class="stat-card">
        <t-statistic :value="stats.pendingReview + stats.pendingQuote" title="待处理申请合计" />
      </div>
    </div>

    <div class="dashboard-grid">
      <div class="page-block">
        <div class="section-title">待审核申请</div>
        <div v-if="!pendingReviewList.length" class="empty-text">暂无待审核申请</div>
        <div v-for="item in pendingReviewList" :key="item.id" class="todo-item">
          <span>{{ item.requestNo }} · {{ item.productName }}</span>
          <t-button theme="default" size="small" @click="goRequests">处理</t-button>
        </div>
      </div>

      <div class="page-block">
        <div class="section-title">待报价申请</div>
        <div v-if="!pendingQuoteList.length" class="empty-text">暂无待报价申请</div>
        <div v-for="item in pendingQuoteList" :key="item.id" class="todo-item">
          <span>{{ item.requestNo }} · {{ item.productName }}</span>
          <t-button theme="default" size="small" @click="goRequests">报价</t-button>
        </div>
      </div>

      <div class="page-block">
        <div class="section-title">制作中订单</div>
        <div v-if="!productionOrders.length" class="empty-text">暂无制作中订单</div>
        <div v-for="item in productionOrders" :key="item.id" class="todo-item">
          <span>{{ item.orderNo }} · {{ item.productSnapshot.name }}</span>
          <t-button theme="default" size="small" @click="goOrders">查看</t-button>
        </div>
      </div>
    </div>

    <div class="page-block mt-16">
      <div class="section-title">说明</div>
      <ul style="margin: 0; padding-left: 20px; color: var(--qy-text-2); line-height: 1.9">
        <li>仅按量体报价的商品不保存价格，顾客端显示「待报价」，需在定制申请中报价后确定金额。</li>
        <li>报价每次调整都会生成新版本，历史版本在申请详情中可查。</li>
        <li>「在投轮播」按顾客端口径统计：状态为启用**且**处于投放期内，与顾客首页实际看到的数量一致。</li>
        <li>V1 未启用线上收款：申请、报价、订单均线下沟通确认，后台不提供收款相关操作与状态。</li>
        <li>关键操作（报价、订单状态、商品上下架、分类删除）由系统写入审计日志，仅店主可查看。</li>
      </ul>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { MessagePlugin } from 'tdesign-vue-next';
import {
  OrderStatus,
  ProductStatus,
  RequestStatus,
  type BannerDto,
  type CustomizationRequestListItemDto,
  type OrderListItemDto,
} from '@qinyang/contracts';
import { bannerApi, customizationRequestApi, orderApi, productApi } from '../api/admin';
import { toErrorMessage } from '../api/http';

const router = useRouter();

const stats = reactive({
  pendingReview: 0,
  pendingQuote: 0,
  quoted: 0,
  inProduction: 0,
  publishedProducts: 0,
  draftProducts: 0,
  activeBanners: 0,
});

const pendingReviewList = ref<CustomizationRequestListItemDto[]>([]);
const pendingQuoteList = ref<CustomizationRequestListItemDto[]>([]);
const productionOrders = ref<OrderListItemDto[]>([]);

/**
 * 轮播是否对顾客端可见。
 *
 * 口径必须与顾客端一致：`banners.service.ts` 的 listActive() 会同时按
 * `status = ACTIVE` 与投放期（startAt / endAt）过滤。后台原先只数 status，
 * 数字会大于顾客首页实际轮播数。
 */
function isBannerInDeliveryWindow(item: BannerDto): boolean {
  if (item.status !== 'ACTIVE') {
    return false;
  }
  const now = Date.now();
  const start = item.startAt ? new Date(item.startAt).getTime() : Number.NaN;
  const end = item.endAt ? new Date(item.endAt).getTime() : Number.NaN;
  if (Number.isFinite(start) && start > now) {
    return false;
  }
  if (Number.isFinite(end) && end < now) {
    return false;
  }
  return true;
}

function goRequests(): void {
  void router.push('/requests');
}

function goOrders(): void {
  void router.push('/orders');
}

onMounted(async () => {
  try {
    const [pendingReview, pendingQuote, quoted, inProduction, published, draft, banners] =
      await Promise.all([
        customizationRequestApi.list({ status: RequestStatus.PENDING_REVIEW, page: 1, pageSize: 5 }),
        customizationRequestApi.list({ status: RequestStatus.PENDING_QUOTE, page: 1, pageSize: 5 }),
        customizationRequestApi.list({ status: RequestStatus.QUOTED, page: 1, pageSize: 1 }),
        orderApi.list({ status: OrderStatus.IN_PRODUCTION, page: 1, pageSize: 5 }),
        productApi.list({ status: ProductStatus.PUBLISHED, page: 1, pageSize: 1 }),
        productApi.list({ status: ProductStatus.DRAFT, page: 1, pageSize: 1 }),
        bannerApi.list(),
      ]);

    stats.pendingReview = pendingReview.total;
    stats.pendingQuote = pendingQuote.total;
    stats.quoted = quoted.total;
    stats.inProduction = inProduction.total;
    stats.publishedProducts = published.total;
    stats.draftProducts = draft.total;
    stats.activeBanners = banners.filter(isBannerInDeliveryWindow).length;

    pendingReviewList.value = pendingReview.items;
    pendingQuoteList.value = pendingQuote.items;
    productionOrders.value = inProduction.items;
  } catch (error) {
    MessagePlugin.error(toErrorMessage(error, '工作台数据加载失败'));
  }
});
</script>
