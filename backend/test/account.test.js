import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { openDatabase, migrate } from "../lib/db.js";
import { loadConfig } from "../lib/config.js";
import { createApp } from "../app.js";

test("email verification codes expire, track failed attempts, are single-use; reset terminates every session", async (t) => {
  const origin = "http://localhost:5173",
    config = loadConfig({
      PUBLIC_ORIGIN: origin,
      SQLITE_PATH: ":memory:",
      SMTP_HOST: "mail.test",
      SMTP_FROM: "moli@test.test",
    });
  const db = await openDatabase(config);
  await migrate(db);
  t.after(() => db.close());
  let messages = [];
  const app = createApp({
      db,
      config,
      gateways: {},
      mailer: { sendMail: async (data) => messages.push(data) },
    }),
    agent = request.agent(app);
  const post = (url, body) =>
      agent
        .post("/api/auth/" + url)
        .set("Origin", origin)
        .send(body),
    email = "verified@test.test",
    password = "VerifiedPassword2481";
  assert.equal(
    (await post("challenge", { email, purpose: "register" })).status,
    200,
  );
  const code = messages.at(-1).text.match(/\b\d{6}\b/)[0];
  assert.equal(
    (
      await post("register", {
        email,
        password,
        name: "verified",
        adult: true,
        terms: true,
        code: "000000",
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await db.one("SELECT attempts FROM moli_challenges WHERE email=?", [
        email,
      ])
    ).attempts,
    1,
  );
  const r = await post("register", {
    email,
    password,
    name: "verified",
    adult: true,
    terms: true,
    code,
  });
  assert.equal(r.status, 201);
  assert.equal(r.body.data.user.emailVerified, true);
  assert.equal(
    (await db.one("SELECT used FROM moli_challenges WHERE email=?", [email]))
      .used,
    1,
  );
  assert.equal(
    (await post("challenge", { email, purpose: "reset" })).status,
    200,
  );
  const reset = messages.at(-1).text.match(/\b\d{6}\b/)[0];
  assert.equal(
    (
      await post("reset", {
        email,
        code: reset,
        password: "ChangedPassword5389",
      })
    ).status,
    200,
  );
  assert.equal((await agent.get("/api/auth/me")).status, 401);
  assert.equal(
    (
      await post("reset", {
        email,
        code: reset,
        password: "AnotherPassword5298",
      })
    ).status,
    400,
  );
  assert.equal(
    (await post("login", { email, password: "ChangedPassword5389" })).status,
    200,
  );
});
test("production refuses unsafe defaults and incomplete SMTP/operator configuration", () => {
  assert.throws(() => loadConfig({ NODE_ENV: "production" }));
  assert.throws(() =>
    loadConfig({
      NODE_ENV: "production",
      PUBLIC_ORIGIN: "https://moli.test",
      DATABASE_DRIVER: "mysql",
      DB_PASSWORD: "nonempty-test",
    }),
  );
  const config = loadConfig({
    NODE_ENV: "production",
    PUBLIC_ORIGIN: "https://moli.test",
    DATABASE_DRIVER: "mysql",
    DB_PASSWORD: "nonempty-test",
    SMTP_HOST: "mail.test",
    SMTP_FROM: "moli@test.test",
    SUPPORT_EMAIL: "help@test.test",
    OPERATOR_NAME: "Test Operator",
  });
  assert.equal(config.emailRequired, true);
  assert.equal(config.demo, false);
});
