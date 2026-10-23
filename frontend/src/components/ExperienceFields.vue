<script setup>
import { computed } from "vue";
import { site } from "../lib/site.js";
const form = defineModel({ required: true });
const offline = computed(
  () => form.value.category && form.value.category !== "esports",
);
</script>
<template>
  <label class="field"
    >服务场景<select v-model="form.category">
      <option v-for="c in site.categories" :key="c.id" :value="c.id">
        {{ c.name }} · {{ c.mode === "online" ? "线上" : "线下" }}
      </option>
    </select></label
  >
  <template v-if="offline">
    <div class="form-grid">
      <label class="field"
        >服务城市<input
          v-model="form.city"
          required
          maxlength="50"
          placeholder="例如：上海（统一填写城市名）"
      /></label>
      <label class="field"
        >服务场所<input
          v-model="form.venue"
          required
          maxlength="200"
          placeholder="公开营业场所名称及地址"
      /></label>
    </div>
    <label class="field"
      >场地与额外费用说明<textarea
        v-model="form.feeNote"
        required
        maxlength="500"
        rows="3"
        placeholder="说明小时价包含什么；场地、设备、包厢等是否另付、由谁支付。无额外费用也请明确填写。"
      />
    </label>
    <p class="field-hint">
      场所与费用说明会公开展示，请勿填写住址或私人联系方式。线下服务每次保存后须重新审核；多个场所请分别创建服务。
    </p>
  </template>
</template>
