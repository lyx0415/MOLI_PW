<script setup>
import { ref, watch, onMounted, onUnmounted } from "vue";
import { api, datetime } from "../lib/api.js";
import Pagination from "../components/Pagination.vue";
import TicketConversation from "../components/TicketConversation.vue";
const data = ref({ items: [], page: 1, total: 0, size: 12 }),
  status = ref("open"),
  selected = ref(null),
  loading = ref(false),
  failed = ref(false);
let requestNumber = 0;
async function load(page = 1) {
  const current = ++requestNumber;
  loading.value = true;
  failed.value = false;
  try {
    const result = await api(
      "/support/tickets?" + new URLSearchParams({ page, status: status.value }),
    );
    if (current === requestNumber) {
      data.value = result;
      if (!result.items.some((ticket) => ticket.id === selected.value?.id))
        selected.value = null;
    }
  } catch {
    if (current === requestNumber) failed.value = true;
  } finally {
    if (current === requestNumber) loading.value = false;
  }
}
watch(status, () => {
  selected.value = null;
  load();
});
onMounted(() => load());
onUnmounted(() => {
  requestNumber++;
});
</script>
<template>
  <div class="container page-space narrow">
    <div class="page-heading">
      <div>
        <span class="eyebrow">MOLI SUPPORT</span>
        <h1>客服工作台</h1>
        <p>跟进客户与陪玩的诉求，保留每一次沟通。</p>
      </div>
      <button
        class="button secondary"
        :disabled="loading"
        @click="load(data.page)"
      >
        刷新工单
      </button>
    </div>
    <div class="filter-tabs">
      <button
        v-for="[value, label] in [
          ['open', '处理中'],
          ['resolved', '已解决'],
          ['', '全部工单'],
        ]"
        :key="value"
        :class="{ active: status === value }"
        @click="status = value"
      >
        {{ label }}
      </button>
    </div>
    <p v-if="failed" class="alert error">工单加载失败，请刷新后重试。</p>
    <p v-else-if="!loading && !data.items.length" class="empty-state panel">
      当前没有工单。
    </p>
    <article
      v-for="t in data.items"
      :key="t.id"
      class="ticket panel section-panel"
    >
      <div>
        <strong>{{ t.subject }}</strong
        ><span class="status-pill">{{
          t.status === "open" ? "处理中" : "已解决"
        }}</span>
      </div>
      <p style="overflow-wrap: anywhere">{{ t.content }}</p>
      <small>{{ t.name }} · {{ t.email }} · {{ datetime(t.updated_at) }}</small>
      <p v-if="t.order_id" class="field-hint">
        关联订单编号：{{ t.order_id }}。资金处理请转交管理员。
      </p>
      <button
        class="button secondary"
        :disabled="loading"
        @click="selected = selected?.id === t.id ? null : t"
      >
        {{ selected?.id === t.id ? "收起记录" : "处理工单" }}
      </button>
      <TicketConversation
        v-if="selected?.id === t.id"
        :ticket="t"
        staff
        base="/support/tickets"
        @updated="load(data.page)"
      />
    </article>
    <Pagination
      :page="data.page"
      :size="data.size"
      :total="data.total"
      @change="load"
    />
  </div>
</template>
