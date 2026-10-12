import {
  scrypt as scryptCb,
  randomBytes,
  createHash,
  timingSafeEqual,
  randomUUID,
} from "node:crypto";
import { promisify } from "node:util";
const scrypt = promisify(scryptCb);
export const id = () => randomUUID();
export const digest = (text) => createHash("sha256").update(text).digest("hex");
export async function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const key = await scrypt(password, salt, 64);
  return `scrypt:${salt}:${key.toString("hex")}`;
}
export async function verifyPassword(password, stored) {
  try {
    const [kind, salt, hash] = stored.split(":");
    if (kind !== "scrypt") return false;
    const key = await scrypt(password, salt, 64);
    const expected = Buffer.from(hash, "hex");
    return expected.length === key.length && timingSafeEqual(key, expected);
  } catch {
    return false;
  }
}
export function safeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const x = Buffer.from(a),
    y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
export async function audit(db, userId, action, targetId, detail = "") {
  await db.run(
    "INSERT INTO moli_audit (id,user_id,action,target_id,detail,created_at) VALUES (?,?,?,?,?,?)",
    [id(), userId, action, targetId, detail, new Date().toISOString()],
  );
}
export async function issueSession(db, userId, config) {
  const token = randomBytes(32).toString("hex"),
    csrf = randomBytes(32).toString("hex");
  await db.run(
    "INSERT INTO moli_sessions (token_hash,user_id,csrf,expires_at,created_at) VALUES (?,?,?,?,?)",
    [
      digest(token),
      userId,
      csrf,
      new Date(Date.now() + config.sessionHours * 3600000).toISOString(),
      new Date().toISOString(),
    ],
  );
  return { token, csrf };
}
export function setSessionCookie(res, token, config) {
  res.cookie("moli_session", token, {
    httpOnly: true,
    secure: config.production,
    sameSite: "lax",
    path: "/",
    maxAge: config.sessionHours * 3600000,
  });
}
export function publicUser(u) {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    emailVerified: Boolean(u.email_verified),
  };
}
