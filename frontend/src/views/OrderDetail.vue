<script setup>
import { ref, onMounted, onUnmounted, computed } from "vue";
import { useRoute } from "vue-router";
import {
  ArrowLeft,
  ArrowUpRight,
  Clock,
  ShieldCheck,
  Send,
  CheckCircle2,
} from "lucide-vue-next";
import QRCode from "qrcode";
import {
  api,
  auth,
  money,
  datetime,
  statusLabels,
  notify,
} from "../lib/api.js";
const route = useRoute(),
  o = ref(null),
  loading = ref(true),
  failed = ref(false),
  busy = ref(false),
  channels = ref([]),
  channel = ref(""),
  qr = ref(""),
  messages = ref([]),
  message = ref(""),
  reason = ref(""),
  rating = ref(5),
  review = ref(""),
  refundDialog = ref(),
  confirmDialog = ref(),
  pendingAction = ref("");
let interval;
const expired = computed(
  () =>
    o.value?.status === "awaiting_payment" &&
    new Date(o.value.expires_at).getTime() < Date.now(),
);
const stages = [
  "awaiting_payment",
  "paid",
  "accepted",
  "in_service",
  "awaiting_confirmation",
  "completed",
];
const actionLabels = {
  accept: "确认接单",
  reject: "无法接单",
  start: "开始服务",
  finish: "结束服务",
  confirm: "确认完成",
  cancel: "取消订单",
};
const availableActions = computed(() => {
  if (!o.value) return [];
  const s = o.value.status,
    r = [];
  if (o.value.isProvider) {
    if (s === "paid") r.push("accept", "reject");
    if (s === "accepted") r.push("start");
    if (s === "in_service") r.push("finish");
  }
  if (o.value.isCustomer) {
    if (s === "awaiting_payment") r.push("cancel");
    if (s === "awaiting_confirmation") r.push("confirm");
  }
  return r;
});
async function load(quiet = false) {
  try {
    o.value = await api("/orders/" + route.params.id, { quiet });
    messages.value = await api("/orders/" + route.params.id + "/messages", {
      quiet,
    });
    failed.value = false;
  } catch {
    if (!quiet) failed.value = true;
  } finally {
    loading.value = false;
  }
}
onMounted(async () => {
  await load();
  try {
    channels.value = await api("/payments/channels");
    channel.value = channels.value[0]?.id || "";
  } catch {}
  interval = setInterval(() => {
    if (document.visibilityState === "visible") load(true);
  }, 7000);
});
onUnmounted(() => clearInterval(interval));
function askAction(action) {
  pendingAction.value = action;
  confirmDialog.value.showModal();
}
async function act() {
  busy.value = true;
  try {
    await api("/orders/" + o.value.id + "/action", {
      method: "POST",
      body: { action: pendingAction.value },
    });
    confirmDialog.value.close();
    notify("订单已更新");
    await load();
  } catch {
  } finally {
    busy.value = false;
  }
}
async function pay() {
  busy.value = true;
  try {
    const data = await api("/payments/" + o.value.id + "/create", {
      method: "POST",
      body: {
        channel: channel.value,
        mobile: /Android|iPhone|iPad/i.test(navigator.userAgent),
      },
    });
    if (data.type === "redirect") {
      const target = new URL(data.url);
      if (
        target.protocol !== "https:" ||
        ![
          "openapi.alipay.com",
          "openapi-sandbox.dl.alipaydev.com",
          "wx.tenpay.com",
        ].includes(target.hostname)
      )
        throw new Error("付款地址无效");
      window.location.assign(data.url);
    } else if (data.type === "qr")
      qr.value = await QRCode.toDataURL(data.codeUrl, {
        width: 240,
        margin: 2,
      });
  } catch {
  } finally {
    busy.value = false;
  }
}
async function sync() {
  busy.value = true;
  try {
    await api("/payments/" + o.value.id + "/sync", {
      method: "POST",
      body: {},
    });
    await load();
    notify(
      o.value.payment_status === "paid"
        ? "付款已确认"
        : "暂未收到付款结果，请稍后再查",
    );
  } catch {
  } finally {
    busy.value = false;
  }
}
async function send() {
  if (!message.value.trim()) return;
  busy.value = true;
  try {
    await api("/orders/" + o.value.id + "/messages", {
      method: "POST",
      body: { content: message.value },
    });
    message.value = "";
    await load();
  } catch {
  } finally {
    busy.value = false;
  }
}
async function refund() {
  busy.value = true;
  try {
    await api("/orders/" + o.value.id + "/refund-request", {
      method: "POST",
      body: { reason: reason.value },
    });
    refundDialog.value.close();
    notify("已提交退款申请");
    await load();
  } catch {
  } finally {
    busy.value = false;
  }
}
async function rate() {
  busy.value = true;
  try {
    await api("/orders/" + o.value.id + "/review", {
      method: "POST",
      body: { rating: rating.value, content: review.value },
    });
    notify("评价已提交");
    await load();
  } catch {
  } finally {
    busy.value = false;
  }
}
</script>
<template>
  <div class="container page-space">
    <router-link to="/orders" class="back-link"
      ><ArrowLeft :size="16" />返回订单中心</router-link
    >
    <div v-if="loading" class="skeleton detail-skeleton" />
    <div v-else-if="failed" class="empty-state">
      <h2>暂时无法加载订单</h2>
      <button class="button secondary" @click="load()">重新加载</button>
    </div>
    <template v-else-if="o"
      ><div class="page-heading">
        <div>
          <span class="eyebrow">{{ o.order_no }}</span>
          <h1>{{ expired ? "付款已超时" : statusLabels[o.status] }}</h1>
          <p>{{ o.title }} · {{ o.nickname }}</p>
        </div>
        <strong class="order-amount">{{ money(o.amount_cents) }}</strong>
      </div>
      <div
        class="order-timeline"
        v-if="!['cancelled', 'refund_pending'].includes(o.status)"
      >
        <div
          v-for="(s, i) in stages"
          :key="s"
          :class="{ done: stages.indexOf(o.status) >= i }"
        >
          <span>{{ i + 1 }}</span
          >{{ statusLabels[s] }}
        </div>
      </div>
      <div class="detail-grid">
        <div>
          <section class="panel section-panel">
            <h2>预约详情</h2>
            <dl class="details-list">
              <div>
                <dt>服务项目</dt>
                <dd>{{ o.title }}</dd>
              </div>
              <div>
                <dt>服务陪玩</dt>
                <dd>{{ o.nickname }}</dd>
              </div>
              <div>
                <dt>预约时间</dt>
                <dd>
                  {{ datetime(o.start_at) }} —
                  {{ datetime(o.end_at) }}（北京时间）
                </dd>
              </div>
              <div>
                <dt>服务时长</dt>
                <dd>{{ o.duration_minutes }}分钟</dd>
              </div>
              <div>
                <dt>联系方式</dt>
                <dd>{{ o.contact || "付款后可见" }}</dd>
              </div>
              <div>
                <dt>预约备注</dt>
                <dd>{{ o.note || "无" }}</dd>
              </div>
              <div>
                <dt>付款状态</dt>
                <dd>
                  {{
                    { unpaid: "待付款", paid: "已付款", refunded: "已退款" }[
                      o.payment_status
                    ]
                  }}
                </dd>
              </div>
              <div v-if="o.refund_status === 'none' && o.refund_reason">
                <dt>售后说明</dt>
                <dd>{{ o.refund_reason }}</dd>
              </div>
              <div v-if="o.refund_status !== 'none'">
                <dt>退款进度</dt>
                <dd>
                  {{
                    {
                      requested: "等待处理",
                      processing: "退款处理中",
                      refunded: "已原路退回",
                    }[o.refund_status]
                  }}
                  <p>{{ o.refund_reason }}</p>
                </dd>
              </div>
            </dl>
            <div class="actions-row">
              <button
                v-for="action in availableActions"
                :key="action"
                class="button"
                :class="{ secondary: ['cancel', 'reject'].includes(action) }"
                :disabled="busy"
                @click="askAction(action)"
              >
                {{ actionLabels[action] }}</button
              ><button
                class="text-button"
                v-if="
                  o.isCustomer &&
                  o.payment_status === 'paid' &&
                  o.refund_status === 'none' &&
                  [
                    'paid',
                    'accepted',
                    'in_service',
                    'awaiting_confirmation',
                  ].includes(o.status)
                "
                @click="refundDialog.showModal()"
              >
                申请退款
              </button>
            </div>
            <p
              v-if="o.status === 'accepted' && o.isProvider"
              class="field-hint"
            >
              可在预约开始前15分钟内开始服务。
            </p>
          </section>
          <section class="panel section-panel">
            <h2>订单沟通 <small>仅订单参与者与客服可见</small></h2>
            <div class="message-list">
              <p v-if="!messages.length" class="empty-inline">
                付款后可以在这里沟通游戏ID与服务偏好。
              </p>
              <div
                v-for="m in messages"
                :key="m.id"
                class="message"
                :class="{ mine: m.user_id === auth.user.id }"
              >
                <span>{{ m.name }} · {{ datetime(m.created_at) }}</span>
                <p>{{ m.content }}</p>
              </div>
            </div>
            <form
              class="message-form"
              @submit.prevent="send"
              v-if="
                o.payment_status === 'paid' &&
                !['cancelled', 'completed'].includes(o.status)
              "
            >
              <input
                v-model="message"
                maxlength="1000"
                required
                placeholder="说说你想怎么玩……"
                aria-label="订单消息"
              /><button class="button" :disabled="busy">
                <Send :size="17" />发送
              </button>
            </form>
          </section>
          <section
            v-if="o.status === 'completed' && o.isCustomer"
            class="panel section-panel"
          >
            <h2>这次体验怎么样？</h2>
            <div v-if="o.review">
              <span class="rating">{{ "★".repeat(o.review.rating) }}</span>
              <p>{{ o.review.content }}</p>
            </div>
            <form v-else @submit.prevent="rate">
              <label class="field"
                >体验评分<select v-model="rating">
                  <option v-for="n in 5" :key="n" :value="n">
                    {{ n }}分 {{ "★".repeat(n) }}
                  </option>
                </select></label
              ><label class="field"
                >分享真实体验<textarea
                  v-model="review"
                  rows="3"
                  minlength="3"
                  maxlength="500"
                  required
                  placeholder="你的反馈会帮助更多玩家找到合拍的搭子"
                /></label
              ><button class="button" :disabled="busy">提交评价</button>
            </form>
          </section>
        </div>
        <aside>
          <section
            v-if="o.isCustomer && o.status === 'awaiting_payment'"
            class="panel section-panel payment-panel"
          >
            <ShieldCheck :size="27" />
            <h2>完成付款，锁定预约</h2>
            <p class="subtle">请在 {{ datetime(o.expires_at) }} 前付款。</p>
            <template v-if="!expired"
              ><label class="field"
                >选择支付方式<select
                  v-model="channel"
                  :disabled="!channels.length"
                >
                  <option v-if="!channels.length" value="">
                    在线支付暂未开放
                  </option>
                  <option v-for="c in channels" :key="c.id" :value="c.id">
                    {{ c.label }}
                  </option>
                </select></label
              ><button
                class="button full"
                :disabled="busy || !channel"
                @click="pay"
              >
                {{ busy ? "请稍候" : "去付款 " + money(o.amount_cents)
                }}<ArrowUpRight :size="17" />
              </button>
              <div v-if="qr" class="payment-qr">
                <img :src="qr" alt="微信付款二维码" />
                <p>请用另一台设备的微信扫码付款</p>
              </div></template
            >
            <p v-else class="alert">此订单已超时，请重新预约。</p>
            <button class="text-button" :disabled="busy" @click="sync">
              已完成付款？查询支付结果
            </button>
          </section>
          <section class="panel section-panel">
            <Clock :size="25" />
            <h3>每一步，都有记录</h3>
            <p class="subtle">
              服务完成后，请核对体验并确认订单。遇到问题可申请售后，我们会根据订单记录处理。
            </p>
            <router-link
              :to="{ path: '/help', query: { order: o.id } }"
              class="text-link"
              >联系订单客服<ArrowUpRight :size="17"
            /></router-link>
          </section>
        </aside>
      </div>
      <dialog ref="confirmDialog" class="modal">
        <h2>{{ actionLabels[pendingAction] }}</h2>
        <p>
          {{
            pendingAction === "confirm"
              ? "请确认服务已按约完成。确认后将计入陪玩的可结算收入。"
              : pendingAction === "reject"
                ? "无法接单后将发起退款处理，请确认。"
                : "确认执行此订单操作？"
          }}
        </p>
        <div class="actions-row">
          <button class="button secondary" @click="confirmDialog.close()">
            返回</button
          ><button class="button" :disabled="busy" @click="act">确认</button>
        </div>
      </dialog>
      <dialog ref="refundDialog" class="modal">
        <form @submit.prevent="refund">
          <h2>申请退款</h2>
          <p>提交后服务将暂停，管理者会核对订单记录。</p>
          <label class="field"
            >退款原因<textarea
              v-model="reason"
              rows="4"
              minlength="5"
              maxlength="500"
              required
            />
          </label>
          <div class="actions-row">
            <button
              class="button secondary"
              type="button"
              @click="refundDialog.close()"
            >
              返回</button
            ><button class="button" :disabled="busy">提交申请</button>
          </div>
        </form>
      </dialog></template
    >
  </div>
</template>
