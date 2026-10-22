<script setup>
import { onMounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { Menu, X, ArrowUpRight, UserRound, LogOut } from "lucide-vue-next";
import BrandMark from "./components/BrandMark.vue";
import { auth, ui, logout } from "./lib/api.js";
import { site, loadSite } from "./lib/site.js";
const router = useRouter(),
  menu = ref(false);
onMounted(loadSite);
router.afterEach(() => (menu.value = false));
watch(
  () => auth.user,
  (user) => {
    if (!user && router.currentRoute.value.meta.auth)
      router.replace({
        path: "/login",
        query: { redirect: router.currentRoute.value.fullPath },
      });
  },
);
async function signOut() {
  try {
    await logout();
    router.push("/");
  } catch {}
}
</script>
<template>
  <div class="site-shell">
    <div v-if="site.demo" class="demo-banner">
      演示环境 · 展示人物为示例插画，非真实陪玩资料；支付尚未配置时无法收款。
    </div>
    <header class="site-header">
      <div class="container header-inner">
        <router-link to="/" class="brand"
          ><BrandMark /><span
            >茉莉陪玩<small>MOLI · PLAY TOGETHER</small></span
          ></router-link
        ><button
          class="mobile-menu icon-button"
          @click="menu = !menu"
          :aria-expanded="menu"
          aria-label="展开导航"
        >
          <X v-if="menu" /><Menu v-else />
        </button>
        <nav class="main-nav" :class="{ open: menu }" aria-label="主导航">
          <router-link to="/" exact-active-class="active">首页</router-link
          ><router-link to="/players">发现陪玩</router-link
          ><router-link to="/apply"
            >成为陪玩<ArrowUpRight :size="13" /></router-link
          ><router-link to="/help">帮助中心</router-link
          ><router-link v-if="auth.user" class="mobile-nav-item" to="/orders"
            >我的订单</router-link
          ><router-link
            v-if="auth.user?.role === 'provider'"
            class="mobile-nav-item"
            to="/studio"
            >陪玩工作台</router-link
          ><router-link
            v-if="auth.user?.role === 'admin'"
            class="mobile-nav-item"
            to="/admin"
            >管理后台</router-link
          ><router-link
            v-if="['support', 'admin'].includes(auth.user?.role)"
            class="mobile-nav-item"
            to="/support"
            >客服工作台</router-link
          ><router-link v-if="auth.user" class="mobile-nav-item" to="/account"
            >个人中心</router-link
          >
        </nav>
        <div class="header-account" v-if="auth.user">
          <router-link to="/orders">我的订单</router-link
          ><router-link v-if="auth.user.role === 'provider'" to="/studio"
            >工作台</router-link
          ><router-link v-if="auth.user.role === 'admin'" to="/admin"
            >管理后台</router-link
          ><router-link
            v-if="['support', 'admin'].includes(auth.user.role)"
            to="/support"
            >客服工作台</router-link
          ><router-link to="/account" class="account-chip"
            ><UserRound :size="16" /><span>{{
              auth.user.name
            }}</span></router-link
          ><button class="icon-button" aria-label="退出登录" @click="signOut">
            <LogOut :size="17" />
          </button>
        </div>
        <router-link v-else to="/login" class="button header-login"
          >登录 / 注册<ArrowUpRight :size="15"
        /></router-link>
      </div>
    </header>
    <main id="main-content">
      <div v-if="site.error" class="container alert error">
        暂时无法连接服务。<button class="text-button" @click="loadSite">
          重新连接
        </button>
      </div>
      <router-view v-if="!router.currentRoute.value.meta.auth || auth.user" />
    </main>
    <footer class="site-footer">
      <div class="container footer-top">
        <div>
          <router-link to="/" class="brand"
            ><BrandMark /><span
              >茉莉陪玩<small>MOLI · PLAY TOGETHER</small></span
            ></router-link
          >
          <p>与君茉莉 · 忘君莫离<br />让每一场游戏，都有值得期待的陪伴。</p>
        </div>
        <div class="footer-links">
          <div>
            <strong>一起玩</strong
            ><router-link to="/players">发现游戏搭子</router-link
            ><router-link to="/apply">陪玩入驻</router-link
            ><router-link to="/orders">订单中心</router-link>
          </div>
          <div>
            <strong>安心玩</strong
            ><router-link to="/help">帮助与客服</router-link
            ><router-link to="/legal/terms">服务协议</router-link
            ><router-link to="/legal/privacy">隐私政策</router-link
            ><router-link to="/legal/refund">退款规则</router-link>
          </div>
        </div>
      </div>
      <div class="container footer-bottom">
        <span
          >© {{ new Date().getFullYear() }} {{ site.operator || "茉莉陪玩" }} ·
          理性消费，健康游戏</span
        ><a
          v-if="site.icp"
          href="https://beian.miit.gov.cn/"
          target="_blank"
          rel="noopener"
          >{{ site.icp }}</a
        ><span>成年用户服务</span>
      </div>
    </footer>
    <div
      v-if="ui.toast"
      class="toast"
      :class="{ error: ui.error }"
      role="status"
      aria-live="polite"
    >
      {{ ui.toast }}
    </div>
  </div>
</template>
