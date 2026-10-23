import { createRouter, createWebHistory } from "vue-router";
import { auth } from "../lib/api.js";
const router = createRouter({
  history: createWebHistory(),
  scrollBehavior(to, from, saved) {
    return saved || { top: 0 };
  },
  routes: [
    {
      path: "/",
      component: () => import("../views/Home.vue"),
      meta: { title: "一起开黑，让快乐发生" },
    },
    {
      path: "/experiences/:category?",
      component: () => import("../views/Experiences.vue"),
      meta: { title: "探索多彩陪伴" },
    },
    {
      path: "/players",
      component: () => import("../views/Players.vue"),
      meta: { title: "发现陪玩" },
    },
    {
      path: "/players/:id",
      component: () => import("../views/ProviderDetail.vue"),
      meta: { title: "陪玩主页" },
    },
    {
      path: "/login",
      component: () => import("../views/Login.vue"),
      meta: { title: "欢迎回来" },
    },
    {
      path: "/apply",
      component: () => import("../views/Apply.vue"),
      meta: { title: "成为陪玩", auth: true },
    },
    {
      path: "/orders",
      component: () => import("../views/Orders.vue"),
      meta: { title: "我的订单", auth: true },
    },
    {
      path: "/orders/:id",
      component: () => import("../views/OrderDetail.vue"),
      meta: { title: "订单详情", auth: true },
    },
    {
      path: "/studio",
      component: () => import("../views/Studio.vue"),
      meta: { title: "陪玩工作台", auth: true, roles: ["provider", "admin"] },
    },
    {
      path: "/admin",
      component: () => import("../views/Admin.vue"),
      meta: { title: "运营管理", auth: true, roles: ["admin"] },
    },
    {
      path: "/support",
      component: () => import("../views/Support.vue"),
      meta: { title: "客服工作台", auth: true, roles: ["support", "admin"] },
    },
    {
      path: "/account",
      component: () => import("../views/Account.vue"),
      meta: { title: "个人中心", auth: true },
    },
    {
      path: "/help",
      component: () => import("../views/Help.vue"),
      meta: { title: "帮助与客服" },
    },
    {
      path: "/legal/:kind",
      component: () => import("../views/Legal.vue"),
      meta: { title: "服务规则" },
    },
    {
      path: "/:pathMatch(.*)*",
      component: () => import("../views/NotFound.vue"),
      meta: { title: "页面不存在" },
    },
  ],
});
router.beforeEach((to) => {
  document.title = (to.meta.title || "茉莉陪玩") + " · 茉莉陪玩";
  if (to.meta.auth && !auth.user)
    return { path: "/login", query: { redirect: to.fullPath } };
  if (to.meta.roles && !to.meta.roles.includes(auth.user?.role))
    return "/account";
});
export default router;
