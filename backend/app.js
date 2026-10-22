import express from "express";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { rateLimit, ipKeyGenerator } from "express-rate-limit";
import { ZodError } from "zod";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { HttpError, assert, ok, now } from "./lib/errors.js";
import { digest, safeEqual } from "./lib/security.js";
import { createGateways } from "./payments/gateways.js";
import { accountRoutes } from "./routes/account.js";
import { catalogRoutes } from "./routes/catalog.js";
import { businessRoutes } from "./routes/business.js";
import { managementRoutes } from "./routes/management.js";
import { paymentRoutes } from "./routes/payments.js";
import { ticketRoutes } from "./routes/tickets.js";

export function createApp({
  db,
  config,
  gateways = createGateways(config),
  mailer,
}) {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", config.trustProxy);
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          "img-src": ["'self'", "data:"],
          "style-src": ["'self'", "'unsafe-inline'"],
          "upgrade-insecure-requests": config.production ? [] : null,
        },
      },
      strictTransportSecurity: config.production ? undefined : false,
    }),
  );
  app.use((req, res, next) => {
    req.requestId = randomUUID();
    res.setHeader("X-Request-Id", req.requestId);
    next();
  });
  app.use(
    express.json({
      limit: "64kb",
      verify: (req, res, buf) => {
        req.rawBody = buf.toString("utf8");
      },
    }),
  );
  app.use(express.urlencoded({ extended: false, limit: "64kb" }));
  app.use(cookieParser());
  const authLimiter = rateLimit({
    windowMs: 900000,
    limit: 30,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: {
      code: 429,
      message: "登录或验证操作频繁，请15分钟后再试",
      data: null,
    },
  });
  for (const path of [
    "/api/auth/login",
    "/api/auth/register",
    "/api/auth/challenge",
    "/api/auth/reset",
  ])
    app.use(path, authLimiter);
  app.use("/api", async (req, res, next) => {
    if (req.cookies.moli_session) {
      const session = await db.one(
        "SELECT s.*,u.id,u.email,u.name,u.password_hash,u.role,u.state,u.email_verified FROM moli_sessions s JOIN moli_users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?",
        [digest(req.cookies.moli_session), now()],
      );
      if (session?.state === "active") {
        req.session = session;
        req.user = session;
      }
    }
    if (
      !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
      !["/payments/notify/wechat", "/payments/notify/alipay"].includes(req.path)
    ) {
      const origin = req.headers.origin;
      assert(origin === config.origin, 403, "请求来源不合法");
      if (
        req.session &&
        ![
          "/auth/login",
          "/auth/register",
          "/auth/reset",
          "/auth/challenge",
        ].includes(req.path)
      )
        assert(
          safeEqual(req.headers["x-csrf-token"], req.session.csrf),
          403,
          "页面验证已过期，请刷新后重试",
        );
    }
    res.setHeader("Cache-Control", "no-store");
    next();
  });
  app.use(
    "/api",
    rateLimit({
      windowMs: 300000,
      limit: 600,
      keyGenerator: (req) =>
        req.user ? "user:" + req.user.id : "ip:" + ipKeyGenerator(req.ip),
      standardHeaders: "draft-8",
      legacyHeaders: false,
      message: { code: 429, message: "请求频繁，请稍后重试", data: null },
    }),
  );
  const requireAuth = (req, res, next) => {
    assert(req.user, 401, "请先登录");
    next();
  };
  const requireRole =
    (...roles) =>
    (req, res, next) => {
      assert(
        req.user && roles.includes(req.user.role),
        403,
        "没有访问此功能的权限",
      );
      next();
    };
  const deps = { db, config, gateways, requireAuth, requireRole, mailer };
  app.get("/api/health", async (req, res) => {
    await db.one("SELECT 1 AS ready");
    ok(res, { status: "ok" });
  });
  app.use("/api/auth", accountRoutes(deps));
  app.use("/api", catalogRoutes(deps));
  app.use("/api/payments", paymentRoutes(deps));
  app.use("/api/admin", managementRoutes(deps));
  app.use(
    "/api/support/tickets",
    requireAuth,
    requireRole("support", "admin"),
    ticketRoutes({ db, staff: true }),
  );
  app.use("/api", businessRoutes(deps));
  app.use("/api", (req, res) => {
    throw new HttpError(404, "接口不存在");
  });
  const dist = resolve(import.meta.dirname, "../frontend/dist");
  if (existsSync(dist)) {
    app.use(express.static(dist, { maxAge: "1h", index: false }));
    app.use((req, res, next) => {
      if (req.method === "GET" && req.accepts("html"))
        res.sendFile(resolve(dist, "index.html"));
      else next();
    });
  }
  app.use((req, res) =>
    res.status(404).json({ code: 404, message: "页面不存在", data: null }),
  );
  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    const status = error instanceof ZodError ? 400 : error.status || 500;
    const message =
      error instanceof ZodError
        ? "输入格式不正确：" + error.issues[0].message
        : status < 500
          ? error.message
          : "服务暂不可用，请稍后重试";
    if (status >= 500)
      console.error(
        JSON.stringify({ requestId: req.requestId, error: error.message }),
      );
    res
      .status(status)
      .json({ code: status, message, data: null, requestId: req.requestId });
  });
  return app;
}
