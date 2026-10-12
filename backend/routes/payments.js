import { Router } from "express";
import { z } from "zod";
import { assert, ok, now } from "../lib/errors.js";
import { applyPayment, orderAccess } from "../lib/orders.js";
import { audit, id } from "../lib/security.js";

export function paymentRoutes({ db, gateways, requireAuth, requireRole }) {
  const router = Router();
  router.get("/channels", (req, res) =>
    ok(
      res,
      Object.entries(gateways).map(([id, g]) => ({
        id,
        label: g.label,
        h5: Boolean(g.h5),
      })),
    ),
  );
  router.post("/notify/alipay", async (req, res) => {
    try {
      assert(gateways.alipay, 503, "支付未配置");
      const result = gateways.alipay.verifyNotify(req.body);
      if (result) await applyPayment(db, result);
      res.type("text").send("success");
    } catch (error) {
      res
        .status(error.status || 500)
        .type("text")
        .send("failure");
    }
  });
  router.post("/notify/wechat", async (req, res) => {
    try {
      assert(gateways.wechat, 503, "支付未配置");
      const result = gateways.wechat.verifyNotify(
        req.body,
        req.headers,
        req.rawBody,
      );
      await applyPayment(db, result);
      res.sendStatus(204);
    } catch (error) {
      res
        .status(error.status || 500)
        .json({ code: "FAIL", message: "通知处理失败" });
    }
  });
  router.post("/:orderId/create", requireAuth, async (req, res) => {
    const data = z
      .object({
        channel: z.enum(["alipay", "wechat"]),
        mobile: z.boolean().optional(),
      })
      .parse(req.body);
    assert(gateways[data.channel], 503, "此支付渠道尚未开放");
    const requestedMode =
      data.channel === "wechat"
        ? data.mobile &&
          gateways.wechat.h5 &&
          !/MicroMessenger/i.test(req.headers["user-agent"] || "")
          ? "h5"
          : "native"
        : data.mobile
          ? "wap"
          : "page";
    const order = await db.tx(async (tx) => {
      const o = await orderAccess(tx, req.params.orderId, req.user, true);
      assert(o.customer_id === req.user.id, 403, "仅订单本人可以付款");
      assert(
        o.status === "awaiting_payment" &&
          o.payment_status === "unpaid" &&
          o.expires_at > now(),
        409,
        "订单已付款、关闭或超时，请重新预约",
      );
      assert(
        !o.payment_channel || o.payment_channel === data.channel,
        409,
        "该订单已选择其他支付渠道，请继续原渠道支付或重新预约",
      );
      await tx.run(
        "UPDATE moli_orders SET payment_channel=?,payment_mode=?,updated_at=? WHERE id=?",
        [data.channel, o.payment_mode || requestedMode, now(), o.id],
      );
      return {
        ...o,
        payment_channel: data.channel,
        payment_mode: o.payment_mode || requestedMode,
      };
    });
    const result = await gateways[data.channel].create(
      order,
      Boolean(data.mobile),
      {
        mode: order.payment_mode,
        ip: req.ip.replace(/^::ffff:/, ""),
        userAgent: req.headers["user-agent"] || "",
      },
    );
    ok(res, { ...result, expiresAt: order.expires_at });
  });
  router.post("/:orderId/sync", requireAuth, async (req, res) => {
    const order = await orderAccess(db, req.params.orderId, req.user);
    assert(
      order.customer_id === req.user.id || req.user.role === "admin",
      403,
      "无权查询支付",
    );
    if (
      order.payment_status === "unpaid" &&
      order.payment_channel &&
      gateways[order.payment_channel]
    ) {
      const result = await gateways[order.payment_channel].query(order);
      if (result) await applyPayment(db, result);
    }
    ok(res, await orderAccess(db, order.id, req.user));
  });
  router.post(
    "/:orderId/refund",
    requireAuth,
    requireRole("admin"),
    async (req, res) => {
      const order = await db.tx(async (tx) => {
        const o = await orderAccess(tx, req.params.orderId, req.user, true);
        assert(
          o.payment_status === "paid" &&
            ["requested", "processing"].includes(o.refund_status),
          409,
          "此订单不可退款",
        );
        assert(
          o.status === "cancelled" || o.status === "refund_pending",
          409,
          "请先处理退款申请",
        );
        assert(
          gateways[o.payment_channel],
          503,
          "支付渠道未配置，退款暂不可用",
        );
        const refundNo = o.refund_no || "RF" + id().replaceAll("-", "");
        await tx.run(
          "UPDATE moli_orders SET refund_no=?,refund_status='processing',updated_at=? WHERE id=?",
          [refundNo, now(), o.id],
        );
        await audit(tx, req.user.id, "refund.submit", o.id);
        return { ...o, refund_no: refundNo };
      });
      const gateway = gateways[order.payment_channel];
      let result;
      if (order.refund_status === "processing") {
        try {
          result = await gateway.queryRefund(order);
        } catch {
          result = await gateway.refund(order);
        }
        if (!result.success && !result.processing)
          result = await gateway.refund(order);
      } else result = await gateway.refund(order);
      if (result.success)
        await db.tx(async (tx) => {
          const o = await tx.one(
            "SELECT * FROM moli_orders WHERE id=?" + tx.lock,
            [order.id],
          );
          if (o.payment_status !== "refunded") {
            await tx.run(
              "UPDATE moli_orders SET payment_status='refunded',refund_status='refunded',status='cancelled',updated_at=? WHERE id=?",
              [now(), o.id],
            );
            await audit(tx, req.user.id, "refund.completed", o.id);
          }
        });
      ok(
        res,
        { processing: !result.success },
        result.success ? "退款成功" : "退款已提交，请稍后查询",
      );
    },
  );
  return router;
}
