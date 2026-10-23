<script setup>
import { ref, onMounted } from "vue";
import { useRouter } from "vue-router";
import {
  ArrowUpRight,
  ShieldCheck,
  Clock,
  Wallet,
  CheckCircle2,
} from "lucide-vue-next";
import { api, auth, notify } from "../lib/api.js";
import ExperienceFields from "../components/ExperienceFields.vue";
import { site } from "../lib/site.js";
const router = useRouter(),
  application = ref(null),
  loading = ref(true),
  busy = ref(false),
  form = ref({
    nickname: "",
    bio: "",
    city: "",
    contact: "",
    category: "esports",
    venue: "",
    feeNote: "",
    game: "英雄联盟",
    skill: "",
    rate: 50,
    tags: "耐心沟通,轻松开黑",
    adult: false,
    terms: false,
  });
onMounted(async () => {
  if (auth.user.role === "provider") {
    router.replace("/studio");
    return;
  }
  if (auth.user.role === "admin") {
    router.replace("/admin");
    return;
  }
  try {
    application.value = await api("/application");
    if (application.value?.status === "rejected") {
      const d = application.value.data;
      form.value = {
        category: "esports",
        venue: "",
        feeNote: "",
        ...d,
        rate: d.rateCents / 100,
        tags: d.tags.join(","),
      };
    }
  } catch {
  } finally {
    loading.value = false;
  }
});
async function submit() {
  busy.value = true;
  try {
    await api("/application", {
      method: "POST",
      body: {
        nickname: form.value.nickname,
        bio: form.value.bio,
        city: form.value.city,
        contact: form.value.contact,
        category: form.value.category,
        venue: form.value.venue,
        feeNote: form.value.feeNote,
        game: form.value.game,
        skill: form.value.skill,
        rateCents: Math.round(Number(form.value.rate) * 100),
        tags: form.value.tags
          .split(/[,，]/)
          .map((x) => x.trim())
          .filter(Boolean),
        adult: form.value.adult,
        terms: form.value.terms,
      },
    });
    application.value = await api("/application");
    notify("入驻申请已提交");
  } catch {
  } finally {
    busy.value = false;
  }
}
async function refresh() {
  try {
    await api("/auth/me").then((d) => {
      auth.user = d.user;
      auth.csrf = d.csrf;
    });
    if (auth.user.role === "provider") router.push("/studio");
    else application.value = await api("/application");
  } catch {}
}
</script>
<template>
  <div class="container page-space">
    <div class="page-heading">
      <div>
        <span class="eyebrow">YOUR SKILLS, OUR STAGE</span>
        <h1>让热爱，拥有新的舞台。</h1>
        <p>成为茉莉陪玩，用技能和耐心连接线上开黑与线下生活。</p>
      </div>
    </div>
    <div class="help-grid">
      <section class="join-values">
        <div class="panel section-panel">
          <ShieldCheck :size="27" />
          <h3>认真审核，安心入驻</h3>
          <p>
            运营者会核对成年身份与技能材料。你的联系方式仅用于审核与订单履行。
          </p>
        </div>
        <div class="panel section-panel">
          <Clock :size="27" />
          <h3>自主档期，自在开黑</h3>
          <p>选择自己的服务、定价和每周可预约时间，自主开启或暂停接单。</p>
        </div>
        <div class="panel section-panel">
          <Wallet :size="27" />
          <h3>订单清晰，收入可查</h3>
          <p>
            完成且无退款争议的服务计入收入，工作台提供订单、结算申请和处理记录。
          </p>
        </div>
      </section>
      <section class="panel section-panel">
        <div v-if="loading" class="skeleton list-skeleton" />
        <div v-else-if="application?.status === 'pending'" class="empty-state">
          <Clock :size="38" />
          <h2>申请已送达。</h2>
          <p>
            运营者正在审核资料，如需补充材料会联系你。可以稍后刷新查看结果。
          </p>
          <button class="button secondary" @click="refresh">
            刷新审核结果
          </button>
        </div>
        <div v-else-if="application?.status === 'approved'" class="empty-state">
          <CheckCircle2 :size="38" />
          <h2>欢迎成为茉莉陪玩</h2>
          <p>
            刷新账号权限后就可以进入工作台。线下服务还须通过场所与内容审核才会展示。
          </p>
          <button class="button" @click="refresh">进入工作台</button>
        </div>
        <template v-else
          ><h2>填写入驻资料</h2>
          <p v-if="application?.status === 'rejected'" class="alert error">
            上次申请未通过：{{ application.reason }}。补充资料后可以重新申请。
          </p>
          <form @submit.prevent="submit">
            <div class="form-grid">
              <label class="field"
                >陪玩昵称<input
                  v-model="form.nickname"
                  required
                  maxlength="30" /></label
              ><label class="field"
                >所在城市<input
                  v-model="form.city"
                  maxlength="50"
                  placeholder="选填，不填写详细住址"
              /></label>
            </div>
            <label class="field"
              >审核联系方式<input
                v-model="form.contact"
                required
                maxlength="120"
                placeholder="邮箱、QQ或手机号"
            /></label>
            <ExperienceFields v-model="form" />
            <div class="form-grid">
              <label v-if="form.category === 'esports'" class="field"
                >擅长游戏<select v-model="form.game">
                  <option v-for="g in site.games" :key="g">{{ g }}</option>
                </select></label
              ><label class="field"
                >技能 / 段位<input v-model="form.skill" required maxlength="60"
              /></label>
            </div>
            <label class="field"
              >技能与服务介绍<textarea
                v-model="form.bio"
                required
                minlength="20"
                maxlength="1000"
                rows="5"
                placeholder="你的游戏经验、擅长位置、沟通风格……请勿发布私人联系方式"
              />
            </label>
            <div class="form-grid">
              <label class="field"
                >每小时价格（元）<input
                  v-model="form.rate"
                  type="number"
                  min="1"
                  max="2000"
                  step="0.01"
                  required /></label
              ><label class="field"
                >风格标签<input
                  v-model="form.tags"
                  placeholder="逗号分隔，最多5个"
              /></label>
            </div>
            <div class="consent">
              <label
                ><input
                  v-model="form.adult"
                  type="checkbox"
                  required
                />我已年满18周岁，愿意配合身份与技能审核</label
              ><label
                ><input
                  v-model="form.terms"
                  type="checkbox"
                  required
                />我已阅读并同意<router-link to="/legal/terms"
                  >服务协议</router-link
                >，保证资料真实</label
              >
            </div>
            <button class="button full" :disabled="busy">
              {{ busy ? "正在提交" : "提交入驻申请"
              }}<ArrowUpRight :size="18" />
            </button></form
        ></template>
      </section>
    </div>
  </div>
</template>
