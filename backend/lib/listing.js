import { pagination } from "./validation.js";

// SQL fragments are repository constants; user input only supplies bounded pages.
export async function listPage(db, query, { select, from, orderBy }) {
  const { page, size } = pagination(query);
  const total = await db.one("SELECT COUNT(*) AS n " + from);
  const items = await db.all(
    `${select} ${from} ORDER BY ${orderBy} LIMIT ${size} OFFSET ${(page - 1) * size}`,
  );
  return { items, total: Number(total.n), page, size };
}
