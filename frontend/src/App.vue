<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import {
  Menu,
  X,
  ArrowUpRight,
  UserRound,
  LogOut,
  ChevronDown,
} from "lucide-vue-next";
import BrandMark from "./components/BrandMark.vue";
import { auth, ui, logout } from "./lib/api.js";
import { site, loadSite } from "./lib/site.js";
const router = useRouter(),
  route = useRoute(),
  menu = ref(false),
  header = ref(),
  menuButton = ref(),
  accountMenu = ref();
const publicLinks = [
  ["/", "发现陪玩"],
  ["/experiences", "场景探索"],
  ["/orders", "我的订单"],
  ["/help", "帮助中心"],
];
const personalLinks = [
  ["/account", "个人中心"],
  ["/orders", "我的订单"],
  ["/players?favorites=true", "我的收藏"],
];
const staffLinks = computed(() => [
  ...(auth.user?.role === "provider" ? [["/studio", "陪玩工作台"]] : []),
  ...(auth.user?.role === "admin" ? [["/admin", "管理后台"]] : []),
  ...(["support", "admin"].includes(auth.user?.role)
    ? [["/support", "客服工作台"]]
    : []),
]);
const inStaffSpace = computed(() =>
  staffLinks.value.some(([path]) => isCurrent(path)),
);
const contextLinks = computed(() =>
  inStaffSpace.value ? staffLinks.value : personalLinks,
);
const inPersonalSpace = computed(
  () =>
    auth.user &&
    (inStaffSpace.value || ["/account", "/orders"].some(isCurrent)),
);
const roleName = computed(
  () =>
    ({ customer: "客户", provider: "陪玩", support: "客服", admin: "管理员" })[
      auth.user?.role
    ],
);
function isCurrent(path) {
  return path === "/"
    ? route.path === "/" || route.path.startsWith("/players")
    : route.path === path || route.path.startsWith(path + "/");
}
function closeMenus() {
  menu.value = false;
  if (accountMenu.value) accountMenu.value.open = false;
}
function toggleMenu() {
  menu.value = !menu.value;
  if (menu.value && accountMenu.value) accountMenu.value.open = false;
}
function onEscape() {
  if (menu.value) {
    menu.value = false;
    menuButton.value?.focus();
  }
  if (accountMenu.value?.open) {
    accountMenu.value.open = false;
    accountMenu.value.querySelector("summary")?.focus();
  }
}
function onOutsideClick(event) {
  if (!header.value?.contains(event.target)) closeMenus();
}
onMounted(() => {
  loadSite();
  document.addEventListener("pointerdown", onOutsideClick);
});
onUnmounted(() => document.removeEventListener("pointerdown", onOutsideClick));
watch(() => route.fullPath, closeMenus);
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
    <a class="skip-link" href="#main-content">跳转到主要内容</a>
    <div v-if="site.demo" class="demo-banner">
      演示环境 · 展示人物为示例插画，非真实陪玩资料；支付尚未配置时无法收款。
    </div>
    <header ref="header" class="site-header" @keydown.esc="onEscape">
      <div class="container header-inner">
        <router-link to="/" class="brand"
          ><BrandMark /><span
            >茉莉陪玩<small>MOLI · PLAY TOGETHER</small></span
          ></router-link
        ><button
          class="mobile-menu icon-button"
          ref="menuButton"
          @click="toggleMenu"
          :aria-expanded="menu"
          aria-controls="main-navigation"
          aria-label="展开导航"
        >
          <X v-if="menu" /><Menu v-else />
        </button>
        <nav
          id="main-navigation"
          class="main-nav"
          :class="{ open: menu }"
          aria-label="主导航"
        >
          <router-link
            v-for="[path, label] in publicLinks"
            :key="path"
            :to="path"
            active-class=""
            exact-active-class=""
            :class="{ active: isCurrent(path) }"
            :aria-current="isCurrent(path) ? 'page' : undefined"
            >{{ label }}</router-link
          >
          <span v-if="auth.user" class="mobile-nav-heading">我的茉莉</span>
          <template v-if="auth.user">
            <router-link
              v-for="[path, label] in personalLinks"
              :key="path"
              :to="path"
              class="mobile-nav-item"
              :class="{ active: isCurrent(path) }"
              :aria-current="isCurrent(path) ? 'page' : undefined"
              >{{ label }}</router-link
            >
          </template>
        </nav>
        <div class="header-account" v-if="auth.user">
          <details
            ref="accountMenu"
            class="account-menu"
            @toggle="if ($event.target.open) menu = false;"
          >
            <summary
              class="account-chip"
              :aria-label="'打开账号菜单：' + auth.user.name"
            >
              <UserRound :size="16" /><span>{{ auth.user.name }}</span
              ><ChevronDown :size="14" />
            </summary>
            <div class="account-popover">
              <div class="account-menu-label">
                我的茉莉 <small>{{ roleName }}</small>
              </div>
              <nav aria-label="账号导航">
                <router-link
                  v-for="[path, label] in personalLinks"
                  :key="path"
                  :to="path"
                  :aria-current="isCurrent(path) ? 'page' : undefined"
                  >{{ label }}<ArrowUpRight :size="14"
                /></router-link>
              </nav>
              <div v-if="staffLinks.length" class="staff-menu">
                <small>员工工作区</small>
                <nav aria-label="员工导航">
                  <router-link
                    v-for="[path, label] in staffLinks"
                    :key="path"
                    :to="path"
                    >{{ label }}<ArrowUpRight :size="14"
                  /></router-link>
                </nav>
              </div>
              <button class="account-signout" @click="signOut">
                <LogOut :size="16" />退出登录
              </button>
            </div>
          </details>
        </div>
        <router-link v-else to="/login" class="button header-login"
          >登录 / 注册<ArrowUpRight :size="15"
        /></router-link>
      </div>
    </header>
    <main id="main-content" tabindex="-1">
      <div v-if="inPersonalSpace" class="personal-bar">
        <div class="container personal-bar-inner">
          <span
            >{{ inStaffSpace ? "员工工作区" : "我的茉莉" }}
            <small v-if="inStaffSpace">{{ roleName }}</small></span
          >
          <nav aria-label="个人空间导航">
            <router-link
              v-for="[path, label] in contextLinks"
              :key="path"
              :to="path"
              :class="{ active: isCurrent(path) }"
              :aria-current="isCurrent(path) ? 'page' : undefined"
              >{{ label }}</router-link
            >
          </nav>
        </div>
      </div>
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
            ><router-link to="/players?favorites=true">我的收藏</router-link
            ><router-link to="/orders">订单中心</router-link>
          </div>
          <div>
            <strong>成为伙伴</strong
            ><router-link to="/apply"
              >申请成为陪玩<ArrowUpRight :size="12" /></router-link
            ><span class="footer-partner-note">用你的擅长，陪伴更多热爱。</span>
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
