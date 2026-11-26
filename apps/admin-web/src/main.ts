import { createApp } from 'vue';
import TDesign from 'tdesign-vue-next';
import 'tdesign-vue-next/es/style/index.css';
import './styles/theme.css';
import App from './App.vue';
import router from './router';
import { pinia } from './stores';
import { useAuthStore } from './stores/auth';
import { setUnauthorizedHandler } from './api/http';

const app = createApp(App);

app.use(pinia);
app.use(router);

// 全局注册 TDesign 组件（模板中使用 t-xxx 标签，运行时按注册名解析）
app.use(TDesign);

// 401：清除登录态并回到登录页
setUnauthorizedHandler(() => {
  const auth = useAuthStore(pinia);
  auth.clear();
  if (router.currentRoute.value.path !== '/login') {
    void router.replace({ path: '/login' });
  }
});

app.mount('#app');
