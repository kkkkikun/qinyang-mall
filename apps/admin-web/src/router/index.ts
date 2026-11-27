import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router';
import { MessagePlugin } from 'tdesign-vue-next';
import { useAuthStore } from '../stores/auth';
import { pinia } from '../stores';

declare module 'vue-router' {
  interface RouteMeta {
    title?: string;
    /** 需要登录 */
    requiresAuth?: boolean;
    /** 仅店主可访问 */
    ownerOnly?: boolean;
  }
}

const routes: RouteRecordRaw[] = [
  {
    path: '/login',
    name: 'login',
    component: () => import('../views/LoginView.vue'),
    meta: { title: '登录' },
  },
  {
    path: '/',
    component: () => import('../views/AppLayout.vue'),
    meta: { requiresAuth: true },
    children: [
      { path: '', redirect: '/dashboard' },
      {
        path: 'dashboard',
        name: 'dashboard',
        component: () => import('../views/DashboardView.vue'),
        meta: { title: '工作台' },
      },
      {
        path: 'products',
        name: 'products',
        component: () => import('../views/ProductListView.vue'),
        meta: { title: '商品管理' },
      },
      {
        path: 'categories',
        name: 'categories',
        component: () => import('../views/CategoryView.vue'),
        meta: { title: '分类管理' },
      },
      {
        path: 'banners',
        name: 'banners',
        component: () => import('../views/BannerView.vue'),
        meta: { title: '首页轮播' },
      },
      {
        path: 'requests',
        name: 'requests',
        component: () => import('../views/RequestListView.vue'),
        meta: { title: '定制申请' },
      },
      {
        path: 'orders',
        name: 'orders',
        component: () => import('../views/OrderListView.vue'),
        meta: { title: '订单管理' },
      },
      {
        path: 'guides',
        name: 'guides',
        component: () => import('../views/GuideView.vue'),
        meta: { title: '图文说明' },
      },
      {
        path: 'templates',
        name: 'templates',
        component: () => import('../views/TemplateListView.vue'),
        meta: { title: '量体模板' },
      },
      {
        path: 'audit-logs',
        name: 'audit-logs',
        component: () => import('../views/AuditLogView.vue'),
        meta: { title: '审计日志', ownerOnly: true },
      },
    ],
  },
  { path: '/:pathMatch(.*)*', redirect: '/dashboard' },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

router.beforeEach((to) => {
  const auth = useAuthStore(pinia);
  if (to.meta.requiresAuth && !auth.isLoggedIn) {
    return { path: '/login', query: { redirect: to.fullPath } };
  }
  if (to.path === '/login' && auth.isLoggedIn) {
    return { path: '/dashboard' };
  }
  if (to.meta.ownerOnly && !auth.isOwner) {
    MessagePlugin.warning('该功能仅店主可用');
    return { path: '/dashboard' };
  }
  return true;
});

export default router;
