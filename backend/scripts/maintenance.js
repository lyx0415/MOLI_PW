import { now } from "../lib/errors.js";
export async function maintain(db) {
  await db.run(
    "UPDATE moli_orders SET status='cancelled',updated_at=? WHERE status='awaiting_payment' AND payment_status='unpaid' AND expires_at<=?",
    [now(), now()],
  );
  await db.run("DELETE FROM moli_sessions WHERE expires_at<=?", [now()]);
  await db.run("DELETE FROM moli_challenges WHERE expires_at<?", [
    new Date(Date.now() - 86400000).toISOString(),
  ]);
}
