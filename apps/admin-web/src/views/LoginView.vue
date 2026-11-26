<template>
  <div class="login-page">
    <div class="login-card">
      <div class="login-brand">
        <div class="login-brand-cn">琴扬精纺羊绒</div>
        <div class="login-brand-en">QINYANG · 管理工作台</div>
      </div>

      <t-form :data="form" :rules="rules" label-align="top" @submit="handleSubmit">
        <t-form-item label="用户名" name="username">
          <t-input v-model="form.username" placeholder="请输入管理员用户名" autocomplete="username" />
        </t-form-item>
        <t-form-item label="密码" name="password">
          <t-input
            v-model="form.password"
            type="password"
            placeholder="请输入密码"
            autocomplete="current-password"
          />
        </t-form-item>
        <t-button theme="primary" block :loading="loading" @click="handleSubmit">登录</t-button>
      </t-form>

      <div class="login-tip">
        仅店主与店员账号可登录。<br />
        V1 未启用线上收款，报价与订单均线下确认。
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { MessagePlugin } from 'tdesign-vue-next';
import { authApi } from '../api/admin';
import { toErrorMessage } from '../api/http';
import { useAuthStore } from '../stores/auth';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();

const form = reactive({ username: '', password: '' });
const loading = ref(false);

const rules = {
  username: [{ required: true, message: '请输入用户名' }],
  password: [{ required: true, message: '请输入密码' }],
};

async function handleSubmit(): Promise<void> {
  if (loading.value) {
    return;
  }
  if (!form.username.trim() || !form.password) {
    MessagePlugin.error('请输入用户名与密码');
    return;
  }
  loading.value = true;
  try {
    const result = await authApi.login({
      username: form.username.trim(),
      password: form.password,
    });
    auth.setSession(result.token, result.user);
    MessagePlugin.success('登录成功');
    const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/dashboard';
    await router.replace(redirect);
  } catch (error) {
    MessagePlugin.error(toErrorMessage(error, '登录失败'));
  } finally {
    loading.value = false;
  }
}
</script>
