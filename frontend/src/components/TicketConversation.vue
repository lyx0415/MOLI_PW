<script setup>
import { ref, watch, onUnmounted } from "vue";
import { api, datetime, notify, statusLabels } from "../lib/api.js";
import Pagination from "./Pagination.vue";
const props = defineProps({
  ticket: Object,
  staff: Boolean,
  base: { type: String, default: "/tickets" },
});
const emit = defineEmits(["updated"]);
const data = ref(null),
  content = ref(""),
  status = ref("open"),
  busy = ref(false),
  failed = ref(false);
let requestNumber = 0;
async function load(page = 1) {
  const current = ++requestNumber;
  try {
    const result = await api(
      `${props.base}/${props.ticket.id}/messages?page=${page}`,
    );
    if (current !== requestNumber) return;
    data.value = result;
    status.value = result.ticket.status;
    failed.value = false;
  } catch {
    if (current === requestNumber) failed.value = true;
  }
}
watch(
  () => props.ticket.id,
  () => {
    data.value = null;
    content.value = "";
    load();
  },
  { immediate: true },
);
onUnmounted(() => {
  requestNumber++;
});
async function submit() {
  if (!data.value || busy.value) return;
  busy.value = true;
  try {
    await api(
      `${props.base}/${props.ticket.id}${props.staff ? "" : "/messages"}`,
      {
        method: props.staff ? "PUT" : "POST",
        body: props.staff
          ? {
              reply: content.value,
              status: status.value,
              updatedAt: data.value.ticket.updated_at,
            }
          : { content: content.value, updatedAt: data.value.ticket.updated_at },
      },
    );
    content.value = "";
    notify(props.staff ? "工单处理已保存" : "追问已发送");
    await load();
    emit("updated");
  } catch (error) {
    if (error.status === 409) await load();
  } finally {
    busy.value = false;
  }
}
</script>
<template>
  <section class="panel section-panel" aria-label="工单沟通记录">
    <div class="section-top">
      <h3>沟通记录</h3>
      <button class="text-button" :disabled="busy" @click="load()">
        刷新记录
      </button>
    </div>
    <p v-if="failed" class="alert error">记录加载失败，请刷新后重试。</p>
    <template v-else-if="data">
      <div v-if="data.order" class="alert">
        <strong>关联预约：{{ data.order.title }}</strong>
        <p>
          {{ data.order.order_no }} · {{ datetime(data.order.start_at) }} ·
          {{ statusLabels[data.order.status] }}
        </p>
        <template v-if="data.order.experience?.mode === 'offline'"
          ><p>
            预约场所：{{ data.order.experience.city }} ·
            {{ data.order.experience.venue }}
          </p>
          <p>服务说明：{{ data.order.experience.description }}</p>
          <p>费用说明：{{ data.order.experience.feeNote }}</p></template
        >
      </div>
      <p v-if="!data.items.length" class="empty-inline">暂无回复。</p>
      <article v-for="m in data.items" :key="m.id" class="ticket-reply">
        <strong
          >{{
            ["support", "admin"].includes(m.author_role)
              ? "客服回复"
              : "用户追问"
          }}
          · {{ m.name || "运营团队" }}</strong
        >
        <p style="white-space: pre-wrap; overflow-wrap: anywhere">
          {{ m.content }}
        </p>
        <small>{{ datetime(m.created_at) }}</small>
      </article>
      <Pagination
        :page="data.page"
        :size="data.size"
        :total="data.total"
        @change="load"
      />
      <form @submit.prevent="submit">
        <label class="field"
          >{{ staff ? "客服回复" : "补充情况" }}
          <textarea
            v-model="content"
            rows="3"
            minlength="3"
            maxlength="3000"
            required
            :disabled="busy"
          />
        </label>
        <label v-if="staff" class="field"
          >处理状态
          <select v-model="status" :disabled="busy">
            <option value="open">继续处理中</option>
            <option value="resolved">已解决</option>
          </select>
        </label>
        <p v-else class="field-hint">
          补充情况后，已解决工单会重新进入处理队列。
        </p>
        <button class="button" :disabled="busy">
          {{ busy ? "正在提交" : staff ? "保存回复" : "发送追问" }}
        </button>
      </form>
    </template>
    <p v-else>正在加载记录…</p>
  </section>
</template>
