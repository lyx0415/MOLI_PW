<script setup>
import { computed, ref, onMounted, onUnmounted, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import {
  Search,
  SlidersHorizontal,
  ArrowUpRight,
  Gamepad2,
  X,
  Heart,
  ArrowRight,
  ShieldCheck,
  Clock,
  Crown,
  Swords,
  Crosshair,
  Target,
  Compass,
} from "lucide-vue-next";
import ProviderCard from "../components/ProviderCard.vue";
import Pagination from "../components/Pagination.vue";
import { api, auth, notify } from "../lib/api.js";
import { site, loadSite } from "../lib/site.js";
const route = useRoute(),
  router = useRouter(),
  keyword = ref(String(route.query.keyword || "")),
  favorites = ref([]),
  data = ref({ items: [], total: 0, page: 1, size: 12 }),
  loading = ref(true),
  failed = ref(false);
let timer,
  request = 0;
function setFilters(changes, resetPage = true) {
  const query = {
    ...route.query,
    ...(resetPage ? { page: undefined } : {}),
    ...changes,
  };
  for (const key of Object.keys(query)) {
    if (query[key] === "" || query[key] === false || query[key] == null)
      delete query[key];
  }
  return router.replace({ query });
}
function textFilter(key, fallback = "") {
  return computed({
    get: () => String(route.query[key] || fallback),
    set: (value) =>
      setFilters({ [key]: value === fallback ? undefined : value }),
  });
}
const game = textFilter("game"),
  category = textFilter("category"),
  mode = textFilter("mode"),
  city = textFilter("city"),
  sort = textFilter("sort", "recommended"),
  maxPrice = textFilter("maxPrice"),
  available = computed({
    get: () => route.query.available === "true",
    set: (value) => setFilters({ available: value ? "true" : undefined }),
  }),
  onlySaved = computed({
    get: () => Boolean(auth.user) && route.query.favorites === "true",
    set: (value) => setFilters({ favorites: value ? "true" : undefined }),
  });
const gameIcons = [Crown, Swords, Crosshair, Target, Compass, Gamepad2];
function gameCount(name) {
  return site.gameCatalog.find((g) => g.name === name)?.providerCount ?? 0;
}
const activeFilters = computed(() =>
  [
    game.value && ["game", game.value],
    category.value && [
      "category",
      site.categories.find((c) => c.id === category.value)?.name ||
        category.value,
    ],
    mode.value && ["mode", mode.value === "online" ? "线上服务" : "线下服务"],
    city.value && ["city", city.value],
    route.query.keyword && ["keyword", String(route.query.keyword)],
    maxPrice.value && ["maxPrice", `每小时 ${maxPrice.value} 元以内`],
    available.value && ["available", "可预约"],
    onlySaved.value && ["favorites", "已收藏"],
  ].filter(Boolean),
);
function clearFilters() {
  clearTimeout(timer);
  keyword.value = "";
  router.replace({ query: {} });
}
function changeMode(event) {
  setFilters({ mode: event.target.value, category: "", game: "", city: "" });
}
function changeCategory(event) {
  setFilters({
    category: event.target.value,
    game: "",
    ...(event.target.value === "esports" ? { city: "" } : {}),
  });
}
async function load() {
  clearTimeout(timer);
  keyword.value = String(route.query.keyword || "");
  const n = ++request;
  loading.value = true;
  failed.value = false;
  try {
    const result = await api(
      "/providers?" +
        new URLSearchParams({
          page: Math.max(1, Number(route.query.page) || 1),
          game: game.value,
          category: category.value,
          mode: mode.value,
          city: city.value.trim(),
          keyword: String(route.query.keyword || ""),
          sort: sort.value,
          favorites: String(onlySaved.value),
          available: available.value,
          maxPrice: maxPrice.value ? Number(maxPrice.value) * 100 : "",
        }),
      { quiet: true },
    );
    if (n === request) data.value = result;
  } catch {
    if (n === request) failed.value = true;
  } finally {
    if (n === request) loading.value = false;
  }
}
watch(() => route.fullPath, load, { immediate: true });
watch(keyword, () => {
  clearTimeout(timer);
  if (keyword.value === String(route.query.keyword || "")) return;
  timer = setTimeout(() => setFilters({ keyword: keyword.value.trim() }), 300);
});
onUnmounted(() => {
  clearTimeout(timer);
  request++;
});
onMounted(async () => {
  if (site.loaded) loadSite();
  if (auth.user)
    try {
      favorites.value = await api("/favorites");
    } catch {}
});
async function favorite(p) {
  if (!auth.user) {
    router.push({ path: "/login", query: { redirect: route.fullPath } });
    return;
  }
  const saved = !favorites.value.includes(p.id);
  try {
    await api("/favorites/" + p.id, { method: "PUT", body: { saved } });
    favorites.value = saved
      ? [...favorites.value, p.id]
      : favorites.value.filter((x) => x !== p.id);
    notify(saved ? "已收藏" : "已取消收藏");
    if (onlySaved.value) load();
  } catch {}
}
</script>
<template>
  <div class="container page-space marketplace">
    <section class="market-heading">
      <div>
        <span class="eyebrow"><i />MOLI · FIND YOUR TEAMMATE</span>
        <h1>发现陪玩，<span>让快乐同频。</span></h1>
        <p>选你喜欢的游戏，找一位合拍的搭子。服务、价格与档期，看清再预约。</p>
        <div class="market-assurance">
          <span><ShieldCheck :size="14" />入驻审核</span
          ><span><Clock :size="14" />{{ site.booking.minMinutes }}分钟起约</span
          ><span>订单内沟通</span>
        </div>
      </div>
      <aside class="market-journey" aria-label="客户预约流程">
        <span class="eyebrow">YOUR NEXT GOOD GAME</span>
        <ol>
          <li>
            <b>01</b><span>选陪玩<small>看擅长与价格</small></span>
          </li>
          <li>
            <b>02</b><span>约时间<small>选服务与档期</small></span>
          </li>
          <li>
            <b>03</b><span>确认订单<small>付款后等待接单</small></span>
          </li>
        </ol>
        <router-link to="/orders"
          >查看我的订单<ArrowRight :size="15"
        /></router-link>
      </aside>
    </section>
    <section class="catalog-filter panel" aria-label="筛选陪玩">
      <div class="market-search-row">
        <form
          class="catalog-search"
          @submit.prevent="setFilters({ keyword: keyword.trim() })"
        >
          <Search :size="19" /><input
            v-model="keyword"
            placeholder="搜索游戏、昵称或你喜欢的风格"
            aria-label="搜索陪玩"
          /><button type="submit" class="button">
            找陪玩<ArrowRight :size="15" />
          </button>
        </form>
        <router-link to="/players?favorites=true" class="market-saved"
          ><Heart :size="17" />我的收藏</router-link
        >
      </div>

      <div
        v-if="mode !== 'offline' && (!category || category === 'esports')"
        class="market-game-picker"
        aria-label="游戏筛选"
      >
        <button
          :class="{ active: !game }"
          :aria-pressed="!game"
          @click="game = ''"
        >
          <Gamepad2 :size="22" /><span
            >全部游戏<small>按你的喜好出发</small></span
          ></button
        ><button
          v-for="(g, index) in site.games"
          :key="g"
          :class="{ active: game === g }"
          :aria-pressed="game === g"
          :aria-label="g"
          @click="game = g"
        >
          <component :is="gameIcons[index] || Gamepad2" :size="22" /><span
            >{{ g }}<small>{{ gameCount(g) }} 位伙伴</small></span
          >
        </button>
      </div>
      <details
        class="advanced-filters"
        :open="Boolean(mode || category || city)"
      >
        <summary>
          <SlidersHorizontal :size="15" />更多筛选<span
            >方式 / 场景 / 城市</span
          >
        </summary>
        <div class="experience-filter-row">
          <label class="field"
            >服务方式<select :value="mode" @change="changeMode">
              <option value="">线上与线下</option>
              <option value="online">线上服务</option>
              <option value="offline">线下服务</option>
            </select></label
          >
          <label class="field"
            >服务场景<select :value="category" @change="changeCategory">
              <option value="">全部场景</option>
              <option
                v-for="c in site.categories.filter(
                  (c) => !mode || c.mode === mode,
                )"
                :key="c.id"
                :value="c.id"
              >
                {{ c.name }}
              </option>
            </select></label
          >
          <label class="field"
            >服务城市<input
              v-model.lazy="city"
              :disabled="mode === 'online' || category === 'esports'"
              maxlength="50"
              placeholder="线下城市，例如：上海"
          /></label>
        </div>
      </details>
      <div class="filter-row">
        <div class="filter-options">
          <label><input type="checkbox" v-model="available" />只看可预约</label
          ><label v-if="auth.user"
            ><input type="checkbox" v-model="onlySaved" />只看已收藏</label
          ><label
            >预算<select v-model="maxPrice" aria-label="最高每小时预算">
              <option value="">不限</option>
              <option value="50">50元以内 / 小时</option>
              <option value="100">100元以内 / 小时</option>
              <option value="200">200元以内 / 小时</option>
            </select></label
          >
        </div>
        <label class="sort-label"
          >排序<select v-model="sort">
            <option value="recommended">综合推荐</option>
            <option value="popular">完成订单最多</option>
            <option value="rating">评价优先</option>
            <option value="price">价格从低到高</option>
            <option value="newest">最新入驻</option>
          </select></label
        >
      </div>
    </section>
    <p v-if="site.loaded && !site.booking.enabled" class="market-notice">
      <ShieldCheck
        :size="15"
      />在线预约尚未开放，你可以先浏览服务与档期；支付开放后再确认下单。
    </p>
    <div
      v-if="activeFilters.length"
      class="active-filters"
      aria-label="已选筛选条件"
    >
      <span>已选</span
      ><button
        v-for="[key, label] in activeFilters"
        :key="key"
        @click="setFilters({ [key]: '' })"
        :aria-label="'移除筛选：' + label"
      >
        {{ label }}<X :size="13" />
      </button>
      <button class="clear-filters" @click="clearFilters">清除全部</button>
    </div>
    <div class="catalog-count" role="status" aria-live="polite">
      <template v-if="loading">正在寻找合拍的搭子…</template>
      <template v-else-if="failed">加载暂时遇到问题，请重试</template>
      <template v-else
        >{{ onlySaved ? "我的收藏" : "为你发现" }}
        <strong>{{ data.total }}</strong> 位陪玩</template
      ><span>价格公开 · 自选档期 · 真实订单评价</span>
    </div>
    <div v-if="loading" class="provider-grid">
      <div class="skeleton card-skeleton" v-for="i in 6" :key="i" />
    </div>
    <div v-else-if="failed" class="empty-state">
      <h3>暂时无法加载陪玩</h3>
      <button class="button secondary" @click="load()">重新加载</button>
    </div>
    <div v-else-if="!data.items.length" class="empty-state panel">
      <Gamepad2 :size="38" />
      <h3>暂时没有符合条件的搭子</h3>
      <p>
        {{
          onlySaved
            ? "喜欢的陪玩可以先收藏，下次更容易找到。"
            : "试试其他游戏，或调整场景、搜索和预算。"
        }}
      </p>
      <button class="button secondary" @click="clearFilters">
        {{ onlySaved ? "去发现陪玩" : "清除筛选" }}
      </button>
    </div>
    <div v-else class="provider-grid">
      <ProviderCard
        v-for="p in data.items"
        :key="p.id"
        :provider="p"
        :saved="favorites.includes(p.id)"
        @favorite="favorite"
      />
    </div>
    <Pagination
      :page="data.page"
      :total="data.total"
      @change="setFilters({ page: $event }, false)"
    />
    <section class="customer-help-strip">
      <div>
        <ShieldCheck :size="22" /><span
          ><strong>从选择到完成，每一步都有约定。</strong
          ><small
            >先确认服务内容和费用，服务结束后再评价；需要帮助，可关联订单联系客服。</small
          ></span
        >
      </div>
      <router-link to="/help" class="text-link"
        >预约与售后说明<ArrowUpRight :size="16"
      /></router-link>
    </section>
    <aside class="partner-secondary">
      <span>想把擅长变成陪伴？</span
      ><router-link to="/apply"
        >了解陪玩申请<ArrowUpRight :size="14"
      /></router-link>
    </aside>
  </div>
</template>
