import { Router } from "express";
import { assert, ok } from "../lib/errors.js";
import {
  categories,
  publicDetailColumns,
  published,
} from "../lib/experiences.js";
import { games, pagination } from "../lib/validation.js";

const providerSelect = `SELECT p.id,p.nickname,p.bio,p.city,p.theme,p.tags_json,p.accepting,
 (SELECT MIN(s.rate_cents) FROM moli_services s LEFT JOIN moli_service_details d ON d.service_id=s.id WHERE s.provider_id=p.id AND ${published}) AS min_rate_cents,
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
    const offerings = await db.all(
      `SELECT COALESCE(d.category,'esports') AS category,COALESCE(d.city,'') AS city,COUNT(*) AS n FROM moli_services s JOIN moli_providers p ON p.id=s.provider_id JOIN moli_users u ON u.id=p.user_id LEFT JOIN moli_service_details d ON d.service_id=s.id WHERE ${published} AND p.status='active' AND u.state='active' GROUP BY COALESCE(d.category,'esports'),COALESCE(d.city,'')`,
    );
    ok(res, {
      brand: "茉莉陪玩",
      games,
      categories: categories.map((c) => ({
        ...c,
        serviceCount: offerings
          .filter((o) => o.category === c.id)
          .reduce((n, o) => n + Number(o.n), 0),
        cities: offerings
          .filter((o) => o.category === c.id && o.city)
          .map((o) => o.city)
          .sort(),
      })),
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
    const serviceParams = [],
      conditions = [published];
    if (req.query.game) {
      conditions.push("s.game=?");
      serviceParams.push(String(req.query.game).slice(0, 50));
    }
    if (req.query.category) {
      conditions.push("COALESCE(d.category,'esports')=?");
      serviceParams.push(String(req.query.category).slice(0, 30));
    }
    if (req.query.mode) {
      assert(
        ["online", "offline"].includes(req.query.mode),
        400,
        "服务方式无效",
      );
      conditions.push(
        req.query.mode === "online"
          ? "COALESCE(d.category,'esports')='esports'"
          : "d.category<>'esports'",
      );
    }
    if (req.query.city) {
      conditions.push("d.city=?");
      serviceParams.push(String(req.query.city).trim().slice(0, 50));
    }
    if (req.query.maxPrice) {
      conditions.push("s.rate_cents<=?");
      serviceParams.push(
        Math.max(0, Math.min(200000, Number(req.query.maxPrice) || 200000)),
      );
    }
    const serviceWhere = conditions.join(" AND ");
    let where = ` WHERE p.status='active' AND u.state='active' AND EXISTS (SELECT 1 FROM moli_services s LEFT JOIN moli_service_details d ON d.service_id=s.id WHERE s.provider_id=p.id AND ${serviceWhere})`;
    params.push(...serviceParams);
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
      providerSelect.replace(published, serviceWhere) +
        where +
        " ORDER BY " +
        (sorts[req.query.sort] || sorts.popular) +
        ` ,p.id LIMIT ${size} OFFSET ${(page - 1) * size}`,
      [...serviceParams, ...params],
    );
    const services = items.length
      ? await db.all(
          `SELECT s.id,s.provider_id,s.game,s.title,s.skill,s.rate_cents,${publicDetailColumns} FROM moli_services s LEFT JOIN moli_service_details d ON d.service_id=s.id WHERE ${serviceWhere} AND s.provider_id IN (${items.map(() => "?").join(",")}) ORDER BY s.rate_cents,s.id`,
          [...serviceParams, ...items.map((p) => p.id)],
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
      `SELECT s.id,s.game,s.title,s.skill,s.rate_cents,s.description,${publicDetailColumns} FROM moli_services s LEFT JOIN moli_service_details d ON d.service_id=s.id WHERE s.provider_id=? AND ${published} ORDER BY s.created_at,s.id`,
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
