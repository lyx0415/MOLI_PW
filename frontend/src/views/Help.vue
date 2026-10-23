<script setup>
import { ref, onMounted } from "vue";
import { useRoute } from "vue-router";
import { ArrowUpRight, Headphones, ChevronDown } from "lucide-vue-next";
import { api, auth, notify, datetime } from "../lib/api.js";
import { site } from "../lib/site.js";
import Pagination from "../components/Pagination.vue";
import TicketConversation from "../components/TicketConversation.vue";
const route = useRoute(),
  tickets = ref({ items: [], total: 0, page: 1, size: 12 }),
  selected = ref(null),
  subject = ref(""),
  content = ref(""),
  busy = ref(false);
const faqs = [
  [
    "线下服务怎么收费？",
    "预约页会列出服务城市、场所和费用说明，小时价按预约时长计算。场地、包厢、设备等额外费用须提前确认；订单保存下单时的约定，后续修改不会覆盖。",
  ],
  [
    "门店或活动如何合作？",
    "请通过下方工单提供城市、公开营业场所、服务类别及合作意向，客服会跟进。服务伙伴也可以直接申请入驻，线下项目审核通过后才能上架。",
  ],
  [
    "线上线下的档期可以同时预约吗？",
    "同一陪玩的所有服务共用档期，不能重复预约重叠时段。线下服务还需要自行预留交通和准备时间，确认接单前请核对已有安排。",
  ],
  [
    "如何预约陪玩？",
    "在场景探索或发现陪玩中筛选服务类别、城市与预算，进入主页选择服务和档期，登录后填写联系方式并创建预约。付款完成后，陪玩会收到接单请求。",
  ],
  [
    "付款后多久可以开始？",
    "陪玩接单后按预约时间开始。可以在订单内沟通游戏ID与偏好。请关注订单状态，遇到未接单或时间变化及时通过工单联系客服。",
  ],
  [
    "可以取消或退款吗？",
    "待付款订单可自行取消。付款后需要提交退款申请，由管理者根据订单记录与服务履行情况处理。通过后原路退款，到账时间取决于支付渠道。",
  ],
  [
    "如何成为陪玩？",
    "注册账号后提交入驻申请。运营者会审核成年身份与技能材料，通过后可以设置服务价格、介绍和可预约档期。",
  ],
  [
    "如何保障个人信息？",
    "公开主页不展示联系方式。订单信息仅对本人、订单陪玩及授权运营者开放。请不要在公开介绍或评价中发布电话、邮箱等敏感信息。",
  ],
  [
    "结算到哪里？",
    "陪玩确认完成且无退款争议的订单会计入可结算收入。陪玩可提交结算申请，运营者核对收款资料后转账，并登记付款凭证。",
  ],
];
async function load(page = 1) {
  if (auth.user)
    try {
      tickets.value = await api("/tickets?page=" + page);
    } catch {}
}
onMounted(load);
async function submit() {
  busy.value = true;
  try {
    await api("/tickets", {
      method: "POST",
      body: {
        subject: subject.value,
        content: content.value,
        orderId:
          typeof route.query.order === "string" ? route.query.order : null,
      },
    });
    subject.value = "";
    content.value = "";
    notify("工单已提交，回复会显示在这里");
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
        <span class="eyebrow">WE ARE HERE FOR YOU</span>
        <h1>有问题，我们一起解决。</h1>
        <p>找到答案，或把问题交给茉莉客服。</p>
      </div>
      <Headphones :size="48" class="heading-note" />
    </div>
    <div class="help-grid">
      <section>
        <div class="panel section-panel">
          <h2>常见问题</h2>
          <details v-for="[q, a] in faqs" :key="q" class="faq">
            <summary>{{ q }}<ChevronDown :size="18" /></summary>
            <p>{{ a }}</p>
          </details>
        </div>
        <section v-if="site.announcements.length" class="panel section-panel">
          <h2>茉莉公告</h2>
          <article v-for="a in site.announcements" :key="a.id" class="review">
            <h3>{{ a.title }}</h3>
            <p>{{ a.content }}</p>
            <small>{{ datetime(a.created_at) }}</small>
          </article>
        </section>
      </section>
      <section>
        <div class="panel section-panel">
          <span class="eyebrow">LET US HELP</span>
          <h2>提交客服工单</h2>
          <form v-if="auth.user" @submit.prevent="submit">
            <p class="field-hint" v-if="route.query.order">
              已关联你正在查看的订单。
            </p>
            <label class="field"
              >问题主题<input
                v-model="subject"
                required
                maxlength="120"
                placeholder="简单说说遇到的问题" /></label
            ><label class="field"
              >具体情况<textarea
                v-model="content"
                minlength="5"
                maxlength="3000"
                rows="5"
                required
                placeholder="请描述订单、时间和需要协助的事项，请勿提供支付密码"
              /></label
            ><button class="button full" :disabled="busy">
              {{ busy ? "正在提交" : "提交工单" }}<ArrowUpRight :size="17" />
            </button>
          </form>
          <div v-else>
            <p>登录后可以提交工单，跟进处理进度。</p>
            <router-link to="/login?redirect=/help" class="button"
              >登录联系客服</router-link
            >
          </div>
          <p v-if="site.supportEmail" class="field-hint">
            客服邮箱：<a :href="'mailto:' + site.supportEmail">{{
              site.supportEmail
            }}</a>
          </p>
        </div>
        <section v-if="auth.user" class="panel section-panel">
          <div class="section-top">
            <h2>我的工单</h2>
            <button class="text-button" @click="load(tickets.page)">
              刷新工单
            </button>
          </div>
          <p class="empty-inline" v-if="!tickets.items.length">
            暂时没有工单。
          </p>
          <article v-for="t in tickets.items" :key="t.id" class="ticket">
            <div>
              <strong>{{ t.subject }}</strong
              ><span class="status-pill">{{
                t.status === "resolved" ? "已解决" : "处理中"
              }}</span>
            </div>
            <p>{{ t.content }}</p>
            <div v-if="t.reply" class="ticket-reply">
              <strong>客服回复</strong>
              <p>{{ t.reply }}</p>
            </div>
            <small>{{ datetime(t.updated_at) }}</small>
            <button
              class="button secondary"
              @click="selected = selected?.id === t.id ? null : t"
            >
              {{ selected?.id === t.id ? "收起记录" : "查看记录 / 追问" }}
            </button>
            <TicketConversation
              v-if="selected?.id === t.id"
              :ticket="t"
              @updated="load(tickets.page)"
            />
          </article>
          <Pagination
            :page="tickets.page"
            :size="tickets.size"
            :total="tickets.total"
            @change="load"
          />
        </section>
      </section>
    </div>
  </div>
</template>
