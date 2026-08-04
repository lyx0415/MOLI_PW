// =============================================
// Vue Router 路由配置
// =============================================
import { createRouter, createWebHistory } from 'vue-router';

const routes = [
  {
    path: '/',
    redirect: '/players',
  },
  {
    path: '/apply',
    name: 'Apply',
    component: () => import('../views/Apply.vue'),
    meta: { title: '申请入职' },
  },
  {
    path: '/admin',
    name: 'Admin',
    component: () => import('../views/Admin.vue'),
    meta: { title: '后台管理' },
  },
  {
    path: '/players',
    name: 'Players',
    component: () => import('../views/Players.vue'),
    meta: { title: '茉莉陪玩 · 精英阵容' },
  },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

export default router;
