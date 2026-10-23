import { assert, now } from "./errors.js";
import { id, audit } from "./security.js";
import { categoryFor } from "./experiences.js";
export async function saveService(
  db,
  providerId,
  serviceId,
  data,
  userId,
  creating,
) {
  await db.tx(async (tx) => {
    await tx.one("SELECT id FROM moli_providers WHERE id=?" + tx.lock, [
      providerId,
    ]);
    const old = await tx.one(
      "SELECT id FROM moli_services WHERE id=? AND provider_id=?" + tx.lock,
      [serviceId, providerId],
    );
    assert(creating || old, 404, "服务不存在");
    const category = categoryFor(data.category),
      offline = category.mode === "offline";
    const values = [
      offline ? category.name : data.game,
      data.title,
      data.skill,
      data.rateCents,
      data.description,
      data.active && !offline ? 1 : 0,
    ];
    if (creating)
      await tx.run(
        "INSERT INTO moli_services (game,title,skill,rate_cents,description,active,id,provider_id,created_at) VALUES (?,?,?,?,?,?,?,?,?)",
        [...values, serviceId, providerId, now()],
      );
    else
      await tx.run(
        "UPDATE moli_services SET game=?,title=?,skill=?,rate_cents=?,description=?,active=? WHERE id=?",
        [...values, serviceId],
      );
    await tx.run("DELETE FROM moli_service_details WHERE service_id=?", [
      serviceId,
    ]);
    await tx.run(
      "INSERT INTO moli_service_details (service_id,category,city,venue,fee_note,review_status,requested_active,revision,updated_at) VALUES (?,?,?,?,?,?,?,?,?)",
      [
        serviceId,
        category.id,
        offline ? data.city : "",
        offline ? data.venue : "",
        offline ? data.feeNote : "",
        offline ? "pending" : "approved",
        data.active ? 1 : 0,
        id(),
        now(),
      ],
    );
    await audit(
      tx,
      userId,
      offline ? "service.submit" : "service.save",
      serviceId,
    );
  });
}
