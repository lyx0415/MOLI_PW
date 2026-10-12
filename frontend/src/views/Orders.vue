<script setup>
import { ref, onMounted, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { ArrowUpRight, PackageOpen } from "lucide-vue-next";
import { api, money, datetime, statusLabels } from "../lib/api.js";
import Pagination from "../components/Pagination.vue";
const route = useRoute(),
  router = useRouter(),
  status = ref(String(route.query.status || "")),
  data = ref({ items: [], total: 0, page: 1, size: 12 }),
  loading = ref(false),
  failed = ref(false);
const filters = [
  ["", "全部订单"],
  ["awaiting_payment", "待付款"],
  ["paid", "待接单"],
  ["accepted", "已接单"],
  ["in_service", "服务中"],
  ["awaiting_confirmation", "待确认"],
  ["completed", "已完成"],
  ["refund_pending", "退款中"],
];
async function load(page = 1) {
  loading.value = true;
  failed.value = false;
  try {
    data.value = await api(
      "/orders?" + new URLSearchParams({ page, status: status.value }),
    );
    router.replace({ query: status.value ? { status: status.value } : {} });
  } catch {
    failed.value = true;
  } finally {
    loading.value = false;
  }
}
watch(status, () => load());
onMounted(() => load());
</script>
<template>
  <div class="container page-space">
    <div class="page-heading">
      <div>
        <span class="eyebrow">YOUR PLAYTIME</span>
        <h1>我的订单</h1>
        <p>每一次预约，每一段好时光，都在这里。</p>
      </div>
      <router-link to="/players" class="button secondary"
        >再找个搭子<ArrowUpRight :size="17"
      /></router-link>
    </div>
    <div class="filter-tabs">
      <button
        v-for="[value, label] in filters"
        :key="value"
        :class="{ active: status === value }"
        @click="status = value"
      >
        {{ label }}
      </button>
    </div>
    <div v-if="loading" class="skeleton list-skeleton" />
    <div v-else-if="failed" class="empty-state">
      <h3>订单加载失败</h3>
      <button class="button secondary" @click="load()">重新加载</button>
    </div>
    <div v-else-if="!data.items.length" class="empty-state panel">
      <PackageOpen :size="38" />
      <h3>这里还没有订单</h3>
      <p>发现合拍的陪玩，预约下一场快乐。</p>
      <router-link to="/players" class="button">去发现陪玩</router-link>
    </div>
    <div v-else class="orders-list">
      <router-link
        v-for="o in data.items"
        :key="o.id"
        :to="'/orders/' + o.id"
        class="order-row panel"
        ><div class="order-icon">{{ o.nickname.slice(0, 1) }}</div>
        <div class="order-main">
          <span class="subtle small">{{ o.order_no }}</span>
          <h3>{{ o.title }}</h3>
          <p>
            {{ o.nickname }} · {{ datetime(o.start_at) }} ·
            {{ o.duration_minutes }}分钟
          </p>
        </div>
        <span class="status-pill" :class="o.status">{{
          statusLabels[o.status]
        }}</span
        ><strong>{{ money(o.amount_cents) }}</strong
        ><ArrowUpRight :size="20"
      /></router-link>
    </div>
    <Pagination :page="data.page" :total="data.total" @change="load" />
  </div>
</template>
