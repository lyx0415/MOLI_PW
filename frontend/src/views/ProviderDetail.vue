<script setup>
import { ref, computed, onMounted, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import {
  ArrowLeft,
  Star,
  ShieldCheck,
  Clock,
  MapPin,
  Heart,
  ArrowUpRight,
} from "lucide-vue-next";
import AvatarArt from "../components/AvatarArt.vue";
import { api, auth, money, datetime, weekdays, notify } from "../lib/api.js";
const route = useRoute(),
  router = useRouter(),
  p = ref(null),
  failed = ref(false),
  loading = ref(true),
  saving = ref(false),
  saved = ref(false),
  channels = ref([]);
const selected = ref(""),
  date = ref(""),
  time = ref(""),
  duration = ref(60),
  contact = ref(""),
  note = ref("");
const service = computed(() =>
  p.value?.services.find((s) => s.id === selected.value),
);
const minDate = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Shanghai",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(new Date());
const timeOptions = computed(() => {
  if (!date.value || !p.value) return [];
  const weekday = new Date(date.value + "T12:00:00+08:00").getUTCDay(),
    result = [];
  for (const s of p.value.availability.filter((s) => s.weekday === weekday))
    for (let m = s.start_minute; m + duration.value <= s.end_minute; m += 30) {
      const t =
        String(Math.floor(m / 60)).padStart(2, "0") +
        ":" +
        String(m % 60).padStart(2, "0");
      if (
        new Date(date.value + "T" + t + ":00+08:00").getTime() >
        Date.now() + 1800000
      )
        result.push(t);
    }
  return result;
});
watch(timeOptions, (options) => {
  if (!options.includes(time.value)) time.value = options[0] || "";
});
async function load() {
  loading.value = true;
  failed.value = false;
  try {
    p.value = await api("/providers/" + route.params.id);
    channels.value = await api("/payments/channels");
    selected.value = p.value.services[0]?.id || "";
    if (auth.user) saved.value = (await api("/favorites")).includes(p.value.id);
  } catch {
    failed.value = true;
  } finally {
    loading.value = false;
  }
}
onMounted(load);
watch(() => route.params.id, load);
async function favorite() {
  if (!auth.user) {
    router.push({ path: "/login", query: { redirect: route.fullPath } });
    return;
  }
  try {
    await api("/favorites/" + p.value.id, {
      method: "PUT",
      body: { saved: !saved.value },
    });
    saved.value = !saved.value;
    notify(saved.value ? "已收藏" : "已取消收藏");
  } catch {}
}
async function book() {
  if (!auth.user) {
    router.push({ path: "/login", query: { redirect: route.fullPath } });
    return;
  }
  saving.value = true;
  try {
    const o = await api("/orders", {
      method: "POST",
      body: {
        serviceId: selected.value,
        startAt: new Date(
          date.value + "T" + time.value + ":00+08:00",
        ).toISOString(),
        durationMinutes: duration.value,
        contact: contact.value,
        note: note.value,
      },
    });
    router.push("/orders/" + o.id);
    notify("预约已创建，请完成付款");
  } catch {
  } finally {
    saving.value = false;
  }
}
</script>
<template>
  <div class="container page-space">
    <router-link to="/players" class="back-link"
      ><ArrowLeft :size="16" />返回发现陪玩</router-link
    >
    <div v-if="loading" class="skeleton detail-skeleton" />
    <div v-else-if="failed" class="empty-state">
      <h2>暂时无法打开这个主页</h2>
      <button class="button secondary" @click="load">重新加载</button>
    </div>
    <div v-else class="detail-grid">
      <div>
        <section class="profile-hero panel">
          <AvatarArt :name="p.nickname" :theme="p.theme" large />
          <div class="profile-heading">
            <div>
              <span class="eyebrow">YOUR NEXT TEAMMATE</span>
              <h1>
                {{ p.nickname
                }}<span class="availability-pill inline"
                  ><i />{{ p.accepting ? "可预约" : "休息中" }}</span
                >
              </h1>
            </div>
            <button
              class="icon-button bordered"
              :aria-label="saved ? '取消收藏' : '收藏陪玩'"
              :aria-pressed="saved"
              @click="favorite"
            >
              <Heart :size="20" :fill="saved ? 'currentColor' : 'none'" />
            </button>
          </div>
          <div class="profile-facts">
            <span><ShieldCheck :size="16" />已通过入驻审核</span
            ><span v-if="p.city"><MapPin :size="16" />{{ p.city }}</span
            ><span
              ><Star :size="16" />{{
                p.rating
                  ? p.rating.toFixed(1) + " 分 · " + p.review_count + " 条评价"
                  : "暂无评价"
              }}</span
            ><span>{{ p.completed_count }} 单完成</span>
          </div>
          <div class="tags">
            <span v-for="tag in p.tags" :key="tag">{{ tag }}</span>
          </div>
          <p class="profile-bio">{{ p.bio }}</p>
        </section>
        <section class="panel section-panel">
          <h2>一起玩什么</h2>
          <div
            v-for="s in p.services"
            :key="s.id"
            class="service-option"
            :class="{ selected: selected === s.id }"
          >
            <label
              ><input
                type="radio"
                v-model="selected"
                :value="s.id"
                name="service"
              /><span
                ><strong>{{ s.title }}</strong
                ><small>{{ s.game }} · {{ s.skill }}</small>
                <p>{{ s.description }}</p></span
              ><b>{{ money(s.rate_cents) }}<small>/小时</small></b></label
            >
          </div>
          <p v-if="!p.services.length" class="subtle">该陪玩暂未上架服务。</p>
        </section>
        <section class="panel section-panel">
          <h2>可预约档期 <small>北京时间</small></h2>
          <div class="schedule-lines">
            <span v-for="(s, i) in p.availability" :key="i"
              >{{ weekdays[s.weekday]
              }}<b
                >{{
                  String(Math.floor(s.start_minute / 60)).padStart(2, "0")
                }}:{{ String(s.start_minute % 60).padStart(2, "0") }} —
                {{ String(Math.floor(s.end_minute / 60)).padStart(2, "0") }}:{{
                  String(s.end_minute % 60).padStart(2, "0")
                }}</b
              ></span
            >
          </div>
          <p v-if="!p.availability.length" class="subtle">陪玩尚未开放档期。</p>
        </section>
        <section class="panel section-panel">
          <h2>真实订单评价</h2>
          <div v-if="!p.reviews.length" class="empty-inline">
            新的默契，等待你来留下第一条评价。
          </div>
          <article v-for="(r, i) in p.reviews" :key="i" class="review">
            <span class="rating"
              >{{ "★".repeat(r.rating)
              }}<small>{{ datetime(r.created_at) }} · 已完成订单</small></span
            >
            <p>{{ r.content }}</p>
          </article>
        </section>
      </div>
      <aside>
        <form class="booking-panel panel" @submit.prevent="book">
          <span class="eyebrow">BOOK A GOOD TIME</span>
          <h2>预约一段好时光</h2>
          <p class="subtle">{{ service?.title || "请选择服务" }}</p>
          <label class="field"
            >日期<input required type="date" v-model="date" :min="minDate"
          /></label>
          <div class="form-grid">
            <label class="field"
              >服务时长<select v-model="duration">
                <option :value="30">30分钟</option>
                <option :value="60">1小时</option>
                <option :value="90">1.5小时</option>
                <option :value="120">2小时</option>
                <option :value="180">3小时</option>
                <option :value="240">4小时</option>
              </select></label
            ><label class="field"
              >开始时间<select
                v-model="time"
                required
                :disabled="!timeOptions.length"
              >
                <option value="" disabled>选择时间</option>
                <option v-for="t in timeOptions" :key="t">{{ t }}</option>
              </select></label
            >
          </div>
          <p v-if="date && !timeOptions.length" class="field-hint">
            此日期没有可预约的时间，请选择其他日期。
          </p>
          <label class="field"
            >游戏ID / 联系方式<input
              v-model="contact"
              required
              maxlength="120"
              placeholder="用于接单后联系，只对订单参与者可见" /></label
          ><label class="field"
            >想对陪玩说的话 <small>选填</small
            ><textarea
              v-model="note"
              maxlength="500"
              rows="3"
              placeholder="例如：想练辅助，轻松娱乐就好"
            />
          </label>
          <div class="booking-total">
            <span>预计应付</span
            ><strong>{{
              money(((service?.rate_cents || 0) * duration) / 60)
            }}</strong>
          </div>
          <button
            class="button full"
            :disabled="
              saving || !selected || !time || !p.accepting || !channels.length
            "
          >
            {{
              saving
                ? "正在预约"
                : !p.accepting
                  ? "陪玩休息中"
                  : !channels.length
                    ? "预约暂未开放"
                    : "确认预约"
            }}<ArrowUpRight :size="18" />
          </button>
          <p class="field-hint">
            订单创建后15分钟内付款。退款与取消按<router-link to="/legal/refund"
              >服务规则</router-link
            >处理，具体结果以订单页面为准。
          </p>
        </form>
        <div class="booking-reassurance">
          <ShieldCheck :size="20" />
          <div>
            <strong>明晰规则，安心开黑</strong>
            <p>有疑问可在帮助中心联系客服。请勿私下转账。</p>
          </div>
        </div>
      </aside>
    </div>
  </div>
</template>
