<script setup>
import { computed } from "vue";
const props = defineProps({
  name: String,
  theme: { type: String, default: "sage" },
  large: Boolean,
});
const palette = computed(
  () =>
    ({
      sage: ["#dbe5d5", "#314d3c", "#c4d6b1"],
      peach: ["#f4dfd6", "#9f584d", "#edc2a9"],
      lavender: ["#e6dff1", "#655079", "#c9badd"],
      sky: ["#dce7f0", "#42657c", "#b6cddd"],
      sand: ["#eee5cf", "#8a7654", "#d8c7a1"],
      mint: ["#dceae2", "#466c59", "#b9d7c5"],
    })[props.theme] || ["#dbe5d5", "#314d3c", "#c4d6b1"],
);
</script>
<template>
  <div
    class="avatar-art"
    :class="[theme, { large }]"
    :style="{ '--portrait-bg': palette[0], '--portrait-ink': palette[1] }"
  >
    <svg viewBox="0 0 300 260" aria-hidden="true">
      <circle cx="245" cy="25" r="140" :fill="palette[2]" opacity=".5" />
      <circle
        cx="58"
        cy="212"
        r="90"
        fill="none"
        :stroke="palette[1]"
        stroke-width="1"
        opacity=".18"
      />
      <path
        d="M-30 170 Q90 120 150 177 T340 166"
        fill="none"
        :stroke="palette[1]"
        opacity=".2"
      />
      <path
        d="M76 258 C68 190 94 172 150 170 C206 172 232 190 224 258"
        :fill="palette[1]"
      />
      <rect x="132" y="151" width="36" height="47" rx="18" fill="#ecd3be" />
      <ellipse cx="150" cy="117" rx="51" ry="63" fill="#f5dfc9" />
      <path
        d="M99 128 C80 60 106 38 152 40 C201 43 212 68 201 134 L194 99 C170 106 146 83 131 77 C126 97 111 102 106 106 Z"
        :fill="palette[1]"
      />
      <circle cx="130" cy="125" r="3" :fill="palette[1]" />
      <circle cx="171" cy="125" r="3" :fill="palette[1]" />
      <path
        d="M143 149 Q151 155 160 149"
        fill="none"
        :stroke="palette[1]"
        stroke-width="2"
        stroke-linecap="round"
      />
      <path
        d="M98 127 Q81 139 100 155 M200 127 Q216 139 199 155"
        fill="none"
        :stroke="palette[1]"
        stroke-width="8"
      />
      <path
        d="M93 120 C79 40 220 37 208 120"
        fill="none"
        :stroke="palette[1]"
        stroke-width="6"
      />
      <path
        d="M209 146 Q203 169 178 169"
        fill="none"
        :stroke="palette[1]"
        stroke-width="4"
      />
      <circle cx="176" cy="169" r="4" :fill="palette[1]" />
      <path
        d="m233 192 7-17 7 17 17 7-17 7-7 17-7-17-17-7Z"
        fill="#f7f5ee"
        opacity=".85"
      /></svg
    ><span class="portrait-caption">{{ name }} <span>PLAY TOGETHER</span></span>
  </div>
</template>
