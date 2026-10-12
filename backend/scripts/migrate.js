import { loadConfig } from "../lib/config.js";
import { openDatabase, migrate } from "../lib/db.js";
const db = await openDatabase(loadConfig());
try {
  await migrate(db);
  console.log(
    "Platform schema ready. Existing applications and players tables are unchanged.",
  );
} finally {
  await db.close();
}
