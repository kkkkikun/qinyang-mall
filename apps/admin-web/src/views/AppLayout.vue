<template>
  <t-layout class="app-shell">
    <t-header class="app-header">
      <div class="app-brand">
        <span class="app-brand-cn">琴扬精纺羊绒</span>
        <span class="app-brand-en">QINYANG</span>
      </div>
      <div class="app-header-right">
        <t-tag theme="warning" variant="light">V1 未启用线上收款</t-tag>
        <span class="app-user-name">{{ auth.displayName }}</span>
        <t-tag :theme="auth.isOwner ? 'primary' : 'default'" variant="light">
          {{ auth.roleLabel }}
        </t-tag>
        <t-button theme="default" size="small" @click="handleLogout">退出登录</t-button>
      </div>
    </t-header>

    <t-layout class="app-body">
      <t-aside :width="collapsed ? '64px' : '208px'" class="app-aside">
        <t-menu
          v-model:value="activePath"
          :collapsed="collapsed"
          theme="light"
          @change="handleMenuChange"
        >
          <t-menu-item value="/dashboard">工作台</t-menu-item>
          <t-menu-item value="/products">商品管理</t-menu-item>
          <t-menu-item value="/categories">分类管理</t-menu-item>
          <t-menu-item value="/banners">首页轮播</t-menu-item>
          <t-menu-item value="/guides">图文说明</t-menu-item>
          <t-menu-item value="/requests">定制申请</t-menu-item>
          <t-menu-item value="/orders">订单管理</t-menu-item>
          <t-menu-item value="/templates">量体模板</t-menu-item>
          <t-menu-item v-if="auth.isOwner" value="/audit-logs">审计日志</t-menu-item>
        </t-menu>
      </t-aside>

      <t-content class="app-content">
        <router-view />
      </t-content>
    </t-layout>
  </t-layout>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { MessagePlugin } from 'tdesign-vue-next';
import { useAuthStore } from '../stores/auth';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();

const collapsed = ref(false);
const activePath = ref<string>(route.path);

watch(
  () => route.path,
  (path) => {
    activePath.value = path;
  },
);

function handleMenuChange(value: string | number): void {
  const path = String(value);
  if (path && path !== route.path) {
    void router.push(path);
  }
}

async function handleLogout(): Promise<void> {
  auth.clear();
  MessagePlugin.success('已退出登录');
  await router.push('/login');
}
</script>
