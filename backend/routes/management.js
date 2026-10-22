import { Router } from "express";
import { z } from "zod";
import { assert, ok, now } from "../lib/errors.js";
import { id, audit } from "../lib/security.js";
import { text, pagination } from "../lib/validation.js";
import { ticketRoutes } from "./tickets.js";
import { listPage } from "../lib/listing.js";

export function managementRoutes({ db, requireAuth, requireRole }) {
  const router = Router();
  router.use(requireAuth, requireRole("admin"));
  router.get("/overview", async (req, res) =>
    ok(
      res,
      await db.one(`SELECT
   (SELECT COUNT(*) FROM moli_users) AS users,(SELECT COUNT(*) FROM moli_providers WHERE status='active') AS providers,
   (SELECT COUNT(*) FROM moli_orders) AS orders,(SELECT COUNT(*) FROM moli_applications WHERE status='pending') AS pending_applications,
   (SELECT COUNT(*) FROM moli_tickets WHERE status='open') AS open_tickets,
   (SELECT COUNT(*) FROM moli_orders WHERE refund_status IN ('requested','processing')) AS pending_refunds,
   (SELECT COALESCE(SUM(amount_cents),0) FROM moli_orders WHERE payment_status='paid') AS collected_cents,
   (SELECT COALESCE(SUM(commission_cents),0) FROM moli_orders WHERE status='completed' AND payment_status='paid') AS revenue_cents`),
    ),
  );
  router.get("/applications", async (req, res) => {
    const { page, size } = pagination(req.query);
    const where = req.query.status ? " WHERE a.status=?" : "",
      params = req.query.status ? [String(req.query.status)] : [];
    const total = await db.one(
      "SELECT COUNT(*) AS n FROM moli_applications a" + where,
      params,
    );
    const items = await db.all(
      "SELECT a.*,u.name,u.email FROM moli_applications a JOIN moli_users u ON u.id=a.user_id" +
        where +
        ` ORDER BY a.created_at DESC LIMIT ${size} OFFSET ${(page - 1) * size}`,
      params,
    );
    ok(res, {
      items: items.map((a) => ({
        ...a,
        data: JSON.parse(a.data_json),
        data_json: undefined,
      })),
      total: Number(total.n),
      page,
      size,
    });
  });
  router.post("/applications/:id/review", async (req, res) => {
    const data = z
      .object({
        action: z.enum(["approve", "reject"]),
        identityReviewed: z.boolean().optional(),
        reason: text(500, 0).default(""),
      })
      .parse(req.body);
    assert(
      data.action !== "approve" || data.identityReviewed,
      400,
      "请先完成成年身份与技能材料审核",
    );
    assert(
      data.action !== "reject" || data.reason.length >= 3,
      400,
      "请填写拒绝原因",
    );
    await db.tx(async (tx) => {
      const a = await tx.one(
        "SELECT * FROM moli_applications WHERE id=?" + tx.lock,
        [req.params.id],
      );
      assert(a, 404, "申请不存在");
      if (a.status === "approved" && data.action === "approve") return;
      assert(a.status === "pending", 409, "申请已被处理，请刷新");
      const user = await tx.one(
        "SELECT * FROM moli_users WHERE id=?" + tx.lock,
        [a.user_id],
      );
      assert(user.state === "active", 409, "申请账号已停用");
      assert(user.role === "customer", 409, "账号角色已变化，请先核对权限");
      if (data.action === "approve") {
        const d = JSON.parse(a.data_json),
          providerId = id();
        await tx.run(
          "INSERT INTO moli_providers (id,user_id,nickname,bio,city,tags_json,verified_at,created_at) VALUES (?,?,?,?,?,?,?,?)",
          [
            providerId,
            user.id,
            d.nickname,
            d.bio,
            d.city,
            JSON.stringify(d.tags),
            now(),
            now(),
          ],
        );
        await tx.run("UPDATE moli_users SET role='provider' WHERE id=?", [
          user.id,
        ]);
        await tx.run(
          "INSERT INTO moli_services (id,provider_id,game,title,skill,rate_cents,description,created_at) VALUES (?,?,?,?,?,?,?,?)",
          [
            id(),
            providerId,
            d.game,
            d.game + " · 轻松开黑",
            d.skill,
            d.rateCents,
            d.bio,
            now(),
          ],
        );
      }
      await tx.run(
        "UPDATE moli_applications SET status=?,reason=?,reviewed_by=?,reviewed_at=? WHERE id=?",
        [
          data.action === "approve" ? "approved" : "rejected",
          data.reason,
          req.user.id,
          now(),
          a.id,
        ],
      );
      await audit(tx, req.user.id, "application." + data.action, a.id);
    });
    ok(res, null, "审核已完成");
  });
  router.get("/orders", async (req, res) => {
    const { page, size } = pagination(req.query),
      params = [];
    let where = " WHERE 1=1";
    if (req.query.status) {
      where += " AND o.status=?";
      params.push(String(req.query.status));
    }
    if (req.query.refunds === "true")
      where += " AND o.refund_status IN ('requested','processing')";
    const from =
      " FROM moli_orders o JOIN moli_providers p ON p.id=o.provider_id JOIN moli_users u ON u.id=o.customer_id" +
      where;
    const total = await db.one("SELECT COUNT(*) AS n" + from, params),
      items = await db.all(
        "SELECT o.*,p.nickname,u.name AS customer_name" +
          from +
          ` ORDER BY o.created_at DESC LIMIT ${size} OFFSET ${(page - 1) * size}`,
        params,
      );
    ok(res, { items, total: Number(total.n), page, size });
  });
  router.post("/orders/:id/refund-reject", async (req, res) => {
    const data = z.object({ reason: text(500, 5) }).parse(req.body);
    await db.tx(async (tx) => {
      const target = await tx.one(
        "SELECT provider_id FROM moli_orders WHERE id=?",
        [req.params.id],
      );
      assert(target, 404, "订单不存在");
      await tx.one("SELECT id FROM moli_providers WHERE id=?" + tx.lock, [
        target.provider_id,
      ]);
      const o = await tx.one("SELECT * FROM moli_orders WHERE id=?" + tx.lock, [
        req.params.id,
      ]);
      assert(
        o?.status === "refund_pending" &&
          o.refund_status === "requested" &&
          o.refund_previous_status,
        409,
        "此退款申请不能拒绝",
      );
      // Older releases freed refund-pending slots. Do not restore a legacy
      // order over a booking that was accepted before this fix was deployed.
      const conflict = await tx.one(
        "SELECT id FROM moli_orders WHERE provider_id=? AND id<>? AND start_at<? AND end_at>? AND ((status='awaiting_payment' AND expires_at>?) OR status IN ('paid','accepted','in_service','awaiting_confirmation','refund_pending')) LIMIT 1",
        [o.provider_id, o.id, o.end_at, o.start_at, now()],
      );
      assert(
        !conflict,
        409,
        "档期已有冲突订单，不能恢复服务，请协调后处理退款",
      );
      await tx.run(
        "UPDATE moli_orders SET status=?,refund_status='none',refund_reason=?,updated_at=? WHERE id=?",
        [
          o.refund_previous_status,
          "退款申请未通过：" + data.reason,
          now(),
          o.id,
        ],
      );
      await audit(tx, req.user.id, "refund.rejected", o.id, data.reason);
    });
    ok(res);
  });
  router.get("/users", async (req, res) => {
    const { page, size } = pagination(req.query);
    const count = await db.one("SELECT COUNT(*) AS n FROM moli_users");
    ok(res, {
      items: await db.all(
        `SELECT id,name,email,role,state,created_at FROM moli_users ORDER BY created_at DESC LIMIT ${size} OFFSET ${(page - 1) * size}`,
      ),
      total: Number(count.n),
      page,
      size,
    });
  });
  router.put("/users/:id/state", async (req, res) => {
    const data = z
      .object({ state: z.enum(["active", "disabled"]) })
      .parse(req.body);
    assert(req.params.id !== req.user.id, 400, "不能停用自己的账号");
    await db.tx(async (tx) => {
      const user = await tx.one(
        "SELECT * FROM moli_users WHERE id=?" + tx.lock,
        [req.params.id],
      );
      assert(user, 404, "账号不存在");
      assert(user.role !== "admin", 403, "管理员账号须通过服务器运维流程管理");
      await tx.run("UPDATE moli_users SET state=? WHERE id=?", [
        data.state,
        user.id,
      ]);
      if (data.state === "disabled")
        await tx.run("DELETE FROM moli_sessions WHERE user_id=?", [user.id]);
      await audit(tx, req.user.id, "user." + data.state, user.id);
    });
    ok(res);
  });
  router.put("/users/:id/role", async (req, res) => {
    const data = z
      .object({ role: z.enum(["customer", "support"]) })
      .parse(req.body);
    assert(req.params.id !== req.user.id, 400, "不能修改自己的权限");
    await db.tx(async (tx) => {
      const user = await tx.one(
        "SELECT * FROM moli_users WHERE id=?" + tx.lock,
        [req.params.id],
      );
      assert(user, 404, "账号不存在");
      assert(
        ["customer", "support"].includes(user.role),
        409,
        "管理员和陪玩账号不能改为客服",
      );
      assert(user.state === "active", 409, "请先恢复账号");
      const application = await tx.one(
        "SELECT status FROM moli_applications WHERE user_id=?",
        [user.id],
      );
      assert(
        !application || application.status === "rejected",
        409,
        "此账号有入驻申请，请先处理申请",
      );
      if (data.role === "support")
        assert(user.email_verified, 409, "客服账号必须先验证邮箱");
      await tx.run("UPDATE moli_users SET role=? WHERE id=?", [
        data.role,
        user.id,
      ]);
      await tx.run("DELETE FROM moli_sessions WHERE user_id=?", [user.id]);
      await audit(tx, req.user.id, "user.role", user.id, data.role);
    });
    ok(res, null, "权限已更新，该账号需要重新登录");
  });
  router.get("/providers", async (req, res) =>
    ok(
      res,
      await listPage(db, req.query, {
        select: "SELECT p.id,p.nickname,p.city,p.status,p.accepting,u.email",
        from: "FROM moli_providers p JOIN moli_users u ON u.id=p.user_id",
        orderBy: "p.created_at DESC,p.id DESC",
      }),
    ),
  );
  router.put("/providers/:id/state", async (req, res) => {
    const data = z
      .object({ status: z.enum(["active", "suspended"]) })
      .parse(req.body);
    const r = await db.run("UPDATE moli_providers SET status=? WHERE id=?", [
      data.status,
      req.params.id,
    ]);
    assert(r.changes, 404, "陪玩不存在");
    await audit(db, req.user.id, "provider." + data.status, req.params.id);
    ok(res);
  });
  router.use("/tickets", ticketRoutes({ db, staff: true }));
  router.get("/announcements", async (req, res) =>
    ok(
      res,
      await listPage(db, req.query, {
        select: "SELECT *",
        from: "FROM moli_announcements",
        orderBy: "created_at DESC,id DESC",
      }),
    ),
  );
  router.post("/announcements", async (req, res) => {
    const data = z
      .object({ title: text(120), content: text(3000), active: z.boolean() })
      .parse(req.body);
    await db.run(
      "INSERT INTO moli_announcements (id,title,content,active,created_at) VALUES (?,?,?,?,?)",
      [id(), data.title, data.content, data.active ? 1 : 0, now()],
    );
    await audit(db, req.user.id, "announcement.create", "site");
    ok(res);
  });
  router.put("/announcements/:id", async (req, res) => {
    const data = z.object({ active: z.boolean() }).parse(req.body);
    await db.run("UPDATE moli_announcements SET active=? WHERE id=?", [
      data.active ? 1 : 0,
      req.params.id,
    ]);
    ok(res);
  });
  router.get("/reviews", async (req, res) =>
    ok(
      res,
      await listPage(db, req.query, {
        select: "SELECT r.*,p.nickname",
        from: "FROM moli_reviews r JOIN moli_providers p ON p.id=r.provider_id",
        orderBy: "r.created_at DESC,r.id DESC",
      }),
    ),
  );
  router.put("/reviews/:id", async (req, res) => {
    const data = z
      .object({ hidden: z.boolean(), reason: text(200, 3) })
      .parse(req.body);
    await db.run("UPDATE moli_reviews SET hidden=? WHERE id=?", [
      data.hidden ? 1 : 0,
      req.params.id,
    ]);
    await audit(db, req.user.id, "review.moderate", req.params.id, data.reason);
    ok(res);
  });
  router.get("/payouts", async (req, res) =>
    ok(
      res,
      await listPage(db, req.query, {
        select: "SELECT x.*,p.nickname",
        from: "FROM moli_payouts x JOIN moli_providers p ON p.id=x.provider_id",
        orderBy: "x.created_at DESC,x.id DESC",
      }),
    ),
  );
  router.put("/payouts/:id", async (req, res) => {
    const data = z
      .object({ state: z.enum(["paid", "rejected"]), reference: text(120, 3) })
      .parse(req.body);
    await db.tx(async (tx) => {
      const p = await tx.one(
        "SELECT * FROM moli_payouts WHERE id=?" + tx.lock,
        [req.params.id],
      );
      assert(p?.state === "requested", 409, "此结算申请已处理");
      await tx.run("UPDATE moli_payouts SET state=?,reference=? WHERE id=?", [
        data.state,
        data.reference,
        p.id,
      ]);
      await audit(
        tx,
        req.user.id,
        "payout." + data.state,
        p.id,
        data.reference,
      );
    });
    ok(res, null, "结算登记已保存");
  });
  router.get("/audit", async (req, res) => {
    ok(
      res,
      await listPage(db, req.query, {
        select: "SELECT a.*,u.name",
        from: "FROM moli_audit a LEFT JOIN moli_users u ON u.id=a.user_id",
        orderBy: "a.created_at DESC,a.id DESC",
      }),
    );
  });
  return router;
}
