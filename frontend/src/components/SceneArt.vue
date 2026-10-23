<script setup>
import {
  Gamepad2,
  Dumbbell,
  Mic2,
  Dices,
  Crown,
  Monitor,
} from "lucide-vue-next";
defineProps({ category: { type: String, default: "esports" } });
const icons = {
  esports: Gamepad2,
  "offline-gaming": Monitor,
  fitness: Dumbbell,
  ktv: Mic2,
  boardgames: Dices,
  chess: Crown,
};
</script>
<template>
  <div class="scene-art" :class="'scene-' + category" aria-hidden="true">
    <span class="scene-orbit" /><span class="scene-spark">✦</span
    ><component
      :is="icons[category] || Gamepad2"
      :size="66"
      :stroke-width="1.3"
    /><span class="scene-dot" />
  </div>
</template>
