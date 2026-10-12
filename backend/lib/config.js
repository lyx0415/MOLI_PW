import { resolve } from "node:path";
export function loadConfig(env = process.env) {
  const projectRoot = resolve(import.meta.dirname, "../..");
  const production = env.NODE_ENV === "production";
  const origin = env.PUBLIC_ORIGIN || "http://localhost:5173";
  const commissionBps = Number(env.COMMISSION_BPS || 2000);
  const sessionHours = Number(env.SESSION_HOURS || 72);
  if (
    !Number.isInteger(commissionBps) ||
    commissionBps < 0 ||
    commissionBps > 5000
  )
    throw new Error("COMMISSION_BPS must be 0..5000");
  if (!Number.isInteger(sessionHours) || sessionHours < 1 || sessionHours > 168)
    throw new Error("SESSION_HOURS must be 1..168");
  if (
    production &&
    (!origin.startsWith("https://") ||
      env.DATABASE_DRIVER !== "mysql" ||
      !env.DB_PASSWORD)
  )
    throw new Error(
      "Production requires HTTPS PUBLIC_ORIGIN, MySQL and DB_PASSWORD",
    );
  if (
    production &&
    (!env.SMTP_HOST ||
      !env.SMTP_FROM ||
      !env.SUPPORT_EMAIL ||
      !env.OPERATOR_NAME)
  )
    throw new Error(
      "Production requires SMTP, SUPPORT_EMAIL and OPERATOR_NAME",
    );
  return {
    production,
    projectRoot,
    origin: new URL(origin).origin,
    port: Number(env.PORT || 3000),
    driver: env.DATABASE_DRIVER || "sqlite",
    sqlitePath:
      env.SQLITE_PATH === ":memory:"
        ? ":memory:"
        : resolve(projectRoot, env.SQLITE_PATH || "data/moli.sqlite"),
    mysql: {
      host: env.DB_HOST || "127.0.0.1",
      port: Number(env.DB_PORT || 3306),
      user: env.DB_USER || "moli",
      password: env.DB_PASSWORD,
      database: env.DB_NAME || "peiwang_db",
      connectionLimit: 10,
      charset: "utf8mb4",
      timezone: "Z",
    },
    trustProxy: Number(env.TRUST_PROXY || 0),
    sessionHours,
    commissionBps,
    operator: env.OPERATOR_NAME || "",
    supportEmail: env.SUPPORT_EMAIL || "",
    icp: env.ICP_RECORD || "",
    demo: !production && env.DEMO_MODE === "true",
    emailRequired: production || Boolean(env.SMTP_HOST),
    env,
  };
}
