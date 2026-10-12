<script setup>
import { ref } from "vue";
import { useRouter } from "vue-router";
import {
  UserRound,
  ArrowUpRight,
  ShieldCheck,
  Heart,
  Gamepad2,
} from "lucide-vue-next";
import { api, auth, notify } from "../lib/api.js";
const router = useRouter(),
  name = ref(auth.user.name),
  current = ref(""),
  password = ref(""),
  busy = ref(false);
async function update() {
  busy.value = true;
  try {
    await api("/auth/profile", { method: "PATCH", body: { name: name.value } });
    auth.user.name = name.value;
    notify("昵称已更新");
  } catch {
  } finally {
    busy.value = false;
  }
}
async function changePassword() {
  busy.value = true;
  try {
    await api("/auth/password", {
      method: "PUT",
      body: { currentPassword: current.value, password: password.value },
    });
    auth.user = null;
    auth.csrf = "";
    router.push("/login");
    notify("密码已更新，请重新登录");
  } catch {
  } finally {
    busy.value = false;
  }
}
</script>
<template>
  <div class="container page-space narrow">
    <div class="page-heading">
      <div>
        <span class="eyebrow">YOUR LITTLE SPACE</span>
        <h1>你好，{{ auth.user.name }}。</h1>
        <p>账号设置与常用入口，在这里轻松找到。</p>
      </div>
      <span class="large-user-icon"><UserRound :size="32" /></span>
    </div>
    <div class="account-shortcuts">
      <router-link to="/orders" class="panel"
        ><Gamepad2 /><strong>我的订单</strong
        ><ArrowUpRight :size="19" /></router-link
      ><router-link
        :to="
          auth.user.role === 'provider'
            ? '/studio'
            : auth.user.role === 'admin'
              ? '/admin'
              : '/apply'
        "
        class="panel"
        ><ShieldCheck /><strong>{{
          auth.user.role === "provider"
            ? "陪玩工作台"
            : auth.user.role === "admin"
              ? "运营管理"
              : "申请成为陪玩"
        }}</strong
        ><ArrowUpRight :size="19"
      /></router-link>
    </div>
    <section class="panel section-panel">
      <h2>个人资料</h2>
      <form @submit.prevent="update">
        <label class="field"
          >邮箱<input :value="auth.user.email" disabled /><span
            class="field-hint"
            >{{
              auth.user.emailVerified
                ? "已验证邮箱"
                : "开发环境账号，邮箱尚未验证"
            }}</span
          ></label
        ><label class="field"
          >昵称<input v-model="name" required maxlength="30" /></label
        ><button class="button" :disabled="busy">保存资料</button>
      </form>
    </section>
    <section class="panel section-panel">
      <h2>修改密码</h2>
      <form @submit.prevent="changePassword">
        <label class="field"
          >当前密码<input
            v-model="current"
            type="password"
            required
            autocomplete="current-password" /></label
        ><label class="field"
          >新密码<input
            v-model="password"
            type="password"
            minlength="10"
            maxlength="128"
            required
            autocomplete="new-password"
            placeholder="至少10位，包含字母和数字"
        /></label>
        <p class="field-hint">修改后会退出全部设备，请重新登录。</p>
        <button class="button secondary" :disabled="busy">更新密码</button>
      </form>
    </section>
  </div>
</template>
