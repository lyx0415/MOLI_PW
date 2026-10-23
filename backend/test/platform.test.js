import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { openDatabase, migrate } from "../lib/db.js";
import { loadConfig } from "../lib/config.js";
import { createApp } from "../app.js";
import { seedDemo } from "../scripts/seed-demo.js";
import { applyPayment } from "../lib/orders.js";
import { id, hashPassword, issueSession } from "../lib/security.js";
import mysql from "mysql2/promise";

test("password reset during login cannot leave a new session authenticated with the old password", async (t) => {
  const ctx = await fixture(t);
  const user = await ctx.db.one(
    "SELECT id FROM moli_users WHERE email='customer@demo.moli.test'",
  );
  const changedHash = await hashPassword("ChangedPassword52816");
  const transaction = ctx.db.tx;
  let reset = false;
  ctx.db.tx = async (fn) => {
    if (!reset) {
      reset = true;
      await transaction(async (tx) => {
        await tx.run("UPDATE moli_users SET password_hash=? WHERE id=?", [
          changedHash,
          user.id,
        ]);
        await tx.run("DELETE FROM moli_sessions WHERE user_id=?", [user.id]);
      });
    }
    return transaction(fn);
  };
  const response = await request(ctx.app)
    .post("/api/auth/login")
    .set("Origin", origin)
    .send({ email: "customer@demo.moli.test", password: pass });
  assert.equal(response.status, 401);
  assert.equal(
    (
      await ctx.db.one(
        "SELECT COUNT(*) AS n FROM moli_sessions WHERE user_id=?",
        [user.id],
      )
    ).n,
    0,
  );
});

test("simultaneous password changes cannot overwrite a password reset with stale credentials", async (t) => {
  const ctx = await fixture(t),
    c = await ctx.login("customer@demo.moli.test");
  const changedHash = await hashPassword("ResetPassword52816");
  const transaction = ctx.db.tx;
  let reset = false;
  ctx.db.tx = async (fn) => {
    if (!reset) {
      reset = true;
      await transaction(async (tx) => {
        await tx.run("UPDATE moli_users SET password_hash=? WHERE id=?", [
          changedHash,
          c.user.id,
        ]);
        await tx.run("DELETE FROM moli_sessions WHERE user_id=?", [c.user.id]);
      });
    }
    return transaction(fn);
  };
  const response = await c.put("/auth/password", {
    currentPassword: pass,
    password: "OverwrittenPassword1234",
  });
  assert.equal(response.status, 409);
  assert.equal(
    (
      await ctx.db.one("SELECT password_hash FROM moli_users WHERE id=?", [
        c.user.id,
      ])
    ).password_hash,
    changedHash,
  );
});

const pass = "TestPassword48291",
  origin = "http://localhost:5173";
async function fixture(t) {
  const config = {
    ...loadConfig({ PUBLIC_ORIGIN: origin }),
    sqlitePath: ":memory:",
  };
  let adminDb, database;
  if (process.env.TEST_DB_DRIVER === "mysql") {
    database = "moli_qa_" + id().replaceAll("-", "");
    config.driver = "mysql";
    config.mysql = {
      host: "127.0.0.1",
      port: Number(process.env.TEST_DB_PORT || 3307),
      user: process.env.TEST_DB_USER || "root",
      password: process.env.TEST_DB_PASSWORD || "",
      database,
      connectionLimit: 10,
    };
    adminDb = await mysql.createConnection({
      ...config.mysql,
      database: undefined,
    });
    await adminDb.query(
      "CREATE DATABASE " +
        database +
        " CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci",
    );
  }
  const db = await openDatabase(config);
  await migrate(db);
  await seedDemo(db, pass);
  t.after(async () => {
    await db.close();
    if (adminDb) {
      await adminDb.query("DROP DATABASE " + database);
      await adminDb.end();
    }
  });
  const gateway = {
    label: "测试注入",
    create: async () => ({
      type: "redirect",
      url: "https://openapi.alipay.com/",
    }),
    query: async () => null,
    refund: async () => ({ success: true }),
  };
  const app = createApp({ db, config, gateways: { alipay: gateway } });
  async function login(email) {
    const agent = request.agent(app);
    const result = await agent
      .post("/api/auth/login")
      .set("Origin", origin)
      .send({ email, password: pass });
    assert.equal(result.status, 200);
    const csrf = result.body.data.csrf;
    return {
      agent,
      csrf,
      user: result.body.data.user,
      post: (path, body) =>
        agent
          .post("/api" + path)
          .set("Origin", origin)
          .set("X-CSRF-Token", csrf)
          .send(body),
      put: (path, body) =>
        agent
          .put("/api" + path)
          .set("Origin", origin)
          .set("X-CSRF-Token", csrf)
          .send(body),
    };
  }
  return { db, app, config, login, gateway };
}
function nextSlot() {
  const d = new Date(Date.now() + 86400000);
  d.setUTCHours(10, 0, 0, 0);
  return d.toISOString();
}
async function book(ctx, customer) {
  const service = await ctx.db.one(
    "SELECT s.* FROM moli_services s JOIN moli_providers p ON p.id=s.provider_id JOIN moli_users u ON u.id=p.user_id WHERE u.email='provider1@demo.moli.test' AND s.game='英雄联盟' LIMIT 1",
  );
  const result = await customer.post("/orders", {
    serviceId: service.id,
    startAt: nextSlot(),
    durationMinutes: 60,
    contact: "game#1234",
    note: "test",
  });
  assert.equal(result.status, 201, JSON.stringify(result.body));
  return result.body.data;
}
async function pay(ctx, customer, order) {
  const response = await customer.post("/payments/" + order.id + "/create", {
    channel: "alipay",
  });
  assert.equal(response.status, 200, JSON.stringify(response.body));
  await applyPayment(ctx.db, {
    orderNo: order.order_no,
    channel: "alipay",
    tradeNo: "TX" + order.id,
    amountCents: order.amount_cents,
  });
}

test("public catalog never returns accounts, passwords or contact information", async (t) => {
  const ctx = await fixture(t);
  const r = await request(ctx.app).get("/api/providers");
  assert.equal(r.status, 200);
  assert.equal(r.body.data.total, 6);
  const text = JSON.stringify(r.body);
  for (const key of ["password_hash", "user_id", "@demo", "contact"])
    assert.equal(text.includes(key), false, key);
  assert.equal(r.body.data.items[0].rating, null);
});
test("customer cannot access admin or provider data, and mutations require CSRF and correct origin", async (t) => {
  const ctx = await fixture(t),
    c = await ctx.login("customer@demo.moli.test");
  assert.equal((await c.agent.get("/api/admin/users")).status, 403);
  assert.equal((await c.agent.get("/api/provider/dashboard")).status, 403);
  assert.equal(
    (await c.agent.post("/api/auth/logout").set("Origin", origin).send({}))
      .status,
    403,
  );
  assert.equal(
    (
      await c.agent
        .post("/api/auth/logout")
        .set("Origin", "https://attacker.test")
        .set("X-CSRF-Token", c.csrf)
        .send({})
    ).status,
    403,
  );
  assert.equal((await c.post("/auth/logout", {})).status, 200);
  assert.equal((await c.agent.get("/api/auth/me")).status, 401);
});
test("register enforces adult consent and password strength; no admin role can be supplied", async (t) => {
  const ctx = await fixture(t);
  const send = (body) =>
    request(ctx.app)
      .post("/api/auth/register")
      .set("Origin", origin)
      .send(body);
  assert.equal(
    (
      await send({
        email: "new@test.test",
        name: "new",
        password: "123",
        adult: true,
        terms: true,
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await send({
        email: "new@test.test",
        name: "new",
        password: pass,
        adult: false,
        terms: true,
      })
    ).status,
    400,
  );
  const r = await send({
    email: "new@test.test",
    name: "new",
    password: pass,
    adult: true,
    terms: true,
    role: "admin",
  });
  assert.equal(r.status, 201);
  assert.equal(r.body.data.user.role, "customer");
});
test("approval is idempotent and cannot insert duplicate providers", async (t) => {
  const ctx = await fixture(t),
    c = await ctx.login("customer@demo.moli.test"),
    admin = await ctx.login("admin@demo.moli.test");
  const r = await c.post("/application", {
    nickname: "新陪玩",
    bio: "这是一段足够长的技能介绍，能够展示自己的游戏能力与服务风格。",
    city: "上海",
    contact: "game123",
    game: "英雄联盟",
    skill: "钻石",
    rateCents: 5000,
    tags: ["耐心"],
    adult: true,
    terms: true,
  });
  assert.equal(r.status, 201);
  assert.equal(
    (
      await admin.post("/admin/applications/" + r.body.data.id + "/review", {
        action: "approve",
        identityReviewed: true,
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await admin.post("/admin/applications/" + r.body.data.id + "/review", {
        action: "approve",
        identityReviewed: true,
      })
    ).status,
    200,
  );
  const n = await ctx.db.one(
    "SELECT COUNT(*) AS n FROM moli_providers WHERE user_id=?",
    [c.user.id],
  );
  assert.equal(n.n, 1);
});
test("booking computes price on server and serializes concurrent overlapping reservations", async (t) => {
  const ctx = await fixture(t),
    c = await ctx.login("customer@demo.moli.test"),
    s = await ctx.db.one(
      "SELECT * FROM moli_services WHERE game='英雄联盟' LIMIT 1",
    );
  const body = {
    serviceId: s.id,
    startAt: nextSlot(),
    durationMinutes: 60,
    contact: "test123",
    amountCents: 1,
  };
  const results = await Promise.all([
    c.post("/orders", body),
    c.post("/orders", body),
  ]);
  assert.deepEqual(results.map((r) => r.status).sort(), [201, 409]);
  assert.equal(
    results.find((r) => r.status === 201).body.data.amount_cents,
    s.rate_cents,
  );
});
test("payment validation rejects amount mismatch, and duplicate notifications are idempotent", async (t) => {
  const ctx = await fixture(t),
    c = await ctx.login("customer@demo.moli.test"),
    o = await book(ctx, c);
  await c.post("/payments/" + o.id + "/create", { channel: "alipay" });
  await assert.rejects(
    applyPayment(ctx.db, {
      orderNo: o.order_no,
      channel: "alipay",
      amountCents: 1,
      tradeNo: "bad",
    }),
  );
  const result = {
    orderNo: o.order_no,
    channel: "alipay",
    amountCents: o.amount_cents,
    tradeNo: "txn123",
  };
  await applyPayment(ctx.db, result);
  await applyPayment(ctx.db, result);
  assert.equal(
    (await ctx.db.one("SELECT * FROM moli_orders WHERE id=?", [o.id])).status,
    "paid",
  );
  const n = await ctx.db.one(
    "SELECT COUNT(*) AS n FROM moli_audit WHERE action='payment.confirmed' AND target_id=?",
    [o.id],
  );
  assert.equal(n.n, 1);
});
test("other customers cannot read orders, messages or initiate payments", async (t) => {
  const ctx = await fixture(t),
    c = await ctx.login("customer@demo.moli.test"),
    o = await book(ctx, c);
  await ctx.db.run(
    "INSERT INTO moli_users (id,email,name,password_hash,role,state,terms_version,created_at) VALUES (?,?,?,?,?,?,?,?)",
    [
      id(),
      "other@test.test",
      "other",
      await hashPassword(pass),
      "customer",
      "active",
      "2026-10",
      new Date().toISOString(),
    ],
  );
  const other = await ctx.login("other@test.test");
  assert.equal((await other.agent.get("/api/orders/" + o.id)).status, 403);
  assert.equal(
    (await other.agent.get("/api/orders/" + o.id + "/messages")).status,
    403,
  );
  assert.equal(
    (await other.post("/payments/" + o.id + "/create", { channel: "alipay" }))
      .status,
    403,
  );
});
test("full order lifecycle, one verified review, payout cannot exceed earnings", async (t) => {
  const ctx = await fixture(t),
    c = await ctx.login("customer@demo.moli.test"),
    provider = await ctx.login("provider1@demo.moli.test"),
    o = await book(ctx, c);
  await pay(ctx, c, o);
  assert.equal(
    (await c.post("/orders/" + o.id + "/action", { action: "accept" })).status,
    403,
  );
  assert.equal(
    (await provider.post("/orders/" + o.id + "/action", { action: "accept" }))
      .status,
    200,
  );
  assert.equal(
    (await provider.post("/orders/" + o.id + "/action", { action: "start" }))
      .status,
    409,
  );
  await ctx.db.run("UPDATE moli_orders SET start_at=? WHERE id=?", [
    new Date(Date.now() - 60000).toISOString(),
    o.id,
  ]);
  for (const action of ["start", "finish"])
    assert.equal(
      (await provider.post("/orders/" + o.id + "/action", { action })).status,
      200,
    );
  assert.equal(
    (await c.post("/orders/" + o.id + "/action", { action: "confirm" })).status,
    200,
  );
  assert.equal(
    (
      await c.post("/orders/" + o.id + "/review", {
        rating: 5,
        content: "很好的真实服务体验",
      })
    ).status,
    201,
  );
  assert.equal(
    (
      await c.post("/orders/" + o.id + "/review", {
        rating: 5,
        content: "重复评价",
      })
    ).status,
    409,
  );
  assert.equal(
    (await provider.post("/provider/payouts", { amountCents: 999999 })).status,
    409,
  );
  assert.equal(
    (await provider.post("/provider/payouts", { amountCents: 1000 })).status,
    200,
  );
});
test("paid cancelled or expired orders become refund requests when delayed notifications arrive", async (t) => {
  const ctx = await fixture(t),
    c = await ctx.login("customer@demo.moli.test"),
    o = await book(ctx, c);
  await c.post("/payments/" + o.id + "/create", { channel: "alipay" });
  assert.equal(
    (await c.post("/orders/" + o.id + "/action", { action: "cancel" })).status,
    200,
  );
  await applyPayment(ctx.db, {
    orderNo: o.order_no,
    channel: "alipay",
    tradeNo: "LATE" + o.id,
    amountCents: o.amount_cents,
  });
  const stored = await ctx.db.one("SELECT * FROM moli_orders WHERE id=?", [
    o.id,
  ]);
  assert.equal(stored.status, "cancelled");
  assert.equal(stored.payment_status, "paid");
  assert.equal(stored.refund_status, "requested");
});
test("disabled user loses sessions and disappears from public catalog", async (t) => {
  const ctx = await fixture(t),
    admin = await ctx.login("admin@demo.moli.test"),
    p = await ctx.login("provider1@demo.moli.test");
  assert.equal(
    (
      await admin.put("/admin/users/" + p.user.id + "/state", {
        state: "disabled",
      })
    ).status,
    200,
  );
  assert.equal((await p.agent.get("/api/auth/me")).status, 401);
  assert.equal(
    (await request(ctx.app).get("/api/providers")).body.data.total,
    5,
  );
});
test("refund retries use one stable request number after an uncertain gateway response", async (t) => {
  const ctx = await fixture(t),
    c = await ctx.login("customer@demo.moli.test"),
    admin = await ctx.login("admin@demo.moli.test"),
    o = await book(ctx, c);
  await pay(ctx, c, o);
  assert.equal(
    (
      await c.post("/orders/" + o.id + "/refund-request", {
        reason: "预约时间变动，申请退款",
      })
    ).status,
    200,
  );
  const numbers = [];
  ctx.gateway.refund = async (order) => {
    numbers.push(order.refund_no);
    if (numbers.length === 1) throw new Error("simulated timeout");
    return { success: true };
  };
  ctx.gateway.queryRefund = async () => {
    throw new Error("not yet created");
  };
  assert.equal(
    (await admin.post("/payments/" + o.id + "/refund", {})).status,
    500,
  );
  assert.equal(
    (await admin.post("/payments/" + o.id + "/refund", {})).status,
    200,
  );
  assert.equal(numbers.length, 2);
  assert.equal(numbers[0], numbers[1]);
  assert.equal(
    (
      await ctx.db.one("SELECT payment_status FROM moli_orders WHERE id=?", [
        o.id,
      ])
    ).payment_status,
    "refunded",
  );
});
test("different customers cannot overlap one provider; refund denial restores prior service state", async (t) => {
  const ctx = await fixture(t),
    c = await ctx.login("customer@demo.moli.test"),
    admin = await ctx.login("admin@demo.moli.test");
  await ctx.db.run(
    "INSERT INTO moli_users (id,email,name,password_hash,role,state,terms_version,created_at) VALUES (?,?,?,?,?,?,?,?)",
    [
      id(),
      "concurrent@test.test",
      "other",
      await hashPassword(pass),
      "customer",
      "active",
      "2026-10",
      new Date().toISOString(),
    ],
  );
  const other = await ctx.login("concurrent@test.test");
  const s = await ctx.db.one(
      "SELECT * FROM moli_services WHERE game='英雄联盟' LIMIT 1",
    ),
    body = {
      serviceId: s.id,
      startAt: nextSlot(),
      durationMinutes: 60,
      contact: "test-contact",
    };
  const r = await Promise.all([
    c.post("/orders", body),
    other.post("/orders", body),
  ]);
  assert.deepEqual(r.map((x) => x.status).sort(), [201, 409]);
  const winner = r[0].status === 201 ? c : other,
    o = r.find((x) => x.status === 201).body.data;
  await pay(ctx, winner, o);
  await winner.post("/orders/" + o.id + "/refund-request", {
    reason: "需要售后核对的退款请求",
  });
  const loser = winner === c ? other : c;
  assert.equal(
    (await loser.post("/orders", body)).status,
    409,
    "a pending refund must keep its slot reserved until the decision is final",
  );
  assert.equal(
    (
      await admin.post("/admin/orders/" + o.id + "/refund-reject", {
        reason: "已核对记录，请与客服继续协商。",
      })
    ).status,
    200,
  );
  const stored = await ctx.db.one("SELECT * FROM moli_orders WHERE id=?", [
    o.id,
  ]);
  assert.equal(stored.status, "paid");
  assert.equal(stored.refund_status, "none");
  assert.match(stored.refund_reason, /未通过/);
  assert.equal((await loser.post("/orders", body)).status, 409);
  await winner.post("/orders/" + o.id + "/refund-request", {
    reason: "确认无法继续服务，申请退款",
  });
  ctx.gateway.refund = async () => ({ processing: true });
  assert.equal(
    (await admin.post("/payments/" + o.id + "/refund", {})).status,
    200,
  );
  assert.equal((await loser.post("/orders", body)).status, 409);
  ctx.gateway.queryRefund = async () => ({ success: true });
  assert.equal(
    (await admin.post("/payments/" + o.id + "/refund", {})).status,
    200,
  );
  assert.equal((await loser.post("/orders", body)).status, 201);
  // Simulate an overlapping refund-pending record retained from an older release.
  await ctx.db.run(
    "UPDATE moli_orders SET status='refund_pending',payment_status='paid',refund_status='requested',refund_previous_status='paid' WHERE id=?",
    [o.id],
  );
  assert.equal(
    (
      await admin.post("/admin/orders/" + o.id + "/refund-reject", {
        reason: "尝试恢复旧版本的重叠订单",
      })
    ).status,
    409,
  );
});

test("fractional, nonfinite and structured pagination never generate invalid SQL", async (t) => {
  const ctx = await fixture(t),
    admin = await ctx.login("admin@demo.moli.test");
  for (const query of [
    "page=1.5&size=2.7",
    "page=Infinity&size=NaN",
    "page[x]=1&size[]=1",
    "page=-2&size=0",
  ]) {
    for (const path of [
      "/api/providers",
      "/api/orders",
      "/api/admin/users",
      "/api/admin/applications",
      "/api/admin/audit",
      "/api/tickets",
    ]) {
      const r = await admin.agent.get(path + "?" + query);
      assert.equal(r.status, 200, path + "?" + query);
      assert(Number.isInteger(r.body.data.page));
      assert(Number.isInteger(r.body.data.size));
    }
  }
});

test("operational lists and customer tickets remain reachable beyond the old row caps", async (t) => {
  const ctx = await fixture(t),
    c = await ctx.login("customer@demo.moli.test"),
    admin = await ctx.login("admin@demo.moli.test");
  const oldest = id();
  await ctx.db.tx(async (tx) => {
    for (let i = 0; i < 205; i++) {
      const timestamp = new Date(Date.now() + i * 1000).toISOString();
      await tx.run(
        "INSERT INTO moli_tickets (id,user_id,subject,content,created_at,updated_at) VALUES (?,?,?,?,?,?)",
        [
          i ? id() : oldest,
          c.user.id,
          "历史工单" + i,
          "需要处理的历史工单",
          timestamp,
          timestamp,
        ],
      );
    }
  });
  for (const [actor, path] of [
    [c, "/api/tickets"],
    [admin, "/api/admin/tickets"],
  ]) {
    const r = await actor.agent.get(path + "?page=18");
    assert.equal(r.status, 200);
    assert.equal(r.body.data.total, 205);
    assert.equal(r.body.data.items[0].id, oldest);
  }
  for (const path of [
    "providers",
    "announcements",
    "reviews",
    "payouts",
    "audit",
  ]) {
    const r = await admin.agent.get("/api/admin/" + path + "?page=2&size=2");
    assert.equal(r.status, 200);
    assert.equal(r.body.data.page, 2);
    assert.equal(r.body.data.size, 2);
    assert(Array.isArray(r.body.data.items));
  }
});

test("support permissions are limited to tickets; customer and provider conversations are private", async (t) => {
  const ctx = await fixture(t),
    c = await ctx.login("customer@demo.moli.test"),
    p = await ctx.login("provider1@demo.moli.test"),
    support = await ctx.login("support@demo.moli.test");
  const o = await book(ctx, c);
  const ticket = await c.post("/tickets", {
    subject: "订单咨询",
    content: "请帮忙核对这笔订单",
    orderId: o.id,
  });
  assert.equal(ticket.status, 201);
  const path = "/tickets/" + ticket.body.data.id;
  assert.equal(
    (await support.agent.get("/api/support/tickets")).body.data.total,
    1,
  );
  assert.equal(
    (await support.agent.get("/api/support" + path + "/messages")).status,
    200,
  );
  assert.equal((await p.agent.get("/api" + path + "/messages")).status, 403);
  assert.equal((await c.agent.get("/api/support/tickets")).status, 403);
  assert.equal((await p.agent.get("/api/support/tickets")).status, 403);
  for (const resource of ["users", "payouts", "orders", "audit"]) {
    assert.equal(
      (await support.agent.get("/api/admin/" + resource)).status,
      403,
    );
  }
  assert.equal((await support.agent.get("/api/orders/" + o.id)).status, 403);
  assert.equal(
    (await support.post("/payments/" + o.id + "/refund", {})).status,
    403,
  );
  assert.equal(
    (
      await p.post("/tickets", {
        subject: "陪玩咨询",
        content: "需要了解结算流程",
      })
    ).status,
    201,
  );
  assert.equal((await p.agent.get("/api/tickets")).body.data.total, 1);
  assert.equal((await c.agent.get("/api/tickets")).body.data.total, 1);
  assert.equal(
    (await support.agent.get("/api/support/tickets")).body.data.total,
    2,
  );
});

test("simultaneous staff replies cannot overwrite each other; customer followups reopen resolved tickets", async (t) => {
  const ctx = await fixture(t),
    c = await ctx.login("customer@demo.moli.test"),
    admin = await ctx.login("admin@demo.moli.test"),
    support = await ctx.login("support@demo.moli.test");
  const created = await c.post("/tickets", {
    subject: "售后沟通",
    content: "请核对我的服务问题",
  });
  const path = "/tickets/" + created.body.data.id;
  const original = (await c.agent.get("/api" + path + "/messages")).body.data
    .ticket;
  const body = {
    reply: "已核对记录，先为您登记处理。",
    status: "resolved",
    updatedAt: original.updated_at,
  };
  const replies = await Promise.all([
    admin.put("/admin" + path, body),
    support.put("/support" + path, {
      ...body,
      reply: "另一位客服的回复不能覆盖先前处理。",
    }),
  ]);
  assert.deepEqual(replies.map((r) => r.status).sort(), [200, 409]);
  let history = (await c.agent.get("/api" + path + "/messages")).body.data;
  assert.equal(history.total, 1);
  assert.equal(history.ticket.status, "resolved");
  assert.equal(
    (
      await c.post(path + "/messages", {
        content: "我还有补充情况，请继续处理。",
        updatedAt: original.updated_at,
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await c.post(path + "/messages", {
        content: "我还有补充情况，请继续处理。",
        updatedAt: history.ticket.updated_at,
      })
    ).status,
    200,
  );
  history = (await c.agent.get("/api" + path + "/messages")).body.data;
  assert.equal(history.total, 2);
  assert.equal(history.ticket.status, "open");
  assert.equal(
    (
      await support.put("/support" + path, {
        ...body,
        updatedAt: history.ticket.updated_at,
      })
    ).status,
    200,
  );
  assert.equal(
    (await c.agent.get("/api" + path + "/messages")).body.data.total,
    3,
  );
  const audits = await ctx.db.all(
    "SELECT * FROM moli_audit WHERE target_id=? AND action='ticket.reply'",
    [original.id],
  );
  assert.equal(audits.length, 2);
});

test("admin grants and revokes verified support accounts, invalidates sessions and blocks privilege escalation", async (t) => {
  const ctx = await fixture(t),
    c = await ctx.login("customer@demo.moli.test"),
    admin = await ctx.login("admin@demo.moli.test"),
    support = await ctx.login("support@demo.moli.test"),
    p = await ctx.login("provider1@demo.moli.test");
  const path = "/admin/users/" + c.user.id + "/role";
  assert.equal((await support.put(path, { role: "support" })).status, 403);
  assert.equal((await admin.put(path, { role: "admin" })).status, 400);
  assert.equal(
    (
      await admin.put("/admin/users/" + p.user.id + "/role", {
        role: "support",
      })
    ).status,
    409,
  );
  await ctx.db.run("UPDATE moli_users SET email_verified=0 WHERE id=?", [
    c.user.id,
  ]);
  assert.equal((await admin.put(path, { role: "support" })).status, 409);
  await ctx.db.run("UPDATE moli_users SET email_verified=1 WHERE id=?", [
    c.user.id,
  ]);
  assert.equal((await admin.put(path, { role: "support" })).status, 200);
  assert.equal((await c.agent.get("/api/auth/me")).status, 401);
  const fresh = await ctx.login("customer@demo.moli.test");
  assert.equal(fresh.user.role, "support");
  assert.equal((await fresh.agent.get("/api/support/tickets")).status, 200);
  assert.equal((await admin.put(path, { role: "customer" })).status, 200);
  assert.equal((await fresh.agent.get("/api/support/tickets")).status, 401);
});

test("users sharing an IP have independent API quotas while each account remains rate limited", async (t) => {
  const ctx = await fixture(t),
    c = await ctx.login("customer@demo.moli.test"),
    support = await ctx.login("support@demo.moli.test"),
    admin = await ctx.login("admin@demo.moli.test"),
    p = await ctx.login("provider1@demo.moli.test");
  let last;
  for (let i = 0; i < 601; i++) last = await c.agent.get("/api/auth/me");
  assert.equal(last.status, 429);
  const results = await Promise.all([
    support.agent.get("/api/support/tickets"),
    admin.agent.get("/api/admin/overview"),
    p.agent.get("/api/provider/dashboard"),
  ]);
  assert.deepEqual(
    results.map((r) => r.status),
    [200, 200, 200],
  );
});

test("support migration retains legacy replies and repeated migrations do not duplicate history", async (t) => {
  const ctx = await fixture(t),
    c = await ctx.login("customer@demo.moli.test"),
    ticketId = id(),
    timestamp = new Date().toISOString();
  await ctx.db.run(
    "INSERT INTO moli_tickets (id,user_id,subject,content,reply,created_at,updated_at) VALUES (?,?,?,?,?,?,?)",
    [
      ticketId,
      c.user.id,
      "旧版工单",
      "旧版用户问题",
      "旧版客服回复需要保留",
      timestamp,
      timestamp,
    ],
  );
  await ctx.db.run("DELETE FROM moli_migrations WHERE name='003-support.sql'");
  await migrate(ctx.db);
  await migrate(ctx.db);
  const history = (await c.agent.get("/api/tickets/" + ticketId + "/messages"))
    .body.data;
  assert.equal(history.total, 1);
  assert.equal(history.items[0].content, "旧版客服回复需要保留");
});

test("24 concurrent sessions can read role dashboards and submit tickets without shared-IP failures", async (t) => {
  const ctx = await fixture(t);
  const users = await ctx.db.all(
    "SELECT id,role FROM moli_users WHERE email IN ('customer@demo.moli.test','provider1@demo.moli.test','support@demo.moli.test','admin@demo.moli.test')",
  );
  const endpoints = {
    customer: "/orders",
    provider: "/provider/dashboard",
    support: "/support/tickets",
    admin: "/admin/overview",
  };
  const sessions = [];
  for (const user of users)
    for (let i = 0; i < 6; i++) {
      sessions.push({
        user,
        ...(await issueSession(ctx.db, user.id, ctx.config)),
      });
    }
  const durations = [];
  const started = performance.now();
  await Promise.all(
    sessions.map(async (session) => {
      for (let i = 0; i < 25; i++) {
        const start = performance.now();
        const response = await request(ctx.app)
          .get("/api" + endpoints[session.user.role])
          .set("Cookie", "moli_session=" + session.token);
        assert.equal(response.status, 200, JSON.stringify(response.body));
        durations.push(performance.now() - start);
        if (session.user.role === "customer" && i % 5 === 0) {
          const response = await request(ctx.app)
            .post("/api/tickets")
            .set("Cookie", "moli_session=" + session.token)
            .set("Origin", origin)
            .set("X-CSRF-Token", session.csrf)
            .send({
              subject: "并发工单",
              content: "同时在线的用户提交客服咨询。",
            });
          assert.equal(response.status, 201, JSON.stringify(response.body));
        }
      }
    }),
  );
  assert.equal(
    (await ctx.db.one("SELECT COUNT(*) AS n FROM moli_tickets")).n,
    30,
  );
  durations.sort((a, b) => a - b);
  t.diagnostic(
    `24 sessions; 600 reads + 30 ticket writes; elapsed ${Math.round(performance.now() - started)}ms; read p95 ${Math.round(durations[Math.ceil(durations.length * 0.95) - 1])}ms. This is a bounded smoke load, not a production capacity guarantee.`,
  );
});

const offlineService = {
  category: "fitness",
  game: "其他游戏",
  title: "周末健身搭伴",
  skill: "基础体能",
  rateCents: 15000,
  description: "轻量运动搭伴，提前沟通训练节奏与场地安排。",
  active: true,
  city: "苏州",
  venue: "测试运动馆一层（虚构）",
  feeNote: "仅含陪练费，场地费由客户另付，预约前确认。",
};

test("offline publication requires admin review, fresh revision and immutable booking terms", async (t) => {
  const ctx = await fixture(t),
    provider = await ctx.login("provider6@demo.moli.test"),
    admin = await ctx.login("admin@demo.moli.test"),
    customer = await ctx.login("customer@demo.moli.test"),
    support = await ctx.login("support@demo.moli.test");
  assert.equal(
    (
      await provider.post("/provider/services", {
        ...offlineService,
        venue: "",
      })
    ).status,
    400,
  );
  const created = await provider.post("/provider/services", offlineService);
  assert.equal(created.status, 201);
  const serviceId = created.body.data.id;
  const draft = async () =>
    (
      await provider.agent.get("/api/provider/dashboard")
    ).body.data.services.find((s) => s.id === serviceId);
  const review = (revision, extra = {}) =>
    admin.post(`/admin/services/${serviceId}/review`, {
      action: "approve",
      reviewed: true,
      revision,
      ...extra,
    });
  const booking = (revision) =>
    customer.post("/orders", {
      serviceId,
      serviceRevision: revision,
      startAt: nextSlot(),
      durationMinutes: 60,
      contact: "test contact",
      note: "",
    });
  let d = await draft();
  assert.equal(d.review_status, "pending");
  assert.equal(
    (
      await request(ctx.app).get(
        "/api/providers?category=fitness&city=" + encodeURIComponent("苏州"),
      )
    ).body.data.total,
    0,
  );
  assert.equal((await booking(d.revision)).status, 409);
  assert.equal(
    (
      await support.post(`/admin/services/${serviceId}/review`, {
        action: "approve",
        reviewed: true,
        revision: d.revision,
      })
    ).status,
    403,
  );
  assert.equal((await review(d.revision, { reviewed: false })).status, 400);
  assert.equal((await review(d.revision)).status, 200);
  assert.equal((await review(d.revision)).status, 409);
  d = await draft();
  const listed = (
    await request(ctx.app).get(
      "/api/providers?category=fitness&city=" + encodeURIComponent("苏州"),
    )
  ).body.data;
  assert.equal(listed.total, 1);
  assert.equal(listed.items[0].min_rate_cents, 15000);
  assert.equal(listed.items[0].services.length, 1);
  assert.equal((await booking(id())).status, 409);
  const order = await booking(d.revision);
  assert.equal(order.status, 201, JSON.stringify(order.body));
  const snapshot = (
    await customer.agent.get("/api/orders/" + order.body.data.id)
  ).body.data.experience;
  assert.deepEqual(snapshot, {
    category: "fitness",
    mode: "offline",
    city: "苏州",
    venue: offlineService.venue,
    feeNote: offlineService.feeNote,
    description: offlineService.description,
  });
  assert.equal(
    (
      await provider.put("/provider/services/" + serviceId, {
        ...offlineService,
        city: "无锡",
        venue: "另一个测试场馆",
        rateCents: 18000,
      })
    ).status,
    200,
  );
  assert.equal((await review(d.revision)).status, 409);
  assert.equal((await draft()).review_status, "pending");
  assert.deepEqual(
    (await customer.agent.get("/api/orders/" + order.body.data.id)).body.data
      .experience,
    snapshot,
  );
  assert.equal(
    (
      await request(ctx.app).get(
        "/api/providers?category=fitness&city=" + encodeURIComponent("无锡"),
      )
    ).body.data.total,
    0,
  );
  const oldOnline = await ctx.db.one(
    "SELECT id FROM moli_services WHERE provider_id=? AND game='英雄联盟'",
    [listed.items[0].id],
  );
  assert.equal(
    (
      await customer.post("/orders", {
        serviceId: oldOnline.id,
        startAt: nextSlot(),
        durationMinutes: 60,
        contact: "test",
        note: "",
      })
    ).status,
    409,
    "online and offline must share occupancy",
  );
  const ticket = await customer.post("/tickets", {
    orderId: order.body.data.id,
    subject: "线下场所确认",
    content: "请帮助核对订单保存的预约场所和费用。",
  });
  assert.equal(ticket.status, 201);
  const thread = await support.agent.get(
    `/api/support/tickets/${ticket.body.data.id}/messages`,
  );
  assert.equal(thread.status, 200);
  assert.deepEqual(thread.body.data.order.experience, snapshot);
  assert.equal("contact" in thread.body.data.order, false);
  assert.equal(
    (await support.agent.get("/api/orders/" + order.body.data.id)).status,
    403,
  );
  assert.equal(
    (await provider.agent.get(`/api/tickets/${ticket.body.data.id}/messages`))
      .status,
    403,
  );
  await migrate(ctx.db); // additive migration remains safe to rerun
});

test("discovery binds city, category, price and mode to the same published service", async (t) => {
  const ctx = await fixture(t),
    provider = await ctx.login("provider6@demo.moli.test"),
    admin = await ctx.login("admin@demo.moli.test");
  const first = (await provider.post("/provider/services", offlineService)).body
    .data.id;
  const second = (
    await provider.post("/provider/services", {
      ...offlineService,
      category: "ktv",
      city: "无锡",
      rateCents: 2000,
    })
  ).body.data.id;
  for (const serviceId of [first, second]) {
    const d = await ctx.db.one(
      "SELECT revision FROM moli_service_details WHERE service_id=?",
      [serviceId],
    );
    assert.equal(
      (
        await admin.post(`/admin/services/${serviceId}/review`, {
          action: "approve",
          reviewed: true,
          revision: d.revision,
        })
      ).status,
      200,
    );
  }
  const search = async (params) =>
    (await request(ctx.app).get("/api/providers").query(params)).body.data;
  assert.equal(
    (await search({ category: "fitness", city: "苏州", maxPrice: 3000 })).total,
    0,
  );
  assert.equal((await search({ category: "fitness", city: "无锡" })).total, 0);
  assert.equal(
    (await search({ category: "fitness", mode: "online" })).total,
    0,
  );
  const result = await search({
    category: "fitness",
    city: "苏州",
    sort: "price",
  });
  assert.equal(result.total, 1);
  assert.equal(result.items[0].min_rate_cents, 15000);
  const site = (await request(ctx.app).get("/api/site")).body.data;
  assert.ok(
    site.categories.find((c) => c.id === "fitness").cities.includes("苏州"),
  );
  const d = await ctx.db.one(
    "SELECT revision FROM moli_service_details WHERE service_id=?",
    [first],
  );
  assert.equal(
    (
      await admin.post(`/admin/services/${first}/review`, {
        action: "reject",
        revision: d.revision,
        reason: "场所需要重新核对",
      })
    ).status,
    200,
  );
  assert.equal((await search({ category: "fitness", city: "苏州" })).total, 0);
  assert.equal(
    (await request(ctx.app).get("/api/site")).body.data.categories
      .find((c) => c.id === "fitness")
      .cities.includes("苏州"),
    false,
  );
});

test("offline-only applicants can join without publishing an unreviewed initial service", async (t) => {
  const ctx = await fixture(t),
    customer = await ctx.login("customer@demo.moli.test"),
    admin = await ctx.login("admin@demo.moli.test");
  const application = await customer.post("/application", {
    ...offlineService,
    nickname: "运动搭子",
    bio: "这是一段用于审核的运动经验介绍，介绍陪练节奏与服务范围。",
    contact: "test contact",
    tags: ["运动"],
    adult: true,
    terms: true,
  });
  assert.equal(application.status, 201);
  assert.equal(
    (
      await admin.post(
        "/admin/applications/" + application.body.data.id + "/review",
        { action: "approve", identityReviewed: true },
      )
    ).status,
    200,
  );
  const dashboard = (await customer.agent.get("/api/provider/dashboard")).body
    .data;
  assert.equal(dashboard.services[0].category, "fitness");
  assert.equal(dashboard.services[0].review_status, "pending");
  assert.equal(dashboard.services[0].active, 0);
  assert.equal(
    (await request(ctx.app).get("/api/providers/" + dashboard.provider.id)).body
      .data.services.length,
    0,
  );
});
