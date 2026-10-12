import { Router } from "express";
import { z } from "zod";
import { randomInt } from "node:crypto";
import nodemailer from "nodemailer";
import { assert, ok, now } from "../lib/errors.js";
import { email, password, text } from "../lib/validation.js";
import {
  id,
  hashPassword,
  verifyPassword,
  issueSession,
  setSessionCookie,
  publicUser,
  digest,
  audit,
} from "../lib/security.js";

export function accountRoutes({ db, config, requireAuth, mailer }) {
  const router = Router();
  const transporter =
    mailer ||
    (config.env.SMTP_HOST
      ? nodemailer.createTransport({
          host: config.env.SMTP_HOST,
          port: Number(config.env.SMTP_PORT || 465),
          secure: Number(config.env.SMTP_PORT || 465) === 465,
          requireTLS: true,
          auth: config.env.SMTP_USER
            ? { user: config.env.SMTP_USER, pass: config.env.SMTP_PASSWORD }
            : undefined,
        })
      : null);
  const dummyHash = hashPassword("TimingOnlyNeverARealPassword34859");
  async function consumeCode(tx, address, purpose, code) {
    const challenge = await tx.one(
      "SELECT * FROM moli_challenges WHERE email=? AND purpose=? AND used=0 ORDER BY created_at DESC LIMIT 1" +
        tx.lock,
      [address, purpose],
    );
    assert(
      challenge && challenge.expires_at > now() && challenge.attempts < 5,
      400,
      "验证码已过期或无效，请重新获取",
    );
    await tx.run("UPDATE moli_challenges SET attempts=attempts+1 WHERE id=?", [
      challenge.id,
    ]);
    const valid = await verifyPassword(code, challenge.code_hash);
    if (valid)
      await tx.run("UPDATE moli_challenges SET used=1 WHERE id=?", [
        challenge.id,
      ]);
    return valid;
  }
  router.post("/challenge", async (req, res) => {
    const data = z
      .object({ email, purpose: z.enum(["register", "reset"]) })
      .parse(req.body);
    assert(transporter, 503, "邮件验证暂未启用，请联系运营者");
    const since = new Date(Date.now() - 900000).toISOString();
    const recent = await db.one(
      "SELECT COUNT(*) AS n FROM moli_challenges WHERE email=? AND created_at>?",
      [data.email, since],
    );
    assert(Number(recent.n) < 3, 429, "验证码发送频繁，请15分钟后再试");
    const code = String(randomInt(100000, 1000000)),
      challengeId = id();
    const user = await db.one("SELECT id FROM moli_users WHERE email=?", [
      data.email,
    ]);
    // Return the same response for unknown reset accounts to prevent enumeration.
    if (data.purpose === "register" || user) {
      await db.run(
        "INSERT INTO moli_challenges (id,email,purpose,code_hash,expires_at,created_at) VALUES (?,?,?,?,?,?)",
        [
          challengeId,
          data.email,
          data.purpose,
          await hashPassword(code),
          new Date(Date.now() + 600000).toISOString(),
          now(),
        ],
      );
      try {
        await transporter.sendMail({
          from: config.env.SMTP_FROM,
          to: data.email,
          subject: "茉莉陪玩 · 邮箱验证码",
          text: `你的验证码为 ${code}，10分钟内有效。请勿向他人提供验证码。如非本人操作，请忽略。`,
        });
      } catch {
        await db.run("UPDATE moli_challenges SET used=1 WHERE id=?", [
          challengeId,
        ]);
        throw new Error("Email delivery failed");
      }
    }
    ok(res, null, "如邮箱符合条件，验证码已发送，10分钟内有效");
  });
  router.post("/register", async (req, res) => {
    const data = z
      .object({
        email,
        name: text(30),
        password,
        code: z.string().max(6).optional(),
        adult: z.literal(true),
        terms: z.literal(true),
      })
      .parse(req.body);
    const hash = await hashPassword(data.password),
      userId = id();
    let badCode = false;
    await db.tx(async (tx) => {
      if (config.emailRequired) {
        if (
          !data.code ||
          !(await consumeCode(tx, data.email, "register", data.code))
        ) {
          badCode = true;
          return;
        }
      }
      const existing = await tx.one("SELECT id FROM moli_users WHERE email=?", [
        data.email,
      ]);
      assert(!existing, 409, "此邮箱已注册，请登录或找回密码");
      await tx.run(
        "INSERT INTO moli_users (id,email,name,password_hash,role,state,email_verified,terms_version,created_at) VALUES (?,?,?,?,?,?,?,?,?)",
        [
          userId,
          data.email,
          data.name,
          hash,
          "customer",
          "active",
          config.emailRequired ? 1 : 0,
          "2026-10",
          now(),
        ],
      );
      await audit(tx, userId, "account.register", userId);
    });
    assert(!badCode, 400, "验证码错误");
    const session = await issueSession(db, userId, config);
    setSessionCookie(res, session.token, config);
    const user = await db.one("SELECT * FROM moli_users WHERE id=?", [userId]);
    ok(res, { user: publicUser(user), csrf: session.csrf }, "注册成功", 201);
  });
  router.post("/login", async (req, res) => {
    const data = z
      .object({ email, password: z.string().max(128) })
      .parse(req.body);
    const user = await db.one("SELECT * FROM moli_users WHERE email=?", [
      data.email,
    ]);
    const valid = await verifyPassword(
      data.password,
      user?.password_hash || (await dummyHash),
    );
    assert(
      valid && user?.state === "active",
      401,
      "邮箱或密码错误，或账号已停用",
    );
    // Rotate the current session rather than retaining a fixed login token.
    if (req.cookies.moli_session)
      await db.run("DELETE FROM moli_sessions WHERE token_hash=?", [
        digest(req.cookies.moli_session),
      ]);
    const session = await issueSession(db, user.id, config);
    setSessionCookie(res, session.token, config);
    ok(res, { user: publicUser(user), csrf: session.csrf }, "欢迎回来");
  });
  router.get("/me", requireAuth, (req, res) =>
    ok(res, { user: publicUser(req.user), csrf: req.session.csrf }),
  );
  router.post("/logout", requireAuth, async (req, res) => {
    await db.run("DELETE FROM moli_sessions WHERE token_hash=?", [
      req.session.token_hash,
    ]);
    res.clearCookie("moli_session", {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure: config.production,
    });
    ok(res);
  });
  router.post("/reset", async (req, res) => {
    assert(transporter, 503, "密码找回暂未启用，请联系运营者");
    const data = z
      .object({ email, code: z.string().length(6), password })
      .parse(req.body);
    const hash = await hashPassword(data.password);
    let invalid = false;
    await db.tx(async (tx) => {
      if (!(await consumeCode(tx, data.email, "reset", data.code))) {
        invalid = true;
        return;
      }
      const user = await tx.one("SELECT id FROM moli_users WHERE email=?", [
        data.email,
      ]);
      assert(user, 400, "验证码无效");
      await tx.run("UPDATE moli_users SET password_hash=? WHERE id=?", [
        hash,
        user.id,
      ]);
      await tx.run("DELETE FROM moli_sessions WHERE user_id=?", [user.id]);
      await audit(tx, user.id, "account.reset", user.id);
    });
    assert(!invalid, 400, "验证码错误");
    ok(res, null, "密码已更新，请重新登录");
  });
  router.patch("/profile", requireAuth, async (req, res) => {
    const data = z.object({ name: text(30) }).parse(req.body);
    await db.run("UPDATE moli_users SET name=? WHERE id=?", [
      data.name,
      req.user.id,
    ]);
    ok(res);
  });
  router.put("/password", requireAuth, async (req, res) => {
    const data = z
      .object({ currentPassword: z.string().max(128), password })
      .parse(req.body);
    assert(
      await verifyPassword(data.currentPassword, req.user.password_hash),
      400,
      "当前密码不正确",
    );
    const hash = await hashPassword(data.password);
    await db.tx(async (tx) => {
      await tx.run("UPDATE moli_users SET password_hash=? WHERE id=?", [
        hash,
        req.user.id,
      ]);
      await tx.run("DELETE FROM moli_sessions WHERE user_id=?", [req.user.id]);
      await audit(tx, req.user.id, "account.password", req.user.id);
    });
    res.clearCookie("moli_session", { path: "/" });
    ok(res, null, "密码已更新，请重新登录");
  });
  return router;
}
