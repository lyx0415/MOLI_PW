import { test, expect } from "@playwright/test";
const pass = "TestPassword48291";
async function login(page, email) {
  await page.goto("/login");
  await page.getByLabel("邮箱", { exact: true }).fill(email);
  await page.getByLabel("密码", { exact: true }).fill(pass);
  await page.getByRole("button", { name: "登录，开始新的一局" }).click();
  await expect(page).toHaveURL(/\/account/);
}

test("customer, provider, support and admin collaborate on tickets without lost replies or excess privileges", async ({
  page,
  browser,
}) => {
  const contexts = await Promise.all([
    browser.newContext(),
    browser.newContext(),
    browser.newContext(),
  ]);
  const [support, admin, provider] = await Promise.all(
    contexts.map((c) => c.newPage()),
  );
  try {
    await login(page, "customer@demo.moli.test");
    await login(support, "support@demo.moli.test");
    await login(admin, "admin@demo.moli.test");
    await login(provider, "provider2@demo.moli.test");
    await page.goto("/help");
    await page.getByLabel("问题主题", { exact: true }).fill("多人客服回归");
    await page
      .getByLabel("具体情况", { exact: true })
      .fill("需要核对本次服务，请协助处理。");
    await page.getByRole("button", { name: "提交工单", exact: true }).click();
    const customerTicket = page
      .locator("article.ticket")
      .filter({ hasText: "多人客服回归" });
    await expect(customerTicket).toBeVisible();
    await provider.goto("/help");
    await provider.getByLabel("问题主题", { exact: true }).fill("陪玩咨询回归");
    await provider
      .getByLabel("具体情况", { exact: true })
      .fill("陪玩需要确认结算资料提交方式。");
    await provider
      .getByRole("button", { name: "提交工单", exact: true })
      .click();
    await expect(
      provider.locator("article.ticket").filter({ hasText: "陪玩咨询回归" }),
    ).toBeVisible();
    await expect(
      provider.locator("article.ticket").filter({ hasText: "多人客服回归" }),
    ).toHaveCount(0);

    await support.goto("/admin");
    await expect(support).toHaveURL(/\/account/);
    await support.setViewportSize({ width: 390, height: 844 });
    await support.getByRole("button", { name: "展开导航" }).click();
    await support
      .getByRole("navigation", { name: "主导航" })
      .getByRole("link", { name: "客服工作台", exact: true })
      .click();
    await expect(support).toHaveURL(/\/support/);
    const supportTicket = support
      .locator("article.ticket")
      .filter({ hasText: "多人客服回归" });
    await supportTicket.getByRole("button", { name: "处理工单" }).click();
    await supportTicket
      .getByLabel("客服回复", { exact: true })
      .fill("已登记并核对，请确认处理结果。");
    await supportTicket.getByLabel("处理状态").selectOption("resolved");
    await supportTicket.getByRole("button", { name: "保存回复" }).click();
    await expect(supportTicket).toHaveCount(0);

    await page.getByRole("button", { name: "刷新工单" }).click();
    await expect(customerTicket).toContainText("已登记并核对");
    await customerTicket
      .getByRole("button", { name: "查看记录 / 追问" })
      .click();
    await customerTicket
      .getByLabel("补充情况")
      .fill("仍然有问题，请继续核对服务时间。");
    await customerTicket.getByRole("button", { name: "发送追问" }).click();
    await expect(customerTicket.locator(".status-pill")).toHaveText("处理中");

    await support.getByRole("button", { name: "刷新工单" }).click();
    await supportTicket.getByRole("button", { name: "处理工单" }).click();
    await admin.goto("/support");
    const adminTicket = admin
      .locator("article.ticket")
      .filter({ hasText: "多人客服回归" });
    await adminTicket.getByRole("button", { name: "处理工单" }).click();
    await adminTicket
      .getByLabel("客服回复", { exact: true })
      .fill("管理员补充：继续协助跟进。");
    await supportTicket
      .getByLabel("客服回复", { exact: true })
      .fill("客服补充：已经查到服务记录。");
    await supportTicket.getByRole("button", { name: "保存回复" }).click();
    await expect(supportTicket).toContainText("客服补充：已经查到服务记录。");
    await adminTicket.getByRole("button", { name: "保存回复" }).click();
    await expect(admin.locator(".toast")).toContainText("工单已有新消息");
    await expect(
      adminTicket.getByLabel("客服回复", { exact: true }),
    ).toHaveValue("管理员补充：继续协助跟进。");
    await expect(adminTicket).toContainText("客服补充：已经查到服务记录。");
    await adminTicket.getByRole("button", { name: "保存回复" }).click();
    await expect(adminTicket.locator(".ticket-reply")).toHaveCount(4);
    expect(
      await support.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  } finally {
    await Promise.all(contexts.map((c) => c.close()));
  }
});

test("admin can revoke support access and stale tab responses cannot replace the active table", async ({
  page,
  browser,
}) => {
  const context = await browser.newContext(),
    support = await context.newPage();
  try {
    await login(page, "admin@demo.moli.test");
    await login(support, "support@demo.moli.test");
    await support.goto("/support");
    await page.goto("/admin");
    let release;
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    let seen;
    const requested = new Promise((resolve) => {
      seen = resolve;
    });
    await page.route("**/api/admin/users?*", async (route) => {
      const response = await route.fetch();
      seen();
      await gate;
      await route.fulfill({ response });
    });
    await page.getByRole("button", { name: "账号管理", exact: true }).click();
    await requested;
    await page.getByRole("button", { name: "陪玩管理", exact: true }).click();
    await expect(page.locator("tbody tr")).toHaveCount(6);
    const staleResponse = page.waitForResponse((response) =>
      response.url().includes("/api/admin/users?"),
    );
    release();
    await staleResponse;
    await expect(page.locator("tbody tr")).toHaveCount(6);
    await expect(page.locator("table")).not.toContainText(
      "support@demo.moli.test",
    );
    await page.unroute("**/api/admin/users?*");
    await page.getByRole("button", { name: "账号管理", exact: true }).click();
    const row = page
      .locator("tbody tr")
      .filter({ hasText: "support@demo.moli.test" });
    await row.getByRole("button", { name: "撤销客服权限" }).click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "确认处理" })
      .click();
    await expect(row).toContainText("客户");
    await support.getByRole("button", { name: "刷新工单" }).click();
    await expect(support).toHaveURL(/\/login/);
    await row.getByRole("button", { name: "设为客服" }).click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "确认处理" })
      .click();
    await expect(row).toContainText("撤销客服权限");
  } finally {
    await context.close();
  }
});
test("homepage, discovery search, real empty ratings and responsive navigation", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1440, height: 1080 });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /今晚的快乐，\s*有人陪你开局。/ }),
  ).toBeVisible();
  await expect(page.locator(".provider-card")).toHaveCount(6);
  await expect(page.locator(".provider-card .rating")).toHaveCount(0);
  await page.goto("/players");
  await page.getByRole("button", { name: "无畏契约", exact: true }).click();
  await expect(page.locator(".provider-card")).toHaveCount(1);
  await expect(page.locator(".provider-card")).toContainText("阿序");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "展开导航" }).click();
  await page
    .getByRole("link", { name: "帮助中心", exact: true })
    .first()
    .click();
  await expect(page).toHaveURL(/\/help/);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});
test("customer booking, payment notification, provider acceptance, communication and admin refund", async ({
  page,
  browser,
}) => {
  await login(page, "customer@demo.moli.test");
  await page.goto("/players");
  await page
    .locator(".provider-card")
    .filter({ hasText: "晚风" })
    .getByRole("link", { name: "预约晚风", exact: true })
    .click();
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  await page.getByLabel("日期", { exact: true }).fill(tomorrow);
  await page
    .getByRole("combobox", { name: "开始时间", exact: true })
    .selectOption("18:00");
  await page.getByLabel("游戏ID / 联系方式").fill("customer#1234");
  await page.getByRole("button", { name: "确认预约", exact: true }).click();
  await expect(page).toHaveURL(/\/orders\/[a-f0-9-]+/);
  const orderPath = new URL(page.url()).pathname;
  const data = await page.evaluate(async (path) => {
    const me = await (await fetch("/api/auth/me")).json();
    const created = await fetch(
      "/api/payments/" + path.split("/").pop() + "/create",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": me.data.csrf,
        },
        body: JSON.stringify({ channel: "alipay" }),
      },
    );
    if (!created.ok) throw new Error("payment creation failed");
    return (await (await fetch("/api" + path)).json()).data;
  }, orderPath);
  const notify = await page.request.post("/api/payments/notify/alipay", {
    form: {
      signature: "E2E_ONLY_SIGNATURE",
      order_no: data.order_no,
      amount_cents: String(data.amount_cents),
    },
  });
  expect(notify.ok()).toBe(true);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "待接单", exact: true }),
  ).toBeVisible();
  const providerContext = await browser.newContext(),
    provider = await providerContext.newPage();
  await login(provider, "provider1@demo.moli.test");
  await provider.goto(orderPath);
  await provider.getByRole("button", { name: "确认接单", exact: true }).click();
  await provider
    .getByRole("dialog")
    .getByRole("button", { name: "确认", exact: true })
    .click();
  await expect(
    provider.getByRole("heading", { name: "已接单", exact: true }),
  ).toBeVisible();
  await provider.getByLabel("订单消息").fill("收到，期待一起开黑。");
  await provider.getByRole("button", { name: "发送", exact: true }).click();
  await expect(provider.locator(".message-list")).toContainText("期待一起开黑");
  await page.reload();
  await expect(page.locator(".message-list")).toContainText("期待一起开黑");
  await page.getByRole("button", { name: "申请退款", exact: true }).click();
  await page
    .getByLabel("退款原因", { exact: true })
    .fill("时间安排变动，申请取消这次预约。");
  await page.getByRole("button", { name: "提交申请", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "退款处理中", exact: true }),
  ).toBeVisible();
  const adminContext = await browser.newContext(),
    admin = await adminContext.newPage();
  await login(admin, "admin@demo.moli.test");
  await admin.goto("/admin");
  await admin.getByRole("button", { name: "订单与退款", exact: true }).click();
  await admin.getByRole("button", { name: "原路退款", exact: true }).click();
  await admin
    .getByRole("dialog")
    .getByRole("button", { name: "确认处理", exact: true })
    .click();
  await expect(admin.locator("table")).toContainText("已退款");
  await page.reload();
  await expect(page.locator(".details-list")).toContainText("已退款");
  await providerContext.close();
  await adminContext.close();
});
test("new customer can apply; admin verifies and approves; provider opens studio", async ({
  page,
  browser,
}) => {
  await page.goto("/login");
  await page.getByRole("button", { name: "注册账号", exact: true }).click();
  await page.getByLabel("昵称", { exact: true }).fill("新玩家");
  await page
    .getByLabel("邮箱", { exact: true })
    .fill("new-provider-" + Date.now() + "@e2e.moli.test");
  await page.getByLabel("密码", { exact: true }).fill(pass);
  await page.getByLabel("我已年满18周岁", { exact: true }).check();
  await page.getByLabel(/我已阅读并同意/).check();
  await page.getByRole("button", { name: "创建我的账号", exact: true }).click();
  await expect(page).toHaveURL(/\/account/);
  await page.goto("/apply");
  await page.getByLabel("陪玩昵称", { exact: true }).fill("新入驻");
  await page
    .getByLabel("审核联系方式", { exact: true })
    .fill("new@e2e.moli.test");
  await page.getByLabel("技能 / 段位", { exact: true }).fill("钻石");
  await page
    .getByLabel("技能与服务介绍", { exact: true })
    .fill("这是用于浏览器测试的技能介绍，耐心沟通并认真提供游戏服务。");
  await page.getByLabel(/我已年满18周岁，愿意/).check();
  await page.getByLabel(/我已阅读并同意/).check();
  await page.getByRole("button", { name: "提交入驻申请", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "申请已送达。" }),
  ).toBeVisible();
  const context = await browser.newContext(),
    admin = await context.newPage();
  await login(admin, "admin@demo.moli.test");
  await admin.goto("/admin");
  await admin.getByRole("button", { name: "入驻审核", exact: true }).click();
  await admin.getByRole("button", { name: "审核通过", exact: true }).click();
  await admin.getByLabel(/我已通过线下或可信渠道核对/).check();
  await admin
    .getByRole("dialog")
    .getByRole("button", { name: "确认处理", exact: true })
    .click();
  await expect(admin.locator("table")).toContainText("已通过");
  await page.getByRole("button", { name: "刷新审核结果", exact: true }).click();
  await expect(page).toHaveURL(/\/studio/);
  await page.getByRole("button", { name: "档期设置", exact: true }).click();
  await page.getByLabel("周一", { exact: true }).check();
  await page.getByRole("button", { name: "保存档期", exact: true }).click();
  await expect(page.locator(".toast")).toContainText("档期已更新");
  await context.close();
});
test("protected routes redirect, expired sessions return to login, mobile role navigation remains available", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/login/);
  await page.goto("/login");
  await page
    .getByLabel("邮箱", { exact: true })
    .fill("provider2@demo.moli.test");
  await page.getByLabel("密码", { exact: true }).fill(pass);
  await page.getByRole("button", { name: "登录，开始新的一局" }).click();
  await expect(page).toHaveURL(/\/account/);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "展开导航" }).click();
  await page
    .getByRole("navigation", { name: "主导航" })
    .getByRole("link", { name: "陪玩工作台", exact: true })
    .click();
  await expect(page).toHaveURL(/\/studio/);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.evaluate(async () => {
    const me = await (await fetch("/api/auth/me")).json();
    await fetch("/api/auth/logout", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": me.data.csrf,
      },
      body: "{}",
    });
  });
  await page.getByRole("button", { name: "刷新", exact: true }).click();
  await expect(page).toHaveURL(/\/login/);
  expect(errors).toEqual([]);
});
