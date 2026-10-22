import { Router } from "express";
import { z } from "zod";
import { assert, ok, now } from "../lib/errors.js";
import { id, audit } from "../lib/security.js";
import {
  applicationSchema,
  serviceSchema,
  scheduleSchema,
  pagination,
  text,
} from "../lib/validation.js";
import { createOrder, orderAccess, transitionOrder } from "../lib/orders.js";
import { ticketRoutes } from "./tickets.js";

export async function earnings(db, providerId) {
  const earned = await db.one(
    "SELECT COALESCE(SUM(income_cents),0) AS total FROM moli_orders WHERE provider_id=? AND status='completed' AND payment_status='paid' AND refund_status='none'",
    [providerId],
  );
  const spent = await db.one(
    "SELECT COALESCE(SUM(amount_cents),0) AS total FROM moli_payouts WHERE provider_id=? AND state!='rejected'",
    [providerId],
  );
  return {
    earnedCents: Number(earned.total),
    reservedCents: Number(spent.total),
    availableCents: Number(earned.total) - Number(spent.total),
  };
}
export function businessRoutes({ db, config, requireAuth, requireRole }) {
  const router = Router();
  router.use(requireAuth);
  router.get("/application", async (req, res) => {
    const a = await db.one("SELECT * FROM moli_applications WHERE user_id=?", [
      req.user.id,
    ]);
    ok(
      res,
      a ? { ...a, data: JSON.parse(a.data_json), data_json: undefined } : null,
    );
  });
  router.post("/application", async (req, res) => {
    assert(req.user.role === "customer", 409, "你的账号已经开通陪玩或管理权限");
    const data = applicationSchema.parse(req.body);
    const appId = await db.tx(async (tx) => {
      const applicant = await tx.one(
        "SELECT role,state FROM moli_users WHERE id=?" + tx.lock,
        [req.user.id],
      );
      assert(
        applicant?.role === "customer" && applicant.state === "active",
        409,
        "账号权限已变化，请重新登录",
      );
      const a = await tx.one(
        "SELECT * FROM moli_applications WHERE user_id=?",
        [req.user.id],
      );
      assert(
        !a || a.status === "rejected",
        409,
        "已有申请正在审核，请等待结果",
      );
      if (a) {
        await tx.run(
          "UPDATE moli_applications SET data_json=?,status='pending',reason='',reviewed_by=NULL,reviewed_at=NULL,created_at=? WHERE id=?",
          [JSON.stringify(data), now(), a.id],
        );
        return a.id;
      }
      const appId = id();
      await tx.run(
        "INSERT INTO moli_applications (id,user_id,data_json,created_at) VALUES (?,?,?,?)",
        [appId, req.user.id, JSON.stringify(data), now()],
      );
      return appId;
    });
    ok(res, { id: appId }, "申请已提交，审核结果会显示在此页面", 201);
  });
  router.get("/favorites", async (req, res) =>
    ok(
      res,
      (
        await db.all("SELECT provider_id FROM moli_favorites WHERE user_id=?", [
          req.user.id,
        ])
      ).map((x) => x.provider_id),
    ),
  );
  router.put("/favorites/:id", async (req, res) => {
    const data = z.object({ saved: z.boolean() }).parse(req.body);
    assert(
      await db.one(
        "SELECT id FROM moli_providers WHERE id=? AND status='active'",
        [req.params.id],
      ),
      404,
      "陪玩不存在",
    );
    await db.tx(async (tx) => {
      await tx.one("SELECT id FROM moli_users WHERE id=?" + tx.lock, [
        req.user.id,
      ]);
      await tx.run(
        "DELETE FROM moli_favorites WHERE user_id=? AND provider_id=?",
        [req.user.id, req.params.id],
      );
      if (data.saved)
        await tx.run(
          "INSERT INTO moli_favorites (user_id,provider_id,created_at) VALUES (?,?,?)",
          [req.user.id, req.params.id, now()],
        );
    });
    ok(res);
  });
  router.post("/orders", async (req, res) => {
    const data = z
      .object({
        serviceId: z.uuid(),
        startAt: z.iso.datetime({ offset: true }),
        durationMinutes: z
          .number()
          .int()
          .min(30)
          .max(240)
          .refine((n) => n % 30 === 0),
        contact: text(120),
        note: text(500, 0).default(""),
      })
      .parse(req.body);
    ok(
      res,
      await createOrder(db, req.user, data, config),
      "预约已创建，请在15分钟内付款",
      201,
    );
  });
  router.get("/orders", async (req, res) => {
    const { page, size } = pagination(req.query);
    let where = "o.customer_id=?",
      params = [req.user.id];
    if (req.query.scope === "provider") {
      assert(
        ["provider", "admin"].includes(req.user.role),
        403,
        "未开通陪玩权限",
      );
      where = "p.user_id=?";
    }
    if (req.query.status) {
      where += " AND o.status=?";
      params.push(String(req.query.status).slice(0, 30));
    }
    const from =
      " FROM moli_orders o JOIN moli_providers p ON p.id=o.provider_id WHERE " +
      where;
    const count = await db.one("SELECT COUNT(*) AS total" + from, params);
    const items = await db.all(
      "SELECT o.id,o.order_no,o.title,o.start_at,o.end_at,o.duration_minutes,o.amount_cents,o.income_cents,o.status,o.payment_status,o.refund_status,o.expires_at,o.created_at,p.nickname" +
        from +
        ` ORDER BY o.created_at DESC LIMIT ${size} OFFSET ${(page - 1) * size}`,
      params,
    );
    ok(res, { items, total: Number(count.total), page, size });
  });
  router.get("/orders/:id", async (req, res) => {
    const o = await orderAccess(db, req.params.id, req.user);
    // Unpaid customer contact data is not disclosed to providers.
    if (req.user.id === o.provider_user_id && o.payment_status === "unpaid") {
      o.contact = "";
      o.note = "";
    }
    const review = await db.one(
      "SELECT rating,content FROM moli_reviews WHERE order_id=?",
      [o.id],
    );
    ok(res, {
      ...o,
      review,
      isCustomer: o.customer_id === req.user.id,
      isProvider: o.provider_user_id === req.user.id,
    });
  });
  router.post("/orders/:id/action", async (req, res) => {
    const data = z
      .object({
        action: z.enum([
          "accept",
          "reject",
          "start",
          "finish",
          "confirm",
          "cancel",
        ]),
      })
      .parse(req.body);
    ok(res, await transitionOrder(db, req.params.id, req.user, data.action));
  });
  router.post("/orders/:id/refund-request", async (req, res) => {
    const data = z.object({ reason: text(500, 5) }).parse(req.body);
    await db.tx(async (tx) => {
      const o = await orderAccess(tx, req.params.id, req.user, true);
      assert(o.customer_id === req.user.id, 403, "仅客户可以申请退款");
      assert(
        o.payment_status === "paid" &&
          o.refund_status === "none" &&
          ["paid", "accepted", "in_service", "awaiting_confirmation"].includes(
            o.status,
          ),
        409,
        "此订单不可申请退款，请通过客服工单反馈",
      );
      await tx.run(
        "UPDATE moli_orders SET status='refund_pending',refund_status='requested',refund_reason=?,refund_previous_status=?,updated_at=? WHERE id=?",
        [data.reason, o.status, now(), o.id],
      );
      await audit(tx, req.user.id, "refund.request", o.id);
    });
    ok(res, null, "退款申请已提交，服务暂停，等待管理者处理");
  });
  router.get("/orders/:id/messages", async (req, res) => {
    await orderAccess(db, req.params.id, req.user);
    const { page, size } = pagination({ ...req.query, size: 50 });
    ok(
      res,
      (
        await db.all(
          `SELECT m.id,m.content,m.created_at,m.user_id,u.name FROM moli_messages m JOIN moli_users u ON u.id=m.user_id WHERE m.order_id=? ORDER BY m.created_at DESC LIMIT ${size} OFFSET ${(page - 1) * size}`,
          [req.params.id],
        )
      ).reverse(),
    );
  });
  router.post("/orders/:id/messages", async (req, res) => {
    const data = z.object({ content: text(1000) }).parse(req.body);
    const o = await orderAccess(db, req.params.id, req.user);
    assert(
      o.payment_status === "paid" &&
        !["cancelled", "completed"].includes(o.status),
      409,
      "仅付款后的服务订单可以沟通",
    );
    await db.run(
      "INSERT INTO moli_messages (id,order_id,user_id,content,created_at) VALUES (?,?,?,?,?)",
      [id(), o.id, req.user.id, data.content, now()],
    );
    ok(res);
  });
  router.post("/orders/:id/review", async (req, res) => {
    const data = z
      .object({ rating: z.number().int().min(1).max(5), content: text(500, 3) })
      .parse(req.body);
    await db.tx(async (tx) => {
      const o = await orderAccess(tx, req.params.id, req.user, true);
      assert(
        o.customer_id === req.user.id &&
          o.status === "completed" &&
          o.payment_status === "paid",
        403,
        "只能评价自己已完成的订单",
      );
      assert(
        !(await tx.one("SELECT id FROM moli_reviews WHERE order_id=?", [o.id])),
        409,
        "此订单已经评价",
      );
      await tx.run(
        "INSERT INTO moli_reviews (id,order_id,customer_id,provider_id,rating,content,created_at) VALUES (?,?,?,?,?,?,?)",
        [
          id(),
          o.id,
          req.user.id,
          o.provider_id,
          data.rating,
          data.content,
          now(),
        ],
      );
    });
    ok(res, null, "感谢你的真实评价", 201);
  });
  router.use("/tickets", ticketRoutes({ db }));
  router.post("/tickets", async (req, res) => {
    const data = z
      .object({
        subject: text(120),
        content: text(3000, 5),
        orderId: z.uuid().nullable().optional(),
      })
      .parse(req.body);
    if (data.orderId) await orderAccess(db, data.orderId, req.user);
    const ticketId = id();
    await db.run(
      "INSERT INTO moli_tickets (id,user_id,order_id,subject,content,created_at,updated_at) VALUES (?,?,?,?,?,?,?)",
      [
        ticketId,
        req.user.id,
        data.orderId || null,
        data.subject,
        data.content,
        now(),
        now(),
      ],
    );
    ok(res, { id: ticketId }, "工单已提交", 201);
  });
  router.use("/provider", requireRole("provider", "admin"));
  router.use("/provider", async (req, res, next) => {
    req.provider = await db.one(
      "SELECT * FROM moli_providers WHERE user_id=?",
      [req.user.id],
    );
    assert(req.provider, 404, "尚未开通陪玩主页");
    next();
  });
  router.get("/provider/dashboard", async (req, res) => {
    const provider = req.provider;
    const services = await db.all(
      "SELECT * FROM moli_services WHERE provider_id=?",
      [provider.id],
    );
    const availability = await db.all(
      "SELECT weekday,start_minute,end_minute FROM moli_availability WHERE provider_id=?",
      [provider.id],
    );
    const payouts = await db.all(
      "SELECT * FROM moli_payouts WHERE provider_id=? ORDER BY created_at DESC LIMIT 30",
      [provider.id],
    );
    ok(res, {
      provider: {
        ...provider,
        tags: JSON.parse(provider.tags_json),
        tags_json: undefined,
      },
      services,
      availability,
      payouts,
      earnings: await earnings(db, provider.id),
    });
  });
  router.patch("/provider/profile", async (req, res) => {
    const data = z
      .object({
        nickname: text(30),
        bio: text(1000, 20),
        city: text(50, 0),
        theme: z.enum(["sage", "peach", "lavender", "sky", "sand", "mint"]),
        tags: z.array(text(15)).max(5),
        accepting: z.boolean(),
      })
      .parse(req.body);
    await db.run(
      "UPDATE moli_providers SET nickname=?,bio=?,city=?,theme=?,tags_json=?,accepting=? WHERE id=?",
      [
        data.nickname,
        data.bio,
        data.city,
        data.theme,
        JSON.stringify(data.tags),
        data.accepting ? 1 : 0,
        req.provider.id,
      ],
    );
    ok(res);
  });
  router.post("/provider/services", async (req, res) => {
    const data = serviceSchema.parse(req.body),
      serviceId = id();
    await db.run(
      "INSERT INTO moli_services (id,provider_id,game,title,skill,rate_cents,description,active,created_at) VALUES (?,?,?,?,?,?,?,?,?)",
      [
        serviceId,
        req.provider.id,
        data.game,
        data.title,
        data.skill,
        data.rateCents,
        data.description,
        data.active ? 1 : 0,
        now(),
      ],
    );
    ok(res, { id: serviceId }, "服务已保存", 201);
  });
  router.put("/provider/services/:id", async (req, res) => {
    const data = serviceSchema.parse(req.body);
    assert(
      await db.one(
        "SELECT id FROM moli_services WHERE id=? AND provider_id=?",
        [req.params.id, req.provider.id],
      ),
      404,
      "服务不存在",
    );
    await db.run(
      "UPDATE moli_services SET game=?,title=?,skill=?,rate_cents=?,description=?,active=? WHERE id=?",
      [
        data.game,
        data.title,
        data.skill,
        data.rateCents,
        data.description,
        data.active ? 1 : 0,
        req.params.id,
      ],
    );
    ok(res);
  });
  router.put("/provider/availability", async (req, res) => {
    const data = scheduleSchema.parse(req.body);
    await db.tx(async (tx) => {
      await tx.one("SELECT id FROM moli_providers WHERE id=?" + tx.lock, [
        req.provider.id,
      ]);
      await tx.run("DELETE FROM moli_availability WHERE provider_id=?", [
        req.provider.id,
      ]);
      for (const s of data)
        await tx.run(
          "INSERT INTO moli_availability (id,provider_id,weekday,start_minute,end_minute) VALUES (?,?,?,?,?)",
          [id(), req.provider.id, s.weekday, s.startMinute, s.endMinute],
        );
    });
    ok(res, null, "档期已更新，已有订单不受影响");
  });
  router.post("/provider/payouts", async (req, res) => {
    const data = z
      .object({ amountCents: z.number().int().min(1000).max(10000000) })
      .parse(req.body);
    await db.tx(async (tx) => {
      await tx.one("SELECT id FROM moli_providers WHERE id=?" + tx.lock, [
        req.provider.id,
      ]);
      const balance = await earnings(tx, req.provider.id);
      assert(data.amountCents <= balance.availableCents, 409, "可结算金额不足");
      await tx.run(
        "INSERT INTO moli_payouts (id,provider_id,amount_cents,created_at) VALUES (?,?,?,?)",
        [id(), req.provider.id, data.amountCents, now()],
      );
      await audit(tx, req.user.id, "payout.request", req.provider.id);
    });
    ok(res, null, "结算申请已提交，运营者会联系你核对收款方式");
  });
  return router;
}
