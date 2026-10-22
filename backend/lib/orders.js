import { assert, now } from "./errors.js";
import { id, audit } from "./security.js";

export function bookingWindow(startAt, durationMinutes) {
  const start = new Date(startAt),
    end = new Date(start.getTime() + durationMinutes * 60000);
  assert(
    Number.isFinite(start.getTime()) &&
      start.getTime() > Date.now() + 1800000 &&
      start.getTime() < Date.now() + 30 * 86400000,
    400,
    "请预约30分钟后、30天内的时间",
  );
  assert(
    start.getUTCSeconds() === 0 &&
      start.getUTCMilliseconds() === 0 &&
      start.getUTCMinutes() % 30 === 0,
    400,
    "预约时间须为整点或半点",
  );
  const local = new Date(start.getTime() + 8 * 3600000);
  const minute = local.getUTCHours() * 60 + local.getUTCMinutes();
  assert(
    minute + durationMinutes <= 1440,
    400,
    "单次服务不能跨越午夜，请拆分预约",
  );
  return {
    startAt: start.toISOString(),
    endAt: end.toISOString(),
    weekday: local.getUTCDay(),
    minute,
  };
}
export async function createOrder(db, user, data, config) {
  const window = bookingWindow(data.startAt, data.durationMinutes);
  return db.tx(async (tx) => {
    await tx.one("SELECT id FROM moli_users WHERE id=?" + tx.lock, [user.id]);
    const service = await tx.one("SELECT * FROM moli_services WHERE id=?", [
      data.serviceId,
    ]);
    assert(service, 404, "服务不存在");
    const provider = await tx.one(
      "SELECT p.*,u.state AS user_state FROM moli_providers p JOIN moli_users u ON p.user_id=u.id WHERE p.id=?" +
        tx.lock,
      [service.provider_id],
    );
    assert(
      provider.status === "active" &&
        provider.user_state === "active" &&
        provider.accepting === 1 &&
        service.active === 1,
      409,
      "该陪玩当前暂停接单",
    );
    assert(provider.user_id !== user.id, 400, "不能预约自己的服务");
    const slots = await tx.all(
      "SELECT * FROM moli_availability WHERE provider_id=? AND weekday=?",
      [provider.id, window.weekday],
    );
    assert(
      slots.some(
        (s) =>
          s.start_minute <= window.minute &&
          s.end_minute >= window.minute + data.durationMinutes,
      ),
      409,
      "此时段不在陪玩的可预约时间内",
    );
    const conflict = await tx.one(
      `SELECT id FROM moli_orders WHERE provider_id=? AND start_at<? AND end_at>? AND ((status='awaiting_payment' AND expires_at>?) OR status IN ('paid','accepted','in_service','awaiting_confirmation','refund_pending')) LIMIT 1`,
      [provider.id, window.endAt, window.startAt, now()],
    );
    assert(!conflict, 409, "此时段已被预约，请选择其他时间");
    const open = await tx.one(
      "SELECT COUNT(*) AS n FROM moli_orders WHERE customer_id=? AND status='awaiting_payment' AND expires_at>?",
      [user.id, now()],
    );
    assert(Number(open.n) < 3, 429, "请先处理已有待付款订单");
    const amount = Math.round((service.rate_cents * data.durationMinutes) / 60),
      commission = Math.round((amount * config.commissionBps) / 10000);
    const orderId = id(),
      orderNo =
        "ML" + Date.now() + id().replaceAll("-", "").slice(0, 8).toUpperCase();
    await tx.run(
      `INSERT INTO moli_orders (id,order_no,customer_id,provider_id,service_id,title,rate_cents,duration_minutes,start_at,end_at,contact,note,amount_cents,commission_cents,income_cents,expires_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        orderId,
        orderNo,
        user.id,
        provider.id,
        service.id,
        service.title,
        service.rate_cents,
        data.durationMinutes,
        window.startAt,
        window.endAt,
        data.contact,
        data.note,
        amount,
        commission,
        amount - commission,
        new Date(Date.now() + 900000).toISOString(),
        now(),
        now(),
      ],
    );
    await audit(tx, user.id, "order.create", orderId);
    return tx.one("SELECT * FROM moli_orders WHERE id=?", [orderId]);
  });
}
export async function applyPayment(db, result) {
  return db.tx(async (tx) => {
    const order = await tx.one(
      "SELECT * FROM moli_orders WHERE order_no=?" + tx.lock,
      [result.orderNo],
    );
    assert(order, 404, "订单不存在");
    assert(
      order.amount_cents === result.amountCents &&
        order.payment_channel === result.channel,
      400,
      "支付金额或渠道不匹配",
    );
    assert(
      typeof result.tradeNo === "string" && result.tradeNo.length > 0,
      400,
      "缺少支付交易号",
    );
    if (
      order.payment_status === "paid" ||
      order.payment_status === "refunded"
    ) {
      assert(
        order.gateway_trade_no === result.tradeNo,
        409,
        "订单交易号不匹配",
      );
      return order;
    }
    // Late paid notifications are recorded for refund, never silently discarded.
    const isLate =
      order.status !== "awaiting_payment" || order.expires_at <= now();
    await tx.run(
      "UPDATE moli_orders SET payment_status=?,gateway_trade_no=?,paid_at=?,status=?,refund_status=?,refund_reason=?,updated_at=? WHERE id=?",
      [
        "paid",
        result.tradeNo,
        now(),
        isLate ? "cancelled" : "paid",
        isLate ? "requested" : "none",
        isLate ? "超时或已取消订单收到付款，需原路退款" : "",
        now(),
        order.id,
      ],
    );
    await audit(tx, null, "payment.confirmed", order.id, result.channel);
    return tx.one("SELECT * FROM moli_orders WHERE id=?", [order.id]);
  });
}
export async function orderAccess(db, orderId, user, lock = false) {
  const order = await db.one(
    `SELECT o.*,p.user_id AS provider_user_id,p.nickname,u.name AS customer_name FROM moli_orders o JOIN moli_providers p ON p.id=o.provider_id JOIN moli_users u ON u.id=o.customer_id WHERE o.id=?` +
      (lock ? db.lock : ""),
    [orderId],
  );
  assert(order, 404, "订单不存在");
  assert(
    user.role === "admin" ||
      order.customer_id === user.id ||
      order.provider_user_id === user.id,
    403,
    "无权访问此订单",
  );
  return order;
}
export async function transitionOrder(db, orderId, user, action) {
  return db.tx(async (tx) => {
    const o = await orderAccess(tx, orderId, user, true);
    const customer = o.customer_id === user.id,
      provider = o.provider_user_id === user.id;
    const transitions = {
      accept: { from: ["paid"], to: "accepted", allowed: provider },
      reject: { from: ["paid"], to: "cancelled", allowed: provider },
      start: { from: ["accepted"], to: "in_service", allowed: provider },
      finish: {
        from: ["in_service"],
        to: "awaiting_confirmation",
        allowed: provider,
      },
      confirm: {
        from: ["awaiting_confirmation"],
        to: "completed",
        allowed: customer,
      },
      cancel: {
        from: ["awaiting_payment"],
        to: "cancelled",
        allowed: customer,
      },
    };
    const t = transitions[action];
    assert(t && t.allowed, 403, "无权执行此操作");
    assert(t.from.includes(o.status), 409, "订单状态已变化，请刷新");
    assert(
      action !== "cancel" || o.payment_status === "unpaid",
      409,
      "已付款订单请申请退款",
    );
    if (action === "start")
      assert(
        new Date(o.start_at).getTime() <= Date.now() + 900000,
        409,
        "请在预约开始前15分钟内开始服务",
      );
    await tx.run(
      "UPDATE moli_orders SET status=?,refund_status=?,refund_reason=?,completed_at=?,updated_at=? WHERE id=?",
      [
        t.to,
        action === "reject" ? "requested" : o.refund_status,
        action === "reject" ? "陪玩无法接单" : o.refund_reason,
        action === "confirm" ? now() : o.completed_at,
        now(),
        o.id,
      ],
    );
    await audit(tx, user.id, "order." + action, o.id);
    return tx.one("SELECT * FROM moli_orders WHERE id=?", [o.id]);
  });
}
