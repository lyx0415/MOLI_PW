<script setup>
import { ref, computed, onMounted } from "vue";
import { useRouter } from "vue-router";
import {
  LayoutDashboard,
  Gamepad2,
  CalendarDays,
  Wallet,
  UserRound,
  ClipboardList,
  Plus,
  ArrowUpRight,
  RefreshCw,
} from "lucide-vue-next";
import AvatarArt from "../components/AvatarArt.vue";
import Pagination from "../components/Pagination.vue";
import {
  api,
  auth,
  money,
  datetime,
  statusLabels,
  weekdays,
  notify,
} from "../lib/api.js";
import ExperienceFields from "../components/ExperienceFields.vue";
import { site } from "../lib/site.js";
const router = useRouter(),
  tab = ref("overview"),
  data = ref(null),
  loading = ref(true),
  failed = ref(false),
  busy = ref(false),
  orders = ref({ items: [], total: 0, page: 1 }),
  serviceDialog = ref(),
  payoutDialog = ref(),
  serviceId = ref(""),
  serviceForm = ref({}),
  profile = ref({}),
  schedule = ref([]),
  payout = ref(10);
const tabs = [
  ["overview", "工作台总览", LayoutDashboard],
  ["orders", "接单订单", ClipboardList],
  ["services", "服务项目", Gamepad2],
  ["schedule", "档期设置", CalendarDays],
  ["profile", "个人主页", UserRound],
  ["earnings", "收入结算", Wallet],
];
const hours = Array.from(
  { length: 49 },
  (_, i) =>
    String(Math.floor(i / 2)).padStart(2, "0") + ":" + (i % 2 ? "30" : "00"),
);
const minute = (s) => Number(s.split(":")[0]) * 60 + Number(s.split(":")[1]);
const time = (m) =>
  String(Math.floor(m / 60)).padStart(2, "0") +
  ":" +
  String(m % 60).padStart(2, "0");
async function load() {
  loading.value = true;
  failed.value = false;
  try {
    data.value = await api("/provider/dashboard");
    profile.value = {
      ...data.value.provider,
      tagsText: data.value.provider.tags.join(","),
    };
    schedule.value = weekdays.map((_, day) => {
      const s = data.value.availability.find((s) => s.weekday === day);
      return {
        day,
        enabled: Boolean(s),
        start: s ? time(s.start_minute) : "18:00",
        end: s ? time(s.end_minute) : "23:00",
      };
    });
    await loadOrders();
  } catch {
    failed.value = true;
  } finally {
    loading.value = false;
  }
}
async function loadOrders(page = 1) {
  try {
    orders.value = await api("/orders?scope=provider&page=" + page);
  } catch {}
}
onMounted(load);
function editService(s) {
  serviceId.value = s?.id || "";
  serviceForm.value = s
    ? {
        category: s.category || "esports",
        city: s.service_city || "",
        venue: s.venue || "",
        feeNote: s.fee_note || "",
        game: s.category && s.category !== "esports" ? "英雄联盟" : s.game,
        title: s.title,
        skill: s.skill,
        rate: s.rate_cents / 100,
        description: s.description,
        active: Boolean(s.requested_active ?? s.active),
      }
    : {
        category: "esports",
        city: "",
        venue: "",
        feeNote: "",
        game: "英雄联盟",
        title: "",
        skill: "",
        rate: 50,
        description: "",
        active: true,
      };
  serviceDialog.value.showModal();
}
async function saveService() {
  busy.value = true;
  try {
    const f = serviceForm.value;
    await api(
      "/provider/services" + (serviceId.value ? "/" + serviceId.value : ""),
      {
        method: serviceId.value ? "PUT" : "POST",
        body: {
          category: f.category,
          city: f.city,
          venue: f.venue,
          feeNote: f.feeNote,
          game: f.game,
          title: f.title,
          skill: f.skill,
          rateCents: Math.round(Number(f.rate) * 100),
          description: f.description,
          active: f.active,
        },
      },
    );
    serviceDialog.value.close();
    notify("服务已保存");
    await load();
  } catch {
  } finally {
    busy.value = false;
  }
}
async function saveSchedule() {
  busy.value = true;
  try {
    await api("/provider/availability", {
      method: "PUT",
      body: schedule.value
        .filter((s) => s.enabled)
        .map((s) => ({
          weekday: s.day,
          startMinute: minute(s.start),
          endMinute: minute(s.end),
        })),
    });
    notify("档期已更新");
    await load();
  } catch {
  } finally {
    busy.value = false;
  }
}
async function saveProfile() {
  busy.value = true;
  try {
    const p = profile.value;
    await api("/provider/profile", {
      method: "PATCH",
      body: {
        nickname: p.nickname,
        bio: p.bio,
        city: p.city,
        theme: p.theme,
        tags: p.tagsText
          .split(/[,，]/)
          .map((x) => x.trim())
          .filter(Boolean),
        accepting: Boolean(p.accepting),
      },
    });
    notify("主页已更新");
    await load();
  } catch {
  } finally {
    busy.value = false;
  }
}
async function requestPayout() {
  busy.value = true;
  try {
    await api("/provider/payouts", {
      method: "POST",
      body: { amountCents: Math.round(Number(payout.value) * 100) },
    });
    payoutDialog.value.close();
    notify("结算申请已提交");
    await load();
  } catch {
  } finally {
    busy.value = false;
  }
}
</script>
<template>
  <div class="container page-space">
    <div class="page-heading">
      <div>
        <span class="eyebrow">MOLI CREATOR STUDIO</span>
        <h1>把每一场陪伴，认真做好。</h1>
        <p>你好，{{ auth.user.name }}。安排你的服务，迎接下一位游戏搭子。</p>
      </div>
      <button class="button secondary" @click="load" :disabled="loading">
        <RefreshCw :size="16" />刷新
      </button>
    </div>
    <div class="workspace-layout">
      <nav class="workspace-nav">
        <button
          v-for="[value, label, icon] in tabs"
          :key="value"
          :class="{ active: tab === value }"
          @click="tab = value"
        >
          <component :is="icon" :size="18" />{{ label }}
        </button>
      </nav>
      <div class="workspace-content">
        <div v-if="loading" class="skeleton detail-skeleton" />
        <div v-else-if="failed" class="empty-state panel">
          <h2>工作台暂时无法加载</h2>
          <button class="button secondary" @click="load">重新加载</button>
        </div>
        <template v-else-if="data"
          ><section v-if="tab === 'overview'">
            <div class="metric-grid">
              <article class="panel metric">
                <span>可结算收入</span
                ><strong>{{ money(data.earnings.availableCents) }}</strong
                ><small>已完成且无退款争议</small>
              </article>
              <article class="panel metric">
                <span>累计服务收入</span
                ><strong>{{ money(data.earnings.earnedCents) }}</strong
                ><small>已扣除订单平台服务费</small>
              </article>
              <article class="panel metric">
                <span>接单状态</span
                ><strong class="word">{{
                  data.provider.accepting ? "接受预约" : "休息中"
                }}</strong
                ><small>{{
                  data.provider.status === "active"
                    ? "主页已上架"
                    : "主页已暂停"
                }}</small>
              </article>
            </div>
            <div class="panel section-panel studio-welcome">
              <div>
                <h2>你的主页，是默契的开始。</h2>
                <p>补充技能介绍，开放可预约档期，让玩家更容易找到你。</p>
                <div class="actions-row">
                  <button class="button" @click="tab = 'schedule'">
                    设置档期</button
                  ><router-link
                    :to="'/players/' + data.provider.id"
                    class="button secondary"
                    >查看我的主页<ArrowUpRight :size="16"
                  /></router-link>
                </div>
              </div>
              <AvatarArt
                :name="data.provider.nickname"
                :theme="data.provider.theme"
              />
            </div>
            <section class="panel section-panel">
              <div class="section-top">
                <h2>最近预约</h2>
                <button class="text-button" @click="tab = 'orders'">
                  全部订单
                </button>
              </div>
              <p v-if="!orders.items.length" class="empty-inline">
                暂时没有预约，先把主页与档期准备好。
              </p>
              <router-link
                v-for="o in orders.items.slice(0, 4)"
                :key="o.id"
                :to="'/orders/' + o.id"
                class="compact-order"
                ><span
                  ><strong>{{ o.title }}</strong
                  ><small>{{ datetime(o.start_at) }}</small></span
                ><span class="status-pill">{{ statusLabels[o.status] }}</span
                ><ArrowUpRight :size="17"
              /></router-link>
            </section>
          </section>
          <section v-if="tab === 'orders'" class="panel section-panel">
            <h2>接单订单</h2>
            <p class="subtle">
              付款后可接单。请进入详情确认预约，并按时间履行服务。
            </p>
            <div class="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>预约服务</th>
                    <th>预约时间</th>
                    <th>收入</th>
                    <th>状态</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="o in orders.items" :key="o.id">
                    <td>
                      {{ o.title }}<small>{{ o.order_no }}</small>
                    </td>
                    <td>
                      {{ datetime(o.start_at)
                      }}<small>{{ o.duration_minutes }}分钟</small>
                    </td>
                    <td>{{ money(o.income_cents) }}</td>
                    <td>
                      <span class="status-pill">{{
                        statusLabels[o.status]
                      }}</span>
                    </td>
                    <td>
                      <router-link :to="'/orders/' + o.id" class="text-link"
                        >查看订单<ArrowUpRight :size="14"
                      /></router-link>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p v-if="!orders.items.length" class="empty-inline">
              暂时没有订单。
            </p>
            <Pagination
              :page="orders.page"
              :total="orders.total"
              @change="loadOrders"
            />
          </section>
          <section v-if="tab === 'services'" class="panel section-panel">
            <div class="section-top">
              <h2>服务项目</h2>
              <button class="button" @click="editService()">
                <Plus :size="17" />新增服务
              </button>
            </div>
            <article v-for="s in data.services" :key="s.id" class="service-row">
              <div>
                <strong>{{ s.title }}</strong>
                <p>{{ s.game }} · {{ s.skill }} {{ s.service_city }}</p>
                <p v-if="s.review_reason">审核意见：{{ s.review_reason }}</p>
                <span class="status-pill">{{
                  s.review_status === "pending"
                    ? "待审核"
                    : s.review_status === "rejected"
                      ? "审核未通过"
                      : s.active
                        ? "已上架"
                        : "已下架"
                }}</span>
              </div>
              <strong>{{ money(s.rate_cents) }}<small>/小时</small></strong
              ><button class="button secondary" @click="editService(s)">
                编辑
              </button>
            </article>
            <p class="field-hint">
              价格调整仅影响新订单，已有预约按下单时价格履行。
            </p>
          </section>
          <section v-if="tab === 'schedule'" class="panel section-panel">
            <h2>每周可预约档期</h2>
            <p class="subtle">
              北京时间。仅选中的日期开放预约，每天可设置一个连续时间段。
            </p>
            <form @submit.prevent="saveSchedule">
              <div v-for="s in schedule" :key="s.day" class="schedule-editor">
                <label
                  ><input type="checkbox" v-model="s.enabled" />{{
                    weekdays[s.day]
                  }}</label
                ><select
                  v-model="s.start"
                  :disabled="!s.enabled"
                  :aria-label="weekdays[s.day] + '开始时间'"
                >
                  <option v-for="h in hours.slice(0, -1)" :key="h">
                    {{ h }}
                  </option></select
                ><span>至</span
                ><select
                  v-model="s.end"
                  :disabled="!s.enabled"
                  :aria-label="weekdays[s.day] + '结束时间'"
                >
                  <option v-for="h in hours.slice(1)" :key="h">{{ h }}</option>
                </select>
              </div>
              <button class="button" :disabled="busy">保存档期</button>
              <p class="field-hint">
                修改档期不会取消已有订单。无法履约时请及时沟通并申请售后。
              </p>
            </form>
          </section>
          <section v-if="tab === 'profile'" class="panel section-panel">
            <h2>个人主页</h2>
            <form @submit.prevent="saveProfile">
              <div class="form-grid">
                <label class="field"
                  >陪玩昵称<input
                    v-model="profile.nickname"
                    maxlength="30"
                    required /></label
                ><label class="field"
                  >所在城市<input v-model="profile.city" maxlength="50"
                /></label>
              </div>
              <label class="field"
                >服务介绍<textarea
                  v-model="profile.bio"
                  minlength="20"
                  maxlength="1000"
                  rows="5"
                  required
                /></label
              ><label class="field"
                >风格标签<input
                  v-model="profile.tagsText"
                  placeholder="逗号分隔，最多5个" /></label
              ><label class="field"
                >主页配色<select v-model="profile.theme">
                  <option value="sage">茉莉绿</option>
                  <option value="peach">蜜桃粉</option>
                  <option value="lavender">浅紫</option>
                  <option value="sky">晴空蓝</option>
                  <option value="sand">暖沙色</option>
                  <option value="mint">薄荷绿</option>
                </select></label
              ><label class="checkbox-line"
                ><input
                  type="checkbox"
                  v-model="profile.accepting"
                />接受新预约</label
              ><button class="button" :disabled="busy">保存主页</button>
            </form>
          </section>
          <section v-if="tab === 'earnings'">
            <div class="metric-grid">
              <article class="panel metric">
                <span>可申请结算</span
                ><strong>{{ money(data.earnings.availableCents) }}</strong
                ><button class="text-button" @click="payoutDialog.showModal()">
                  申请结算<ArrowUpRight :size="14" />
                </button>
              </article>
              <article class="panel metric">
                <span>累计收入</span
                ><strong>{{ money(data.earnings.earnedCents) }}</strong
                ><small>服务费在下单时锁定</small>
              </article>
              <article class="panel metric">
                <span>已结算 / 处理中</span
                ><strong>{{ money(data.earnings.reservedCents) }}</strong
                ><small>包含尚在处理的申请</small>
              </article>
            </div>
            <section class="panel section-panel">
              <h2>结算记录</h2>
              <p class="subtle">
                运营者核对收款方式后人工转账，实际付款凭证会显示在记录中。
              </p>
              <div class="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>时间</th>
                      <th>金额</th>
                      <th>状态</th>
                      <th>凭证 / 原因</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="p in data.payouts" :key="p.id">
                      <td>{{ datetime(p.created_at) }}</td>
                      <td>{{ money(p.amount_cents) }}</td>
                      <td>
                        {{
                          {
                            requested: "处理中",
                            paid: "已登记付款",
                            rejected: "未通过",
                          }[p.state]
                        }}
                      </td>
                      <td>{{ p.reference || "—" }}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p v-if="!data.payouts.length" class="empty-inline">
                暂无结算记录。
              </p>
            </section>
          </section></template
        >
      </div>
    </div>
    <dialog ref="serviceDialog" class="modal wide">
      <form @submit.prevent="saveService">
        <h2>{{ serviceId ? "编辑服务" : "新增服务" }}</h2>
        <label class="field"
          >服务标题<input v-model="serviceForm.title" required maxlength="80"
        /></label>
        <ExperienceFields v-model="serviceForm" />
        <div class="form-grid">
          <label v-if="serviceForm.category === 'esports'" class="field"
            >游戏<select v-model="serviceForm.game">
              <option v-for="g in site.games" :key="g">{{ g }}</option>
            </select></label
          ><label class="field"
            >技能 / 段位<input
              v-model="serviceForm.skill"
              required
              maxlength="60"
          /></label>
        </div>
        <label class="field"
          >价格（元 / 小时）<input
            v-model="serviceForm.rate"
            type="number"
            min="1"
            max="2000"
            step="0.01"
            required /></label
        ><label class="field"
          >服务说明<textarea
            v-model="serviceForm.description"
            minlength="10"
            maxlength="1000"
            rows="4"
            required
          /></label
        ><label class="checkbox-line"
          ><input
            type="checkbox"
            v-model="serviceForm.active"
          />上架此服务</label
        >
        <div class="actions-row">
          <button
            class="button secondary"
            type="button"
            @click="serviceDialog.close()"
          >
            返回</button
          ><button class="button" :disabled="busy">保存服务</button>
        </div>
      </form>
    </dialog>
    <dialog ref="payoutDialog" class="modal">
      <form @submit.prevent="requestPayout">
        <h2>申请结算</h2>
        <p>
          可申请
          {{
            money(data?.earnings.availableCents)
          }}，最低10元。请在客服工单中确认收款资料。
        </p>
        <label class="field"
          >申请金额（元）<input
            v-model="payout"
            type="number"
            min="10"
            :max="(data?.earnings.availableCents || 0) / 100"
            step="0.01"
            required
        /></label>
        <div class="actions-row">
          <button
            class="button secondary"
            type="button"
            @click="payoutDialog.close()"
          >
            返回</button
          ><button class="button" :disabled="busy">提交申请</button>
        </div>
      </form>
    </dialog>
  </div>
</template>
