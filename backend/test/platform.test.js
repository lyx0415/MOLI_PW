import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { openDatabase, migrate } from "../lib/db.js";
import { loadConfig } from "../lib/config.js";
import { createApp } from "../app.js";
import { seedDemo } from "../scripts/seed-demo.js";
import { applyPayment } from "../lib/orders.js";
import { id, hashPassword } from "../lib/security.js";
import mysql from "mysql2/promise";

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
    "SELECT s.* FROM moli_services s JOIN moli_providers p ON p.id=s.provider_id JOIN moli_users u ON u.id=p.user_id WHERE u.email='provider1@demo.moli.test' LIMIT 1",
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
    s = await ctx.db.one("SELECT * FROM moli_services LIMIT 1");
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
  const s = await ctx.db.one("SELECT * FROM moli_services LIMIT 1"),
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
});
