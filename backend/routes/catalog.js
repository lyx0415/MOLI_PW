import { Router } from "express";
import { assert, ok } from "../lib/errors.js";
import { games, pagination } from "../lib/validation.js";

const providerSelect = `SELECT p.id,p.nickname,p.bio,p.city,p.theme,p.tags_json,p.accepting,
 (SELECT MIN(s.rate_cents) FROM moli_services s WHERE s.provider_id=p.id AND s.active=1) AS min_rate_cents,
 (SELECT AVG(r.rating) FROM moli_reviews r WHERE r.provider_id=p.id AND r.hidden=0) AS rating,
 (SELECT COUNT(*) FROM moli_reviews r WHERE r.provider_id=p.id AND r.hidden=0) AS review_count,
 (SELECT COUNT(*) FROM moli_orders o WHERE o.provider_id=p.id AND o.status='completed') AS completed_count
 FROM moli_providers p JOIN moli_users u ON p.user_id=u.id`;
const shape = (p) => ({
  ...p,
  tags: JSON.parse(p.tags_json),
  tags_json: undefined,
  accepting: Boolean(p.accepting),
  rating: p.rating === null ? null : Number(p.rating),
  min_rate_cents: Number(p.min_rate_cents),
  review_count: Number(p.review_count),
  completed_count: Number(p.completed_count),
});
export function catalogRoutes({ db, config }) {
  const router = Router();
  router.get("/site", async (req, res) => {
    const counts = await db.one(
      `SELECT (SELECT COUNT(*) FROM moli_providers p JOIN moli_users u ON p.user_id=u.id WHERE p.status='active' AND u.state='active') AS providers,(SELECT COUNT(*) FROM moli_orders WHERE status='completed') AS completed`,
    );
    const announcements = await db.all(
      "SELECT id,title,content,created_at FROM moli_announcements WHERE active=1 ORDER BY created_at DESC LIMIT 5",
    );
    ok(res, {
      brand: "茉莉陪玩",
      games,
      counts,
      announcements,
      demo: config.demo,
      emailVerificationRequired: config.emailRequired,
      operator: config.operator,
      supportEmail: config.supportEmail,
      icp: config.icp,
    });
  });
  router.get("/providers", async (req, res) => {
    const { page, size } = pagination(req.query);
    const params = [];
    let where = ` WHERE p.status='active' AND u.state='active' AND EXISTS (SELECT 1 FROM moli_services s WHERE s.provider_id=p.id AND s.active=1)`;
    if (req.query.game) {
      where +=
        " AND EXISTS (SELECT 1 FROM moli_services s WHERE s.provider_id=p.id AND s.active=1 AND s.game=?)";
      params.push(String(req.query.game).slice(0, 50));
    }
    if (req.query.keyword) {
      where += " AND (p.nickname LIKE ? OR p.bio LIKE ?)";
      params.push(
        `%${String(req.query.keyword).slice(0, 100)}%`,
        `%${String(req.query.keyword).slice(0, 100)}%`,
      );
    }
    if (req.query.available === "true") where += " AND p.accepting=1";
    if (req.query.favorites === "true") {
      assert(req.user, 401, "请先登录");
      where +=
        " AND EXISTS (SELECT 1 FROM moli_favorites f WHERE f.user_id=? AND f.provider_id=p.id)";
      params.push(req.user.id);
    }
    if (req.query.maxPrice) {
      const cents = Math.max(
        0,
        Math.min(200000, Number(req.query.maxPrice) || 200000),
      );
      where +=
        " AND EXISTS (SELECT 1 FROM moli_services s WHERE s.provider_id=p.id AND s.active=1 AND s.rate_cents<=?)";
      params.push(cents);
    }
    const count = await db.one(
      "SELECT COUNT(*) AS total FROM moli_providers p JOIN moli_users u ON p.user_id=u.id" +
        where,
      params,
    );
    const sorts = {
      price: "min_rate_cents ASC",
      rating: "rating DESC,review_count DESC",
      popular: "completed_count DESC",
      newest: "p.created_at DESC",
    };
    const items = await db.all(
      providerSelect +
        where +
        " ORDER BY " +
        (sorts[req.query.sort] || sorts.popular) +
        ` LIMIT ${size} OFFSET ${(page - 1) * size}`,
      params,
    );
    const services = items.length
      ? await db.all(
          `SELECT id,provider_id,game,title,skill,rate_cents FROM moli_services WHERE active=1 AND provider_id IN (${items.map(() => "?").join(",")})`,
          items.map((p) => p.id),
        )
      : [];
    ok(res, {
      items: items.map((p) => ({
        ...shape(p),
        services: services.filter((s) => s.provider_id === p.id),
      })),
      total: Number(count.total),
      page,
      size,
    });
  });
  router.get("/providers/:id", async (req, res) => {
    const p = await db.one(
      providerSelect +
        " WHERE p.id=? AND p.status='active' AND u.state='active'",
      [req.params.id],
    );
    assert(p, 404, "陪玩主页不存在或已下架");
    const services = await db.all(
      "SELECT id,game,title,skill,rate_cents,description FROM moli_services WHERE provider_id=? AND active=1",
      [p.id],
    );
    const availability = await db.all(
      "SELECT weekday,start_minute,end_minute FROM moli_availability WHERE provider_id=? ORDER BY weekday,start_minute",
      [p.id],
    );
    const reviews = await db.all(
      "SELECT r.rating,r.content,r.created_at FROM moli_reviews r WHERE r.provider_id=? AND r.hidden=0 ORDER BY r.created_at DESC LIMIT 20",
      [p.id],
    );
    ok(res, { ...shape(p), services, availability, reviews });
  });
  return router;
}
