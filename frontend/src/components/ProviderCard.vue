<script setup>
import { computed } from "vue";
import { useRoute } from "vue-router";
import { Star, Heart, ArrowUpRight, Gamepad2, MapPin } from "lucide-vue-next";
import AvatarArt from "./AvatarArt.vue";
import { money } from "../lib/api.js";
const props = defineProps({ provider: Object, saved: Boolean });
const route = useRoute();
const detailLink = computed(() => ({
  path: "/players/" + props.provider.id,
  query: { service: props.provider.services?.[0]?.id, from: route.fullPath },
}));
defineEmits(["favorite"]);
</script>
<template>
  <article class="provider-card">
    <router-link
      :to="detailLink"
      class="portrait-link"
      :aria-label="'查看' + provider.nickname + '的主页'"
      ><AvatarArt :name="provider.nickname" :theme="provider.theme" /><span
        class="availability-pill"
        :class="{ paused: !provider.accepting }"
        ><i />{{ provider.accepting ? "可预约" : "休息中" }}</span
      ></router-link
    ><button
      class="favorite-btn"
      :class="{ saved }"
      :aria-label="(saved ? '取消收藏' : '收藏') + provider.nickname"
      :aria-pressed="saved"
      @click="$emit('favorite', provider)"
    >
      <Heart :size="17" />
    </button>
    <div class="provider-body">
      <div class="card-title">
        <router-link :to="detailLink">{{ provider.nickname }}</router-link
        ><span v-if="provider.rating" class="rating"
          ><Star :size="13" fill="currentColor" />{{ provider.rating.toFixed(1)
          }}<small>({{ provider.review_count }})</small></span
        ><span v-else class="subtle small">新入驻</span>
      </div>
      <p class="provider-skill">
        <component
          :is="
            provider.services?.[0]?.category &&
            provider.services[0].category !== 'esports'
              ? MapPin
              : Gamepad2
          "
          :size="14"
        />{{ provider.services?.[0]?.game }}<span>·</span
        >{{ provider.services?.[0]?.skill }}
      </p>
      <p class="provider-summary">
        {{ provider.services?.[0]?.description || provider.bio }}
      </p>
      <p
        v-if="
          provider.services?.[0]?.category &&
          provider.services[0].category !== 'esports'
        "
        class="small subtle"
      >
        线下 · {{ provider.services[0].service_city }}
      </p>
      <div class="tags">
        <span v-for="tag in provider.tags" :key="tag">{{ tag }}</span>
      </div>
      <div class="card-bottom">
        <span
          ><strong>{{ money(provider.min_rate_cents) }}</strong
          ><small>/ 小时起</small></span
        ><router-link
          :to="detailLink"
          class="card-arrow"
          :aria-label="'预约' + provider.nickname"
          >选服务<ArrowUpRight :size="16"
        /></router-link>
      </div>
    </div>
  </article>
</template>
