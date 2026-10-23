<script setup>
import { ref, watch, onMounted, onUnmounted } from "vue";
import {
  LayoutDashboard,
  UserRound,
  ClipboardCheck,
  ClipboardList,
  Headphones,
  Wallet,
  FileText,
  ShieldCheck,
  RefreshCw,
  ArrowUpRight,
  Plus,
} from "lucide-vue-next";
import {
  api,
  auth,
  money,
  datetime,
  statusLabels,
  notify,
} from "../lib/api.js";
import Pagination from "../components/Pagination.vue";
import TicketConversation from "../components/TicketConversation.vue";
const tab = ref("overview"),
  overview = ref({}),
  rows = ref([]),
  pagination = ref({ page: 1, total: 0 }),
  loading = ref(false),
  failed = ref(false),
  busy = ref(false),
  status = ref(""),
  refunds = ref(false),
  modal = ref(),
  operation = ref(""),
  target = ref(null),
  thread = ref(null),
  reason = ref(""),
  identityReviewed = ref(false),
  announcementDialog = ref(),
  announcement = ref({ title: "", content: "", active: true });
const tabs = [
  ["overview", "运营总览", LayoutDashboard],
  ["applications", "入驻审核", ClipboardCheck],
  ["services", "线下服务审核", ClipboardCheck],
  ["orders", "订单与退款", ClipboardList],
  ["users", "账号管理", UserRound],
  ["providers", "陪玩管理", ShieldCheck],
  ["tickets", "客服工单", Headphones],
  ["payouts", "收入结算", Wallet],
  ["announcements", "公告管理", FileText],
  ["reviews", "评价管理", FileText],
  ["audit", "操作日志", ShieldCheck],
];
const titles = {
  serviceApprove: "通过服务审核",
  serviceReject: "驳回或下架服务",
  approve: "通过入驻审核",
  reject: "拒绝入驻申请",
  refund: "确认原路退款",
  refundReject: "拒绝退款申请",
  reply: "回复客服工单",
  payoutPaid: "登记结算付款",
  payoutRejected: "拒绝结算申请",
  userState: "调整账号状态",
  userRole: "调整客服权限",
  providerState: "调整主页状态",
  reviewState: "调整评价可见性",
};
let requestNumber = 0;
async function load(page = 1) {
  const current = ++requestNumber;
  const selectedTab = tab.value;
  loading.value = true;
  failed.value = false;
  try {
    if (selectedTab === "overview") {
      const result = await api("/admin/overview");
      if (current !== requestNumber) return;
      overview.value = result;
      rows.value = [];
    } else {
      const query = new URLSearchParams({
        page,
        status: status.value,
        refunds: String(refunds.value),
      });
      const data = await api("/admin/" + selectedTab + "?" + query);
      if (current !== requestNumber) return;
      rows.value = Array.isArray(data) ? data : data.items;
      pagination.value = Array.isArray(data)
        ? { page: 1, total: 0 }
        : { page: data.page, total: data.total, size: data.size };
    }
  } catch {
    if (current === requestNumber) failed.value = true;
  } finally {
    if (current === requestNumber) loading.value = false;
  }
}
watch(tab, () => {
  thread.value = null;
  status.value = "";
  refunds.value = false;
  load();
});
onMounted(() => load());
onUnmounted(() => {
  requestNumber++;
});
function open(kind, row) {
  operation.value = kind;
  target.value = row;
  reason.value = "";
  identityReviewed.value = false;
  modal.value.showModal();
}
async function submit() {
  busy.value = true;
  const t = target.value;
  try {
    if (["serviceApprove", "serviceReject"].includes(operation.value))
      await api("/admin/services/" + t.id + "/review", {
        method: "POST",
        body: {
          action: operation.value === "serviceApprove" ? "approve" : "reject",
          revision: t.revision,
          reviewed: identityReviewed.value,
          reason: reason.value,
        },
      });
    else if (["approve", "reject"].includes(operation.value))
      await api("/admin/applications/" + t.id + "/review", {
        method: "POST",
        body: {
          action: operation.value,
          identityReviewed: identityReviewed.value,
          reason: reason.value,
        },
      });
    else if (operation.value === "refund")
      await api("/payments/" + t.id + "/refund", { method: "POST", body: {} });
    else if (operation.value === "refundReject")
      await api("/admin/orders/" + t.id + "/refund-reject", {
        method: "POST",
        body: { reason: reason.value },
      });
    else if (operation.value === "userRole")
      await api("/admin/users/" + t.id + "/role", {
        method: "PUT",
        body: { role: t.role === "support" ? "customer" : "support" },
      });
    else if (operation.value.startsWith("payout"))
      await api("/admin/payouts/" + t.id, {
        method: "PUT",
        body: {
          state: operation.value === "payoutPaid" ? "paid" : "rejected",
          reference: reason.value,
        },
      });
    else if (operation.value === "userState")
      await api("/admin/users/" + t.id + "/state", {
        method: "PUT",
        body: { state: t.state === "active" ? "disabled" : "active" },
      });
    else if (operation.value === "providerState")
      await api("/admin/providers/" + t.id + "/state", {
        method: "PUT",
        body: { status: t.status === "active" ? "suspended" : "active" },
      });
    else if (operation.value === "reviewState")
      await api("/admin/reviews/" + t.id, {
        method: "PUT",
        body: { hidden: !Boolean(t.hidden), reason: reason.value },
      });
    modal.value.close();
    notify("处理结果已保存");
    await load(pagination.value.page);
  } catch {
  } finally {
    busy.value = false;
  }
}
async function publish() {
  busy.value = true;
  try {
    await api("/admin/announcements", {
      method: "POST",
      body: announcement.value,
    });
    announcementDialog.value.close();
    announcement.value = { title: "", content: "", active: true };
    notify("公告已保存");
    await load();
  } catch {
  } finally {
    busy.value = false;
  }
}
async function toggleAnnouncement(row) {
  try {
    await api("/admin/announcements/" + row.id, {
      method: "PUT",
      body: { active: !Boolean(row.active) },
    });
    await load();
  } catch {}
}
</script>
<template>
  <div class="container page-space admin-page">
    <div class="page-heading">
      <div>
        <span class="eyebrow">MOLI OPERATIONS</span>
        <h1>守护每一场好体验。</h1>
        <p>{{ auth.user.name }} · 审核、服务与资金处理均保留操作记录。</p>
      </div>
      <button
        class="button secondary"
        :disabled="loading"
        @click="load(pagination.page)"
      >
        <RefreshCw :size="16" />刷新数据
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
          <h2>数据暂时无法加载</h2>
          <button class="button secondary" @click="load()">重新加载</button>
        </div>
        <template v-else
          ><section v-if="tab === 'overview'">
            <div class="metric-grid">
              <article class="panel metric">
                <span>注册用户</span><strong>{{ overview.users || 0 }}</strong
                ><small>{{ overview.providers || 0 }} 位上架陪玩</small>
              </article>
              <article class="panel metric">
                <span>累计订单</span><strong>{{ overview.orders || 0 }}</strong
                ><small>全生命周期订单统计</small>
              </article>
              <article class="panel metric">
                <span>已收款（未退款）</span
                ><strong>{{ money(overview.collected_cents) }}</strong
                ><small>不等于可结算收入</small>
              </article>
            </div>
            <section class="panel section-panel">
              <h2>需要关注</h2>
              <div class="admin-todos">
                <button @click="tab = 'applications'">
                  <ClipboardCheck /><span
                    >待审核入驻<strong>{{
                      overview.pending_applications || 0
                    }}</strong></span
                  ><ArrowUpRight /></button
                ><button @click="tab = 'tickets'">
                  <Headphones /><span
                    >待处理工单<strong>{{
                      overview.open_tickets || 0
                    }}</strong></span
                  ><ArrowUpRight /></button
                ><button
                  @click="
                    tab = 'orders';
                    refunds = true;
                    load();
                  "
                >
                  <Wallet /><span
                    >待处理退款<strong>{{
                      overview.pending_refunds || 0
                    }}</strong></span
                  ><ArrowUpRight />
                </button>
              </div>
            </section>
            <section class="panel section-panel">
              <h2>运营提示</h2>
              <p>
                先核实资料再通过入驻审核；处理退款时核对金额、原因与订单记录。陪玩结算登记需在外部转账完成后填写真实凭证。
              </p>
              <p>
                已完成订单的平台服务费收入：<strong>{{
                  money(overview.revenue_cents)
                }}</strong
                >。
              </p>
            </section>
          </section>
          <section v-else class="panel section-panel">
            <div class="section-top">
              <h2>{{ tabs.find((t) => t[0] === tab)?.[1] }}</h2>
              <button
                v-if="tab === 'announcements'"
                class="button"
                @click="announcementDialog.showModal()"
              >
                <Plus :size="16" />新增公告
              </button>
            </div>
            <div
              class="filter-row"
              v-if="['applications', 'orders'].includes(tab)"
            >
              <label v-if="tab === 'applications'"
                >审核状态<select v-model="status" @change="load()">
                  <option value="">全部</option>
                  <option value="pending">待审核</option>
                  <option value="approved">已通过</option>
                  <option value="rejected">已拒绝</option>
                </select></label
              ><template v-else
                ><label
                  >订单状态<select v-model="status" @change="load()">
                    <option value="">全部</option>
                    <option
                      v-for="(label, value) in statusLabels"
                      :key="value"
                      :value="value"
                    >
                      {{ label }}
                    </option>
                  </select></label
                ><label
                  ><input
                    type="checkbox"
                    v-model="refunds"
                    @change="load()"
                  />仅看待处理退款</label
                ></template
              >
            </div>
            <p v-if="!rows.length" class="empty-inline">暂无记录。</p>
            <div
              class="table-wrap"
              v-if="tab === 'applications' && rows.length"
            >
              <table>
                <thead>
                  <tr>
                    <th>申请人</th>
                    <th>技能与价格</th>
                    <th>状态</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="a in rows" :key="a.id">
                    <td>
                      {{ a.data.nickname }}<small>{{ a.email }}</small
                      ><small>{{ a.data.contact }}</small>
                    </td>
                    <td>
                      {{ a.data.game }} · {{ a.data.skill
                      }}<small>{{ money(a.data.rateCents) }} / 小时</small>
                    </td>
                    <td>
                      {{
                        {
                          pending: "待审核",
                          approved: "已通过",
                          rejected: "已拒绝",
                        }[a.status]
                      }}
                    </td>
                    <td>
                      <div class="actions-row" v-if="a.status === 'pending'">
                        <button class="text-button" @click="open('approve', a)">
                          审核通过</button
                        ><button
                          class="text-button danger"
                          @click="open('reject', a)"
                        >
                          拒绝
                        </button>
                      </div>
                      <span v-else>{{ a.reason || "已处理" }}</span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div v-if="tab === 'services'">
              <p class="field-hint">
                核对公开场所、服务边界、额外费用及所需资质。通过后可预约；驳回或下架不取消已有订单，请协调履约或退款。
              </p>
              <article
                v-for="s in rows"
                :key="s.id"
                class="panel section-panel"
              >
                <h3>{{ s.title }} · {{ s.nickname }}</h3>
                <p>
                  {{ s.game }} · {{ s.skill }} · {{ money(s.rate_cents) }} /
                  小时
                </p>
                <p>{{ s.description }}</p>
                <p>{{ s.service_city }} · {{ s.venue }}</p>
                <p>费用说明：{{ s.fee_note }}</p>
                <p>
                  审核状态：{{
                    {
                      pending: "待审核",
                      approved: "已通过",
                      rejected: "已驳回",
                    }[s.review_status]
                  }}
                  · {{ s.active ? "已上架" : "未上架" }}
                </p>
                <p v-if="s.review_reason">处理原因：{{ s.review_reason }}</p>
                <div class="actions-row">
                  <button class="button" @click="open('serviceApprove', s)">
                    通过服务</button
                  ><button
                    class="button secondary"
                    @click="open('serviceReject', s)"
                  >
                    驳回 / 下架
                  </button>
                </div>
              </article>
            </div>
            <div class="table-wrap" v-if="tab === 'orders' && rows.length">
              <table>
                <thead>
                  <tr>
                    <th>订单</th>
                    <th>客户 / 陪玩</th>
                    <th>金额</th>
                    <th>状态</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="o in rows" :key="o.id">
                    <td>
                      {{ o.title }}<small>{{ o.order_no }}</small
                      ><small>{{ datetime(o.start_at) }}</small>
                    </td>
                    <td>{{ o.customer_name }} / {{ o.nickname }}</td>
                    <td>
                      {{ money(o.amount_cents)
                      }}<small>{{
                        {
                          unpaid: "待付款",
                          paid: "已付款",
                          refunded: "已退款",
                        }[o.payment_status]
                      }}</small>
                    </td>
                    <td>
                      {{ statusLabels[o.status]
                      }}<small>{{ o.refund_reason }}</small>
                    </td>
                    <td>
                      <router-link :to="'/orders/' + o.id" class="text-link"
                        >查看订单</router-link
                      >
                      <div
                        v-if="
                          ['requested', 'processing'].includes(o.refund_status)
                        "
                        class="actions-row"
                      >
                        <button class="text-button" @click="open('refund', o)">
                          {{
                            o.refund_status === "processing"
                              ? "查询退款"
                              : "原路退款"
                          }}</button
                        ><button
                          v-if="
                            o.status === 'refund_pending' &&
                            o.refund_status === 'requested'
                          "
                          class="text-button danger"
                          @click="open('refundReject', o)"
                        >
                          拒绝退款
                        </button>
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div class="table-wrap" v-if="tab === 'users' && rows.length">
              <table>
                <thead>
                  <tr>
                    <th>用户</th>
                    <th>角色</th>
                    <th>状态</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="u in rows" :key="u.id">
                    <td>
                      {{ u.name }}<small>{{ u.email }}</small>
                    </td>
                    <td>
                      {{
                        {
                          customer: "客户",
                          provider: "陪玩",
                          admin: "管理员",
                          support: "客服",
                        }[u.role]
                      }}
                    </td>
                    <td>{{ u.state === "active" ? "正常" : "已停用" }}</td>
                    <td>
                      <button
                        v-if="u.role !== 'admin'"
                        class="text-button"
                        @click="open('userState', u)"
                      >
                        {{ u.state === "active" ? "停用账号" : "恢复账号" }}
                      </button>
                      <button
                        v-if="
                          ['customer', 'support'].includes(u.role) &&
                          u.state === 'active'
                        "
                        class="text-button"
                        @click="open('userRole', u)"
                      >
                        {{ u.role === "support" ? "撤销客服权限" : "设为客服" }}
                      </button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div class="table-wrap" v-if="tab === 'providers' && rows.length">
              <table>
                <thead>
                  <tr>
                    <th>陪玩</th>
                    <th>城市</th>
                    <th>主页状态</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="p in rows" :key="p.id">
                    <td>
                      {{ p.nickname }}<small>{{ p.email }}</small>
                    </td>
                    <td>{{ p.city }}</td>
                    <td>{{ p.status === "active" ? "已上架" : "已暂停" }}</td>
                    <td>
                      <button
                        class="text-button"
                        @click="open('providerState', p)"
                      >
                        {{ p.status === "active" ? "暂停主页" : "恢复主页" }}
                      </button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <article
              v-if="tab === 'tickets'"
              v-for="t in rows"
              :key="t.id"
              class="ticket"
            >
              <div>
                <strong>{{ t.subject }}</strong
                ><span class="status-pill">{{
                  t.status === "open" ? "处理中" : "已解决"
                }}</span>
              </div>
              <p>{{ t.content }}</p>
              <small
                >{{ t.name }} · {{ t.email }} ·
                {{ datetime(t.created_at) }}</small
              >
              <div v-if="t.reply" class="ticket-reply">{{ t.reply }}</div>
              <div class="actions-row">
                <router-link
                  v-if="t.order_id"
                  :to="'/orders/' + t.order_id"
                  class="text-link"
                  >关联订单</router-link
                ><button
                  class="button secondary"
                  @click="thread = thread?.id === t.id ? null : t"
                >
                  回复工单
                </button>
              </div>
              <TicketConversation
                v-if="thread?.id === t.id"
                :ticket="t"
                staff
                base="/admin/tickets"
                @updated="load(pagination.page)"
              />
            </article>
            <div class="table-wrap" v-if="tab === 'payouts' && rows.length">
              <table>
                <thead>
                  <tr>
                    <th>陪玩</th>
                    <th>金额 / 时间</th>
                    <th>状态 / 凭证</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="p in rows" :key="p.id">
                    <td>{{ p.nickname }}</td>
                    <td>
                      {{ money(p.amount_cents)
                      }}<small>{{ datetime(p.created_at) }}</small>
                    </td>
                    <td>
                      {{
                        {
                          requested: "待处理",
                          paid: "已登记付款",
                          rejected: "已拒绝",
                        }[p.state]
                      }}<small>{{ p.reference }}</small>
                    </td>
                    <td>
                      <div v-if="p.state === 'requested'" class="actions-row">
                        <button
                          class="text-button"
                          @click="open('payoutPaid', p)"
                        >
                          登记付款</button
                        ><button
                          class="text-button danger"
                          @click="open('payoutRejected', p)"
                        >
                          拒绝
                        </button>
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <article
              v-if="tab === 'announcements'"
              v-for="a in rows"
              :key="a.id"
              class="review"
            >
              <div class="section-top">
                <h3>{{ a.title }}</h3>
                <button class="text-button" @click="toggleAnnouncement(a)">
                  {{ a.active ? "撤下公告" : "发布公告" }}
                </button>
              </div>
              <p>{{ a.content }}</p>
              <small
                >{{ datetime(a.created_at) }} ·
                {{ a.active ? "已发布" : "未发布" }}</small
              >
            </article>
            <article
              v-if="tab === 'reviews'"
              v-for="r in rows"
              :key="r.id"
              class="review"
            >
              <span class="rating">{{ "★".repeat(r.rating) }}</span>
              <p>{{ r.content }}</p>
              <small
                >{{ r.nickname }} · {{ datetime(r.created_at) }} ·
                {{ r.hidden ? "已隐藏" : "公开展示" }}</small
              ><button class="text-button" @click="open('reviewState', r)">
                {{ r.hidden ? "恢复展示" : "隐藏违规评价" }}
              </button>
            </article>
            <div class="table-wrap" v-if="tab === 'audit' && rows.length">
              <table>
                <thead>
                  <tr>
                    <th>时间</th>
                    <th>操作人</th>
                    <th>操作</th>
                    <th>对象 / 说明</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="a in rows" :key="a.id">
                    <td>{{ datetime(a.created_at) }}</td>
                    <td>{{ a.name || "支付系统" }}</td>
                    <td>{{ a.action }}</td>
                    <td>
                      <small>{{ a.target_id }}</small
                      >{{ a.detail }}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <Pagination
              v-if="pagination.total"
              :page="pagination.page"
              :total="pagination.total"
              :size="pagination.size || 12"
              @change="load"
            /></section
        ></template>
      </div>
    </div>
    <dialog ref="modal" class="modal wide">
      <form @submit.prevent="submit">
        <h2>{{ titles[operation] }}</h2>
        <template
          v-if="operation === 'serviceApprove' || operation === 'serviceReject'"
        >
          <p>
            {{ target?.title }} · {{ target?.service_city }} ·
            {{ target?.venue }}
          </p>
          <p>{{ target?.description }}</p>
          <p>{{ target?.fee_note }}</p>
          <label v-if="operation === 'serviceApprove'" class="checkbox-line"
            ><input
              type="checkbox"
              v-model="identityReviewed"
              required
            />已核对服务内容、公开场所、费用和所需资质</label
          >
        </template>
        <template v-if="operation === 'approve'"
          ><p>
            {{ target?.data.nickname }} · {{ target?.data.game }} ·
            {{ target?.data.skill }}
          </p>
          <p class="review-description">{{ target?.data.bio }}</p>
          <p v-if="target?.data.venue">
            线下申请：{{ target?.data.city }} · {{ target?.data.venue }} ·
            {{ target?.data.feeNote }}。入驻通过后请到线下服务审核处理。
          </p>
          <p>
            {{ money(target?.data.rateCents) }} / 小时 ·
            {{ target?.data.contact }}
          </p>
          <label class="checkbox-line"
            ><input
              type="checkbox"
              v-model="identityReviewed"
              required
            />我已通过线下或可信渠道核对成年身份与技能资料</label
          >
          <p class="field-hint">
            此确认是人工审核记录，请实际核验后操作。
          </p></template
        ><template v-if="operation === 'refund'"
          ><p>订单 {{ target?.order_no }}</p>
          <p>
            将向 {{ target?.payment_channel }} 发起整单原路退款：<strong>{{
              money(target?.amount_cents)
            }}</strong
            >。
          </p>
          <p>{{ target?.refund_reason }}</p>
          <p class="field-hint">
            支付渠道确认成功后才会显示“已退款”。
          </p></template
        ><template v-if="operation === 'userState'"
          ><p>
            将{{ target?.state === "active" ? "停用" : "恢复" }}
            {{ target?.name }} 的账号。停用会终止登录会话，并停止其新预约。
          </p></template
        ><template v-if="operation === 'userRole'"
          ><p>
            {{ target?.role === "support" ? "撤销" : "授予" }}
            {{ target?.name }}
            的客服权限。客服可查看和回复工单；退款、结算及账号管理仍由管理员处理。授权需要已验证邮箱，变更后该账号须重新登录。
          </p></template
        ><template v-if="operation === 'providerState'"
          ><p>
            将{{ target?.status === "active" ? "暂停" : "恢复" }}
            {{ target?.nickname }} 的公开主页。已有订单仍需妥善处理。
          </p></template
        >
        <p v-if="operation === 'payoutPaid'" class="alert">
          此操作仅登记外部转账，请先完成付款并核对凭证。金额
          {{ money(target?.amount_cents) }}。
        </p>
        <p v-if="operation === 'reply'">
          {{ target?.subject }}：{{ target?.content }}
        </p>
        <label
          class="field"
          v-if="
            [
              'reject',
              'serviceReject',
              'refundReject',
              'reply',
              'payoutPaid',
              'payoutRejected',
              'reviewState',
            ].includes(operation)
          "
          >{{
            operation === "reply"
              ? "客服回复"
              : operation === "payoutPaid"
                ? "真实转账凭证编号"
                : "处理原因"
          }}<textarea
            v-model="reason"
            rows="4"
            :minlength="operation === 'refundReject' ? 5 : 3"
            :maxlength="
              operation === 'reply'
                ? 3000
                : operation.startsWith('payout')
                  ? 120
                  : operation === 'reviewState'
                    ? 200
                    : 500
            "
            required
          />
        </label>
        <div class="actions-row">
          <button class="button secondary" type="button" @click="modal.close()">
            返回</button
          ><button class="button" :disabled="busy">
            {{ busy ? "正在处理" : "确认处理" }}
          </button>
        </div>
      </form>
    </dialog>
    <dialog ref="announcementDialog" class="modal">
      <form @submit.prevent="publish">
        <h2>新增公告</h2>
        <label class="field"
          >标题<input
            v-model="announcement.title"
            maxlength="120"
            required /></label
        ><label class="field"
          >公告内容<textarea
            v-model="announcement.content"
            rows="5"
            maxlength="3000"
            required
          /></label
        ><label class="checkbox-line"
          ><input
            type="checkbox"
            v-model="announcement.active"
          />立即发布</label
        >
        <div class="actions-row">
          <button
            class="button secondary"
            type="button"
            @click="announcementDialog.close()"
          >
            返回</button
          ><button class="button" :disabled="busy">保存公告</button>
        </div>
      </form>
    </dialog>
  </div>
</template>
