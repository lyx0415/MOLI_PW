<script setup>
import { ref, computed } from "vue";
import { useRoute, useRouter } from "vue-router";
import { ArrowUpRight, ShieldCheck, Gamepad2, Sparkles } from "lucide-vue-next";
import BrandMark from "../components/BrandMark.vue";
import { api, auth, notify } from "../lib/api.js";
import { site } from "../lib/site.js";
const mode = ref("login"),
  email = ref(""),
  password = ref(""),
  name = ref(""),
  code = ref(""),
  terms = ref(false),
  adult = ref(false),
  busy = ref(false),
  sending = ref(false),
  route = useRoute(),
  router = useRouter();
const heading = computed(
  () =>
    ({
      login: "欢迎回来。",
      register: "很高兴，遇见你。",
      reset: "找回你的账号。",
    })[mode.value],
);
async function sendCode() {
  sending.value = true;
  try {
    await api("/auth/challenge", {
      method: "POST",
      body: {
        email: email.value,
        purpose: mode.value === "reset" ? "reset" : "register",
      },
    });
    notify("如邮箱符合条件，验证码已发送");
  } catch {
  } finally {
    sending.value = false;
  }
}
async function submit() {
  busy.value = true;
  try {
    if (mode.value === "reset") {
      await api("/auth/reset", {
        method: "POST",
        body: {
          email: email.value,
          password: password.value,
          code: code.value,
        },
      });
      notify("密码已更新，请重新登录");
      mode.value = "login";
      password.value = "";
      return;
    }
    const data = await api("/auth/" + mode.value, {
      method: "POST",
      body:
        mode.value === "login"
          ? { email: email.value, password: password.value }
          : {
              email: email.value,
              name: name.value,
              password: password.value,
              code: code.value,
              terms: terms.value,
              adult: adult.value,
            },
    });
    auth.user = data.user;
    auth.csrf = data.csrf;
    const redirect =
      typeof route.query.redirect === "string" &&
      route.query.redirect.startsWith("/") &&
      !route.query.redirect.startsWith("//")
        ? route.query.redirect
        : "/account";
    router.push(redirect);
    notify("欢迎来到茉莉");
  } catch {
  } finally {
    busy.value = false;
  }
}
</script>
<template>
  <div class="container auth-page">
    <section class="auth-story">
      <BrandMark /><span class="eyebrow">MOLI · PLAY TOGETHER</span>
      <h1>快乐同频，<br />从这一局开始。</h1>
      <p>
        登录一个账号，发现你的游戏搭子。<br />也可以成为陪玩，让热爱拥有新的可能。
      </p>
      <div><Gamepad2 :size="22" /><span>客户 · 预约喜欢的服务</span></div>
      <div><Sparkles :size="22" /><span>陪玩 · 自主安排游戏时光</span></div>
      <div><ShieldCheck :size="22" /><span>管理者 · 守护每一次体验</span></div>
    </section>
    <section class="auth-form panel">
      <div class="auth-tabs" v-if="mode !== 'reset'">
        <button :class="{ active: mode === 'login' }" @click="mode = 'login'">
          登录</button
        ><button
          :class="{ active: mode === 'register' }"
          @click="mode = 'register'"
        >
          注册账号
        </button>
      </div>
      <span class="eyebrow">{{
        mode === "login" ? "WELCOME BACK" : "YOUR NEXT CHAPTER"
      }}</span>
      <h2>{{ heading }}</h2>
      <p class="subtle">
        {{
          mode === "login"
            ? "新的一场默契，正在等你。"
            : "请使用本人邮箱，认真保管账号信息。"
        }}
      </p>
      <form @submit.prevent="submit">
        <label class="field" v-if="mode === 'register'"
          >昵称<input
            v-model="name"
            maxlength="30"
            required
            autocomplete="nickname"
            placeholder="希望大家怎么称呼你" /></label
        ><label class="field"
          >邮箱<input
            v-model="email"
            type="email"
            maxlength="254"
            required
            autocomplete="email"
            placeholder="you@example.com" /></label
        ><label
          class="field"
          v-if="
            mode === 'reset' ||
            (mode === 'register' && site.emailVerificationRequired)
          "
          >邮箱验证码
          <div class="input-action">
            <input
              v-model="code"
              inputmode="numeric"
              pattern="[0-9]{6}"
              maxlength="6"
              required
              placeholder="6位验证码"
            /><button
              type="button"
              class="button secondary"
              :disabled="sending || !email"
              @click="sendCode"
            >
              {{ sending ? "发送中" : "获取验证码" }}
            </button>
          </div></label
        ><label class="field"
          >{{ mode === "reset" ? "新密码" : "密码"
          }}<input
            v-model="password"
            type="password"
            :minlength="mode === 'login' ? 1 : 10"
            maxlength="128"
            required
            :autocomplete="
              mode === 'login' ? 'current-password' : 'new-password'
            "
            :placeholder="
              mode === 'login' ? '请输入密码' : '至少10位，包含字母和数字'
            "
        /></label>
        <div class="consent" v-if="mode === 'register'">
          <label
            ><input
              type="checkbox"
              v-model="adult"
              required
            />我已年满18周岁</label
          ><label
            ><input
              type="checkbox"
              v-model="terms"
              required
            />我已阅读并同意<router-link to="/legal/terms">服务协议</router-link
            >与<router-link to="/legal/privacy">隐私政策</router-link></label
          >
        </div>
        <button class="button full" :disabled="busy">
          {{
            busy
              ? "请稍候"
              : mode === "login"
                ? "登录，开始新的一局"
                : mode === "register"
                  ? "创建我的账号"
                  : "更新密码"
          }}<ArrowUpRight :size="18" />
        </button>
      </form>
      <button
        class="text-button auth-secondary"
        @click="mode = mode === 'reset' ? 'login' : 'reset'"
      >
        {{ mode === "reset" ? "返回登录" : "忘记密码？" }}
      </button>
    </section>
  </div>
</template>
