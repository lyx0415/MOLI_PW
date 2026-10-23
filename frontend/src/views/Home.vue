<script setup>
import { ref, onMounted } from "vue";
import { useRouter } from "vue-router";
import {
  ArrowUpRight,
  ArrowRight,
  Gamepad2,
  Headphones,
  ShieldCheck,
  Check,
  Search,
  Sparkles,
  Crosshair,
  Swords,
  Target,
  Crown,
  Compass,
} from "lucide-vue-next";
import SceneArt from "../components/SceneArt.vue";
import ProviderCard from "../components/ProviderCard.vue";
import BrandMark from "../components/BrandMark.vue";
import { api, auth, notify } from "../lib/api.js";
import { site } from "../lib/site.js";
const router = useRouter(),
  providers = ref([]),
  loading = ref(true),
  failed = ref(false),
  keyword = ref(""),
  favorites = ref([]);
const gameIcons = [Crown, Swords, Crosshair, Target, Compass, Gamepad2];
async function load() {
  loading.value = true;
  failed.value = false;
  try {
    providers.value = (await api("/providers?size=6")).items;
    if (auth.user) favorites.value = await api("/favorites");
  } catch {
    failed.value = true;
  } finally {
    loading.value = false;
  }
}
async function favorite(p) {
  if (!auth.user) {
    router.push("/login?redirect=/");
    return;
  }
  const saved = !favorites.value.includes(p.id);
  try {
    await api("/favorites/" + p.id, { method: "PUT", body: { saved } });
    favorites.value = saved
      ? [...favorites.value, p.id]
      : favorites.value.filter((x) => x !== p.id);
    notify(saved ? "已收藏，期待下次一起开黑" : "已取消收藏");
  } catch {}
}
onMounted(load);
</script>
<template>
  <div class="home">
    <section class="hero container">
      <div class="hero-copy">
        <span class="eyebrow"><i />MOLI · PLAY TOGETHER</span>
        <h1>
          今晚的快乐，<br />有人陪你<span class="serif-accent">开局。</span>
        </h1>
        <p class="hero-description">
          一场尽兴的游戏，一位合拍的搭子。<br />在茉莉，找到你的快乐同频。
        </p>
        <form
          class="hero-search"
          @submit.prevent="
            router.push({ path: '/players', query: { keyword } })
          "
        >
          <Search :size="19" /><input
            v-model="keyword"
            aria-label="搜索陪玩或游戏"
            placeholder="想玩什么？找找你的游戏搭子"
          /><button class="button" type="submit">
            去发现<ArrowUpRight :size="17" />
          </button>
        </form>
        <div class="hero-trust">
          <span><ShieldCheck :size="16" />入驻审核</span
          ><span><Check :size="16" />明码标价</span
          ><span><Headphones :size="16" />订单售后</span>
        </div>
      </div>
      <div class="hero-art" aria-hidden="true">
        <div class="hero-art-grid" />
        <span class="art-note top">GOOD GAME, GOOD COMPANY.</span>
        <div class="orbit orbit-one" />
        <div class="orbit orbit-two" />
        <div class="hero-flower"><BrandMark /></div>
        <div class="game-console">
          <div class="console-grip" />
          <div class="console-screen">
            <span>MOLI<br /><b>GAME ON.</b></span
            ><Sparkles :size="28" />
          </div>
          <div class="dpad">+</div>
          <div class="console-buttons"><i /><i /><i /><i /></div>
        </div>
        <div class="floating-note note-one">
          <span class="note-icon"><Headphones :size="22" /></span
          ><span
            ><strong>默契，不止在游戏里</strong
            ><small>今天也要玩得开心</small></span
          >
        </div>
        <div class="floating-note note-two">
          <span class="green-dot" />快乐搭子，准备就绪<ArrowUpRight
            :size="15"
          />
        </div>
        <span class="art-note bottom">PRESS START. MAKE A FRIEND.</span>
        <div class="art-cross">✳</div>
      </div>
    </section>
    <section class="game-section">
      <div class="container">
        <div class="section-top">
          <div>
            <span class="eyebrow">FIND YOUR GAME</span>
            <h2>你热爱的游戏，我们一起玩。</h2>
          </div>
          <router-link to="/players" class="text-link"
            >全部游戏<ArrowUpRight :size="18"
          /></router-link>
        </div>
        <div class="game-grid">
          <router-link
            v-for="(game, i) in site.games"
            :key="game"
            :to="{ path: '/players', query: { game } }"
            class="game-tile"
            ><span :class="'game-symbol game-' + i"
              ><component :is="gameIcons[i]" :size="25" /></span
            ><strong>{{ game }}</strong
            ><ArrowUpRight :size="15"
          /></router-link>
        </div>
      </div>
    </section>
    <section class="container recommendations">
      <div class="section-top">
        <div>
          <span class="eyebrow">MEET YOUR NEXT TEAMMATE</span>
          <h2>合拍的人，等你开场。</h2>
          <p class="subtle">选择喜欢的风格，预约一段轻松时光。</p>
        </div>
        <router-link to="/players" class="text-link"
          >发现更多陪玩<ArrowRight :size="18"
        /></router-link>
      </div>
      <div v-if="loading" class="provider-grid">
        <div v-for="i in 6" :key="i" class="skeleton card-skeleton" />
      </div>
      <div v-else-if="failed" class="empty-state">
        <h3>暂时无法加载陪玩</h3>
        <button class="button secondary" @click="load">重新加载</button>
      </div>
      <div v-else-if="!providers.length" class="empty-state">
        <Gamepad2 :size="36" />
        <h3>新的游戏搭子正在入驻</h3>
        <p>可以先了解服务规则，或申请成为茉莉陪玩。</p>
        <router-link class="button secondary" to="/apply">申请入驻</router-link>
      </div>
      <div v-else class="provider-grid">
        <ProviderCard
          v-for="p in providers"
          :key="p.id"
          :provider="p"
          :saved="favorites.includes(p.id)"
          @favorite="favorite"
        />
      </div>
    </section>
    <section class="container how-section">
      <div class="how-heading">
        <span class="eyebrow">A LITTLE GUIDE</span>
        <h2>快乐开局，<br />只需三步。</h2>
        <p>明晰的流程，安心的陪伴。</p>
      </div>
      <div class="how-steps">
        <div>
          <span class="step-number">01</span><Gamepad2 :size="25" />
          <h3>找到合拍的搭子</h3>
          <p>按游戏、风格与预算筛选，<br />选择适合自己的服务。</p>
        </div>
        <div>
          <span class="step-number">02</span><ShieldCheck :size="25" />
          <h3>预约你的游戏时光</h3>
          <p>确认时间和价格后付款，<br />等待陪玩接单，沟通偏好。</p>
        </div>
        <div>
          <span class="step-number">03</span><Sparkles :size="25" />
          <h3>一起玩，留下好评</h3>
          <p>服务结束后确认订单，<br />分享这次真实的游戏体验。</p>
        </div>
      </div>
    </section>
    <section class="container join-banner">
      <div class="join-flower"><BrandMark /></div>
      <div>
        <span class="eyebrow">YOUR SKILLS, OUR STAGE</span>
        <h2>把热爱，变成另一种可能。</h2>
        <p>加入茉莉，展示你的技能，自主安排接单时间。</p>
      </div>
      <router-link class="button light" to="/apply"
        >成为茉莉陪玩<ArrowUpRight :size="19"
      /></router-link>
    </section>
    <section
      v-if="site.announcements.length"
      class="container announcement-strip"
    >
      <span class="eyebrow">茉莉公告</span>
      <p>
        {{ site.announcements[0].title }} · {{ site.announcements[0].content }}
      </p>
      <router-link to="/help"><ArrowUpRight :size="18" /></router-link>
    </section>
    <section class="container home-experiences">
      <div class="section-heading">
        <div>
          <span class="eyebrow">MORE THAN A GAME</span>
          <h2>快乐不止一局，陪伴不止线上。</h2>
        </div>
        <router-link class="text-link" to="/experiences"
          >探索全部场景<ArrowUpRight :size="18"
        /></router-link>
      </div>
      <div class="home-scene-grid">
        <router-link
          v-for="c in site.categories"
          :key="c.id"
          :to="'/experiences/' + c.id"
          class="home-scene"
          ><SceneArt :category="c.id" /><strong>{{ c.name }}</strong
          ><span>{{
            c.mode === "online" ? "线上相聚" : "同城相伴"
          }}</span></router-link
        >
      </div>
    </section>
  </div>
</template>
