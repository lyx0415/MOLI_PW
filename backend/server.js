import { loadConfig } from "./lib/config.js";
import { openDatabase, migrate } from "./lib/db.js";
import { createApp } from "./app.js";
import { maintain } from "./scripts/maintenance.js";
const config = loadConfig();
const db = await openDatabase(config);
await migrate(db);
await maintain(db);
let maintaining = false;
const maintenanceTimer = setInterval(async () => {
  if (maintaining) return;
  maintaining = true;
  try {
    await maintain(db);
  } catch (error) {
    console.error("Maintenance failed: " + error.message);
  } finally {
    maintaining = false;
  }
}, 60000);
maintenanceTimer.unref();
const server = createApp({ db, config }).listen(config.port, () =>
  console.log("Moli API listening on port " + config.port),
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.once(signal, () => {
    clearInterval(maintenanceTimer);
    server.close(async () => {
      await db.close();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10000).unref();
  });
