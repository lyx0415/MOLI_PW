<script setup>
import { computed, ref, onMounted, onUnmounted, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import {
  Search,
  SlidersHorizontal,
  ArrowUpRight,
  Gamepad2,
  X,
} from "lucide-vue-next";
import ProviderCard from "../components/ProviderCard.vue";
import Pagination from "../components/Pagination.vue";
import { api, auth, notify } from "../lib/api.js";
import { site } from "../lib/site.js";
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
  sort = textFilter("sort", "popular"),
  maxPrice = textFilter("maxPrice"),
  available = computed({
    get: () => route.query.available === "true",
    set: (value) => setFilters({ available: value ? "true" : undefined }),
  }),
  onlySaved = computed({
    get: () => Boolean(auth.user) && route.query.favorites === "true",
    set: (value) => setFilters({ favorites: value ? "true" : undefined }),
  });
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
  <div class="container page-space">
    <div class="page-heading">
      <div>
        <span class="eyebrow">FIND YOUR PEOPLE</span>
        <h1>找个合拍的搭子。</h1>
        <p>线上开黑，线下相聚。按场景、城市与节奏找到同频的人。</p>
      </div>
      <span class="heading-note"
        ><Gamepad2 :size="22" />PLAY WELL. FEEL GOOD.</span
      >
    </div>
    <section class="catalog-filter panel" aria-label="筛选陪玩">
      <div class="filter-heading">
        <span><SlidersHorizontal :size="16" />找到你的同频</span
        ><small>按场景、预算与偏好筛选</small>
      </div>
      <div class="catalog-search">
        <Search :size="19" /><input
          v-model="keyword"
          placeholder="搜索昵称、风格或介绍"
          aria-label="搜索陪玩"
        /><SlidersHorizontal :size="18" />
      </div>
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
      <div
        v-if="mode !== 'offline' && (!category || category === 'esports')"
        class="filter-tabs game-filters"
        aria-label="游戏筛选"
      >
        <button
          :class="{ active: !game }"
          :aria-pressed="!game"
          @click="game = ''"
        >
          全部游戏</button
        ><button
          v-for="g in site.games"
          :key="g"
          :class="{ active: game === g }"
          :aria-pressed="game === g"
          @click="game = g"
        >
          {{ g }}
        </button>
      </div>
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
            <option value="popular">完成订单最多</option>
            <option value="rating">评价优先</option>
            <option value="price">价格从低到高</option>
            <option value="newest">最新入驻</option>
          </select></label
        >
      </div>
    </section>
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
        >发现 <strong>{{ data.total }}</strong> 位陪玩</template
      ><span>评价与订单数据来自已完成的服务</span>
    </div>
    <div v-if="loading" class="provider-grid">
      <div class="skeleton card-skeleton" v-for="i in 6" :key="i" />
    </div>
    <div v-else-if="failed" class="empty-state">
      <h3>暂时无法加载陪玩</h3>
      <button class="button secondary" @click="load()">重新加载</button>
    </div>
    <div
      v-else-if="
        !data.items.filter((p) => !onlySaved || favorites.includes(p.id)).length
      "
      class="empty-state panel"
    >
      <Gamepad2 :size="38" />
      <h3>暂时没有符合条件的搭子</h3>
      <p>试试其他场景或城市，或调整搜索和预算。</p>
      <button class="button secondary" @click="clearFilters">清除筛选</button>
    </div>
    <div v-else class="provider-grid">
      <ProviderCard
        v-for="p in data.items.filter(
          (p) => !onlySaved || favorites.includes(p.id),
        )"
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
    <div class="catalog-join">
      <p>你也是一位有温度的游戏高手？</p>
      <router-link to="/apply" class="text-link"
        >加入茉莉，成为陪玩<ArrowUpRight :size="17"
      /></router-link>
    </div>
  </div>
</template>
