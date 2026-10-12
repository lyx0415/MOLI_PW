import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 45000,
  use: {
    baseURL: "http://127.0.0.1:4173",
    browserName: "chromium",
    channel:
      process.env.PLAYWRIGHT_CHANNEL === "chromium" ? undefined : "msedge",
    headless: true,
    trace: "retain-on-failure",
  },
  reporter: "list",
  webServer: {
    command: "node backend/test/e2e-server.js",
    url: "http://127.0.0.1:4173/api/health",
    reuseExistingServer: !process.env.CI,
    env: { NODE_ENV: "test" },
    timeout: 30000,
  },
});
