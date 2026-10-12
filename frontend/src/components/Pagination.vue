<script setup>
defineProps({
  page: Number,
  total: Number,
  size: { type: Number, default: 12 },
});
defineEmits(["change"]);
</script>
<template>
  <nav class="pagination" aria-label="分页" v-if="total > size">
    <button
      class="button secondary"
      :disabled="page <= 1"
      @click="$emit('change', page - 1)"
    >
      上一页</button
    ><span>{{ page }} / {{ Math.ceil(total / size) }}</span
    ><button
      class="button secondary"
      :disabled="page * size >= total"
      @click="$emit('change', page + 1)"
    >
      下一页
    </button>
  </nav>
</template>
