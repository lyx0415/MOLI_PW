import { Router } from "express";
import { z } from "zod";
import { assert, ok, now } from "../lib/errors.js";
import { id, audit } from "../lib/security.js";
import { text, pagination } from "../lib/validation.js";

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
  router.get("/providers", async (req, res) =>
    ok(
      res,
      await db.all(
        "SELECT p.id,p.nickname,p.city,p.status,p.accepting,u.email FROM moli_providers p JOIN moli_users u ON u.id=p.user_id ORDER BY p.created_at DESC LIMIT 200",
      ),
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
  router.get("/tickets", async (req, res) =>
    ok(
      res,
      await db.all(
        "SELECT t.*,u.name,u.email FROM moli_tickets t JOIN moli_users u ON u.id=t.user_id ORDER BY t.created_at DESC LIMIT 200",
      ),
    ),
  );
  router.put("/tickets/:id", async (req, res) => {
    const data = z
      .object({ reply: text(3000, 3), status: z.enum(["open", "resolved"]) })
      .parse(req.body);
    const r = await db.run(
      "UPDATE moli_tickets SET reply=?,status=?,updated_at=? WHERE id=?",
      [data.reply, data.status, now(), req.params.id],
    );
    assert(r.changes, 404, "工单不存在");
    await audit(db, req.user.id, "ticket.reply", req.params.id);
    ok(res);
  });
  router.get("/announcements", async (req, res) =>
    ok(
      res,
      await db.all(
        "SELECT * FROM moli_announcements ORDER BY created_at DESC LIMIT 100",
      ),
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
      await db.all(
        "SELECT r.*,p.nickname FROM moli_reviews r JOIN moli_providers p ON p.id=r.provider_id ORDER BY r.created_at DESC LIMIT 200",
      ),
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
      await db.all(
        "SELECT x.*,p.nickname FROM moli_payouts x JOIN moli_providers p ON p.id=x.provider_id ORDER BY x.created_at DESC LIMIT 200",
      ),
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
    const { page, size } = pagination({ ...req.query, size: 30 });
    ok(
      res,
      await db.all(
        `SELECT a.*,u.name FROM moli_audit a LEFT JOIN moli_users u ON u.id=a.user_id ORDER BY a.created_at DESC LIMIT ${size} OFFSET ${(page - 1) * size}`,
      ),
    );
  });
  return router;
}
