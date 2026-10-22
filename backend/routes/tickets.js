import { Router } from "express";
import { z } from "zod";
import { assert, ok } from "../lib/errors.js";
import { id, audit } from "../lib/security.js";
import { pagination, text } from "../lib/validation.js";

// Mounted behind authentication and, for staff, the support/admin role guard.
export function ticketRoutes({ db, staff = false }) {
  const router = Router();
  router.get("/", async (req, res) => {
    const { page, size } = pagination(req.query);
    const conditions = [],
      params = [];
    if (!staff) {
      conditions.push("t.user_id=?");
      params.push(req.user.id);
    }
    if (req.query.status) {
      conditions.push("t.status=?");
      params.push(z.enum(["open", "resolved"]).parse(req.query.status));
    }
    const from =
      " FROM moli_tickets t JOIN moli_users u ON u.id=t.user_id" +
      (conditions.length ? " WHERE " + conditions.join(" AND ") : "");
    const total = await db.one("SELECT COUNT(*) AS n" + from, params);
    const items = await db.all(
      "SELECT t.*" +
        (staff ? ",u.name,u.email" : "") +
        from +
        ` ORDER BY t.updated_at DESC,t.id DESC LIMIT ${size} OFFSET ${(page - 1) * size}`,
      params,
    );
    ok(res, { items, total: Number(total.n), page, size });
  });
  async function accessible(database, req, lock = false) {
    const ticket = await database.one(
      "SELECT * FROM moli_tickets WHERE id=?" + (lock ? database.lock : ""),
      [req.params.id],
    );
    assert(ticket, 404, "工单不存在");
    assert(staff || ticket.user_id === req.user.id, 403, "无权访问此工单");
    return ticket;
  }
  router.get("/:id/messages", async (req, res) => {
    // Read the revision and messages together so a concurrent reply cannot be
    // acknowledged by a client that has not yet seen it.
    const data = await db.tx(async (tx) => {
      const ticket = await accessible(tx, req, true);
      const { page, size } = pagination(req.query);
      const total = await tx.one(
        "SELECT COUNT(*) AS n FROM moli_ticket_messages WHERE ticket_id=?",
        [ticket.id],
      );
      const items = await tx.all(
        `SELECT m.id,m.author_role,m.content,m.created_at,u.name FROM moli_ticket_messages m LEFT JOIN moli_users u ON u.id=m.user_id WHERE m.ticket_id=? ORDER BY m.created_at DESC,m.id DESC LIMIT ${size} OFFSET ${(page - 1) * size}`,
        [ticket.id],
      );
      return {
        ticket,
        items: items.reverse(),
        total: Number(total.n),
        page,
        size,
      };
    });
    ok(res, data);
  });
  async function append(req, res) {
    const data = (
      staff
        ? z.object({
            reply: text(3000, 3),
            status: z.enum(["open", "resolved"]),
            updatedAt: z.iso.datetime(),
          })
        : z.object({ content: text(3000, 3), updatedAt: z.iso.datetime() })
    ).parse(req.body);
    await db.tx(async (tx) => {
      const ticket = await accessible(tx, req, true);
      assert(
        ticket.updated_at === data.updatedAt,
        409,
        "工单已有新消息，请刷新后再提交，输入内容已保留",
      );
      const timestamp = new Date(
        Math.max(Date.now(), Date.parse(ticket.updated_at) + 1),
      ).toISOString();
      const content = staff ? data.reply : data.content;
      await tx.run(
        "INSERT INTO moli_ticket_messages (id,ticket_id,user_id,author_role,content,created_at) VALUES (?,?,?,?,?,?)",
        [
          id(),
          ticket.id,
          req.user.id,
          staff ? req.user.role : "customer",
          content,
          timestamp,
        ],
      );
      await tx.run(
        "UPDATE moli_tickets SET reply=?,status=?,updated_at=? WHERE id=?",
        [
          staff ? content : ticket.reply,
          staff ? data.status : "open",
          timestamp,
          ticket.id,
        ],
      );
      await audit(
        tx,
        req.user.id,
        staff ? "ticket.reply" : "ticket.followup",
        ticket.id,
        staff ? data.status : "open",
      );
    });
    ok(res, null, staff ? "工单处理已保存" : "追问已发送");
  }
  if (staff) router.put("/:id", append);
  else router.post("/:id/messages", append);
  return router;
}
