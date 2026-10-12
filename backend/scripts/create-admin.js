import { loadConfig } from "../lib/config.js";
import { openDatabase, migrate } from "../lib/db.js";
import { id, hashPassword } from "../lib/security.js";
import { email, password, text } from "../lib/validation.js";
import { now } from "../lib/errors.js";
const address = email.parse(process.env.ADMIN_EMAIL),
  pass = password.parse(process.env.ADMIN_PASSWORD),
  name = text(30).parse(process.env.ADMIN_NAME || "茉莉运营");
const db = await openDatabase(loadConfig());
try {
  await migrate(db);
  if (await db.one("SELECT id FROM moli_users WHERE email=?", [address]))
    throw new Error(
      "Account already exists. Admin creation does not overwrite accounts.",
    );
  await db.run(
    "INSERT INTO moli_users (id,email,name,password_hash,role,state,email_verified,terms_version,created_at) VALUES (?,?,?,?,?,?,?,?,?)",
    [
      id(),
      address,
      name,
      await hashPassword(pass),
      "admin",
      "active",
      1,
      "2026-10",
      now(),
    ],
  );
  console.log(
    "Admin created. Remove ADMIN_PASSWORD from the environment after setup.",
  );
} finally {
  await db.close();
}
