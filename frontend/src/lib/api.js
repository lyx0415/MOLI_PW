import { reactive } from "vue";
export const auth = reactive({ user: null, csrf: "", ready: false });
export const ui = reactive({ toast: "", error: false });
let toastTimer;
export function notify(message, error = false) {
  ui.toast = message;
  ui.error = error;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (ui.toast = ""), 4500);
}
export async function api(path, { method = "GET", body, quiet = false } = {}) {
  const controller = new AbortController(),
    timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch("/api" + path, {
      method,
      credentials: "same-origin",
      signal: controller.signal,
      headers: {
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(auth.csrf ? { "X-CSRF-Token": auth.csrf } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const payload = await response.json().catch(() => {
      throw new Error("服务返回异常，请稍后重试");
    });
    if (!response.ok) {
      if (response.status === 401) {
        auth.user = null;
        auth.csrf = "";
      }
      const error = new Error(payload.message || "操作未完成");
      error.status = response.status;
      throw error;
    }
    return payload.data;
  } catch (error) {
    if (!quiet)
      notify(
        error.name === "AbortError"
          ? "请求超时，请稍后查看操作结果"
          : error.message === "Failed to fetch"
            ? "网络连接失败，请稍后再试"
            : error.message,
        true,
      );
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
export async function initAuth() {
  try {
    const data = await api("/auth/me", { quiet: true });
    auth.user = data.user;
    auth.csrf = data.csrf;
  } catch {
    /* Anonymous browsing is supported. */
  }
  auth.ready = true;
}
export async function logout() {
  await api("/auth/logout", { method: "POST", body: {} });
  auth.user = null;
  auth.csrf = "";
  notify("已退出登录");
}
export const money = (cents) =>
  new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency: "CNY",
    maximumFractionDigits: 2,
  }).format(Number(cents || 0) / 100);
export const datetime = (value) =>
  value
    ? new Intl.DateTimeFormat("zh-CN", {
        timeZone: "Asia/Shanghai",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(new Date(value))
    : "—";
export const statusLabels = {
  awaiting_payment: "待付款",
  paid: "待接单",
  accepted: "已接单",
  in_service: "服务中",
  awaiting_confirmation: "待确认",
  completed: "已完成",
  cancelled: "已取消",
  refund_pending: "退款处理中",
};
export const weekdays = [
  "周日",
  "周一",
  "周二",
  "周三",
  "周四",
  "周五",
  "周六",
];
