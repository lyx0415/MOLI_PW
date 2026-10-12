import { createApp } from "../app.js";
import { loadConfig } from "../lib/config.js";
import { openDatabase, migrate } from "../lib/db.js";
import { seedDemo } from "../scripts/seed-demo.js";
// This isolated in-memory harness is never started by the production entrypoint.
if (process.env.NODE_ENV !== "test")
  throw new Error("E2E harness requires NODE_ENV=test");
const config = {
  ...loadConfig({
    NODE_ENV: "test",
    PUBLIC_ORIGIN: "http://127.0.0.1:4173",
    DEMO_MODE: "true",
  }),
  sqlitePath: ":memory:",
};
const db = await openDatabase(config);
await migrate(db);
await seedDemo(db, "TestPassword48291");
const gateways = {
  alipay: {
    label: "支付宝（隔离测试）",
    create: async () => ({
      type: "redirect",
      url: "https://openapi.alipay.com/",
    }),
    verifyNotify: (data) => {
      if (data.signature !== "E2E_ONLY_SIGNATURE")
        throw new Error("Invalid test signature");
      return {
        channel: "alipay",
        orderNo: data.order_no,
        tradeNo: "E2E" + data.order_no,
        amountCents: Number(data.amount_cents),
      };
    },
    query: async () => null,
    refund: async () => ({ success: true }),
    queryRefund: async () => ({ success: true }),
  },
};
const server = createApp({ db, config, gateways }).listen(
  4173,
  "127.0.0.1",
  () => console.log("E2E only: http://127.0.0.1:4173"),
);
process.once("SIGINT", () =>
  server.close(async () => {
    await db.close();
    process.exit(0);
  }),
);
