<script setup>
import { computed, ref, watch, onMounted, onUnmounted } from "vue";
import { useRoute } from "vue-router";
import {
  ArrowUpRight,
  MapPin,
  ArrowLeft,
  ShieldCheck,
  CalendarDays,
  MessageCircle,
} from "lucide-vue-next";
import SceneArt from "../components/SceneArt.vue";
import ProviderCard from "../components/ProviderCard.vue";
import { site, loadSite } from "../lib/site.js";
import { api, auth, notify } from "../lib/api.js";
import { useRouter } from "vue-router";
const route = useRoute(),
  router = useRouter(),
  city = ref(String(route.query.city || "")),
  providers = ref([]),
  loading = ref(false),
  failed = ref(false),
  saved = ref([]);
const scene = computed(() =>
  site.categories.find((c) => c.id === route.params.category),
);
const cities = computed(() =>
  [...new Set(site.categories.flatMap((c) => c.cities || []))].sort(),
);
const destination = (c) => ({
  path: "/players",
  query: {
    category: c.id,
    ...(c.mode === "offline" && city.value.trim()
      ? { city: city.value.trim() }
      : {}),
  },
});
let requestNumber = 0;
onMounted(async () => {
  if (auth.user) {
    try {
      saved.value = await api("/favorites");
    } catch {}
  }
});
onUnmounted(() => {
  requestNumber++;
});
watch(
  () => route.query.city,
  (value) => {
    city.value = String(value || "");
  },
);
watch(
  () => [route.params.category, city.value, site.loaded],
  async () => {
    const n = ++requestNumber;
    if (!scene.value) {
      providers.value = [];
      return;
    }
    loading.value = true;
    failed.value = false;
    try {
      const data = await api(
        "/providers?" +
          new URLSearchParams({
            category: scene.value.id,
            city: scene.value.mode === "offline" ? city.value.trim() : "",
            size: 3,
          }),
        { quiet: true },
      );
      if (n === requestNumber) providers.value = data.items;
    } catch {
      if (n === requestNumber) failed.value = true;
    } finally {
      if (n === requestNumber) loading.value = false;
    }
  },
  { immediate: true },
);
async function favorite(p) {
  if (!auth.user) {
    router.push({ path: "/login", query: { redirect: route.fullPath } });
    return;
  }
  try {
    const ids = await api("/favorites");
    const value = !ids.includes(p.id);
    await api("/favorites/" + p.id, { method: "PUT", body: { saved: value } });
    saved.value = value ? [...ids, p.id] : ids.filter((id) => id !== p.id);
    notify(value ? "已收藏" : "已取消收藏");
  } catch {}
}
</script>
<template>
  <div class="container page-space experiences-page">
    <div v-if="site.error" class="empty-state panel">
      <h1>场景信息暂时无法加载</h1>
      <button class="button" @click="loadSite">重试</button>
    </div>
    <div v-else-if="!site.loaded" class="skeleton detail-skeleton" />
    <div v-else-if="route.params.category && !scene" class="empty-state panel">
      <h1>没有找到这个服务场景</h1>
      <router-link class="button" to="/experiences">返回场景探索</router-link>
    </div>
    <template v-else>
      <nav class="scene-navigation" aria-label="服务场景导航">
        <router-link
          to="/experiences"
          :class="{ active: !scene }"
          :aria-current="!scene ? 'page' : undefined"
          >全部场景</router-link
        >
        <router-link
          v-for="c in site.categories"
          :key="c.id"
          :to="{
            path: '/experiences/' + c.id,
            query: c.mode === 'offline' && city ? { city } : {},
          }"
          :class="{ active: scene?.id === c.id }"
          :aria-current="scene?.id === c.id ? 'page' : undefined"
          >{{ c.name }}</router-link
        >
      </nav>
      <router-link v-if="scene" class="back-link" to="/experiences"
        ><ArrowLeft :size="16" />全部服务场景</router-link
      >
      <section class="experience-hero" :class="{ 'scene-detail-hero': scene }">
        <div>
          <span class="eyebrow">{{
            scene ? "FIND YOUR EVERYDAY JOY" : "ONLINE TO OFFLINE · MOLI LIFE"
          }}</span>
          <h1>
            {{
              scene
                ? scene.tagline
                : `屏幕里的默契，
也可以在生活里相遇。`
            }}
          </h1>
          <p>
            {{
              scene
                ? scene.description
                : "从一局游戏，到一次运动、一首合唱、一桌好时光。选择你喜欢的场景，让热爱有伴，让日常多一点期待。"
            }}
          </p>
          <div class="actions-row">
            <router-link
              class="button"
              :to="scene ? destination(scene) : '/players'"
              >{{ scene ? "寻找" + scene.name + "伙伴" : "寻找我的搭子"
              }}<ArrowUpRight :size="18" /></router-link
            ><router-link class="text-link" to="/apply"
              >带着你的热爱入驻<ArrowUpRight :size="16"
            /></router-link>
          </div>
          <div class="experience-labels">
            <span>线上 × 线下</span><span>明码标价</span><span>订单内沟通</span>
          </div>
        </div>
        <SceneArt v-if="scene" :category="scene.id" />
        <div v-else class="scene-mosaic">
          <SceneArt category="esports" /><SceneArt
            category="fitness"
          /><SceneArt category="ktv" /><SceneArt category="boardgames" /><span
            class="mosaic-label"
            >GOOD TIMES,<br />BETTER TOGETHER.</span
          >
        </div>
      </section>
      <section
        v-if="!scene || scene.mode === 'offline'"
        class="city-explorer panel"
      >
        <div>
          <MapPin :size="24" />
          <h2>先选一座城，再约一段好时光</h2>
          <p>以已审核上架的服务为准，暂无服务的城市欢迎首批伙伴入驻。</p>
        </div>
        <label class="field"
          >服务城市<input
            v-model.lazy="city"
            list="experience-cities"
            maxlength="50"
            placeholder="输入城市名，例如：上海；留空看全部"
        /></label>
        <datalist id="experience-cities">
          <option v-for="c in cities" :key="c" :value="c" />
        </datalist>
      </section>
      <template v-if="!scene">
        <div class="section-heading">
          <div>
            <span class="eyebrow">SIX WAYS TO CONNECT</span>
            <h2>把喜欢的事，安排进生活。</h2>
          </div>
          <span class="subtle">更多场景，从你的热爱开始</span>
        </div>
        <div class="experience-grid">
          <router-link
            v-for="c in site.categories"
            :key="c.id"
            :to="{
              path: '/experiences/' + c.id,
              query:
                c.mode === 'offline' && city.trim()
                  ? { city: city.trim() }
                  : {},
            }"
            class="experience-card"
          >
            <SceneArt :category="c.id" />
            <div class="experience-card-body">
              <span class="eyebrow">{{
                c.mode === "online" ? "ONLINE · 随时连接" : "OFFLINE · 同城相聚"
              }}</span>
              <h2>{{ c.name }}<ArrowUpRight :size="22" /></h2>
              <p>{{ c.description }}</p>
              <div class="tags">
                <span v-for="tag in c.examples" :key="tag">{{ tag }}</span>
              </div>
              <span class="scene-status">{{
                c.serviceCount
                  ? c.serviceCount + " 项服务已上架"
                  : "招募首批服务伙伴"
              }}</span>
            </div>
          </router-link>
        </div>
      </template>
      <template v-else>
        <section class="panel section-panel scene-intro">
          <h2>这样一起玩</h2>
          <div class="tags">
            <span v-for="tag in scene.examples" :key="tag">{{ tag }}</span>
          </div>
          <p>{{ scene.note }}</p>
          <p v-if="scene.mode === 'offline'">
            选择公开营业场所。服务价格以小时计，场地、设备等费用以服务说明为准；下单前确认人数和费用承担方式。
          </p>
        </section>
        <div class="section-heading">
          <h2>
            {{ city && scene.mode === "offline" ? city + "的" : ""
            }}{{ scene.name }}伙伴
          </h2>
          <router-link class="text-link" :to="destination(scene)"
            >查看全部<ArrowUpRight :size="16"
          /></router-link>
        </div>
        <div v-if="loading" class="provider-grid">
          <div v-for="i in 3" :key="i" class="skeleton card-skeleton" />
        </div>
        <div v-else-if="failed" class="empty-state panel">
          <h3>暂时无法加载伙伴</h3>
          <router-link class="button secondary" :to="destination(scene)"
            >前往发现页重试</router-link
          >
        </div>
        <div v-else-if="providers.length" class="provider-grid">
          <ProviderCard
            v-for="p in providers"
            :key="p.id"
            :provider="p"
            :saved="saved.includes(p.id)"
            @favorite="favorite"
          />
        </div>
        <div v-else class="empty-state panel">
          <MapPin :size="32" />
          <h3>好时光，等一位先行者</h3>
          <p>
            这个场景{{
              city ? "在" + city : ""
            }}暂时没有已上架的服务。欢迎成为首批伙伴，或向客服反馈你的需求。
          </p>
          <div class="actions-row">
            <router-link class="button" to="/">继续发现陪玩</router-link
            ><router-link class="button secondary" to="/help"
              >联系茉莉客服</router-link
            >
          </div>
        </div>
      </template>
      <section class="experience-steps">
        <div>
          <CalendarDays :size="25" />
          <h3>01 · 找到合拍的安排</h3>
          <p>按场景、城市和预算选择伙伴，核对内容与可预约时间。</p>
        </div>
        <div>
          <ShieldCheck :size="25" />
          <h3>02 · 约定清楚再出发</h3>
          <p>确认服务价格、地点和额外费用，付款后等待陪玩接单。</p>
        </div>
        <div>
          <MessageCircle :size="25" />
          <h3>03 · 好体验，也有回应</h3>
          <p>在订单内沟通，完成后留下评价；需要协助时提交关联订单的工单。</p>
        </div>
      </section>
      <aside class="partner-secondary">
        <span>想分享你的擅长，或开展门店合作？</span
        ><router-link to="/apply">了解陪玩申请</router-link
        ><router-link to="/help">合作咨询</router-link>
      </aside>
    </template>
  </div>
</template>
