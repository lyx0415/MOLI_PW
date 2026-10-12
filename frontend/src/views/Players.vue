<script setup>
import { ref, onMounted, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import {
  Search,
  SlidersHorizontal,
  ArrowUpRight,
  Gamepad2,
} from "lucide-vue-next";
import ProviderCard from "../components/ProviderCard.vue";
import Pagination from "../components/Pagination.vue";
import { api, auth, notify } from "../lib/api.js";
import { site } from "../lib/site.js";
const route = useRoute(),
  router = useRouter(),
  game = ref(String(route.query.game || "")),
  keyword = ref(String(route.query.keyword || "")),
  sort = ref("popular"),
  available = ref(false),
  maxPrice = ref(""),
  onlySaved = ref(false),
  favorites = ref([]),
  data = ref({ items: [], total: 0, page: 1, size: 12 }),
  loading = ref(true),
  failed = ref(false);
let timer,
  request = 0;
async function load(page = 1) {
  const n = ++request;
  loading.value = true;
  failed.value = false;
  try {
    const result = await api(
      "/providers?" +
        new URLSearchParams({
          page,
          game: game.value,
          keyword: keyword.value,
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
watch([game, sort, available, maxPrice, onlySaved], () => load());
watch(keyword, () => {
  clearTimeout(timer);
  timer = setTimeout(() => load(), 300);
});
watch(
  () => route.query.game,
  (value) => (game.value = String(value || "")),
);
onMounted(async () => {
  load();
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
  } catch {}
}
</script>
<template>
  <div class="container page-space">
    <div class="page-heading">
      <div>
        <span class="eyebrow">FIND YOUR PEOPLE</span>
        <h1>找个合拍的游戏搭子。</h1>
        <p>技术、风格、节奏，总有与你同频的人。</p>
      </div>
      <span class="heading-note"
        ><Gamepad2 :size="22" />PLAY WELL. FEEL GOOD.</span
      >
    </div>
    <section class="catalog-filter panel">
      <div class="catalog-search">
        <Search :size="19" /><input
          v-model="keyword"
          placeholder="搜索昵称、风格或介绍"
          aria-label="搜索陪玩"
        /><SlidersHorizontal :size="18" />
      </div>
      <div class="filter-tabs game-filters">
        <button :class="{ active: !game }" @click="game = ''">全部游戏</button
        ><button
          v-for="g in site.games"
          :key="g"
          :class="{ active: game === g }"
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
    <div class="catalog-count">
      发现 <strong>{{ data.total }}</strong> 位陪玩<span
        >评价与订单数据来自已完成的服务</span
      >
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
      <p>试试其他游戏，或调整搜索和预算。</p>
      <button
        class="button secondary"
        @click="
          game = '';
          keyword = '';
          maxPrice = '';
          available = false;
          onlySaved = false;
        "
      >
        清除筛选
      </button>
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
    <Pagination :page="data.page" :total="data.total" @change="load" />
    <div class="catalog-join">
      <p>你也是一位有温度的游戏高手？</p>
      <router-link to="/apply" class="text-link"
        >加入茉莉，成为陪玩<ArrowUpRight :size="17"
      /></router-link>
    </div>
  </div>
</template>
