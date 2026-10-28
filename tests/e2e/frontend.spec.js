import { test, expect } from "@playwright/test";

test("discovery errors offer a retry without losing the selected game", async ({
  page,
}) => {
  await page.route(
    "**/api/providers?*",
    (route) =>
      route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ message: "Temporarily unavailable" }),
      }),
    { times: 1 },
  );
  await page.goto("/players?game=" + encodeURIComponent("无畏契约"));
  await expect(
    page.getByRole("heading", { name: "暂时无法加载陪玩" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "重新加载", exact: true }).click();
  await expect(page.locator(".provider-card")).toHaveCount(1);
  await expect(
    page.getByRole("button", { name: "无畏契约", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
});

test("discovery filters survive refresh and detail navigation and can be cleared", async ({
  page,
}) => {
  await page.goto("/players");
  await page.getByLabel("搜索陪玩", { exact: true }).fill("阿序");
  await expect(page).toHaveURL(/keyword=/);
  await page.getByLabel("最高每小时预算").selectOption("100");
  await expect(page).toHaveURL(/maxPrice=100/);
  await page.getByLabel("只看可预约").check();
  await expect(page.locator(".provider-card")).toHaveCount(1);
  await expect(
    page.getByRole("button", { name: "移除筛选：阿序" }),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("搜索陪玩", { exact: true })).toHaveValue(
    "阿序",
  );
  await expect(page.getByLabel("最高每小时预算")).toHaveValue("100");
  await expect(page.getByLabel("只看可预约")).toBeChecked();
  await page.getByRole("link", { name: "查看阿序的主页" }).click();
  await expect(page.locator(".main-nav a.active")).toHaveText("发现陪玩");
  await page.goBack();
  await expect(page.getByLabel("搜索陪玩", { exact: true })).toHaveValue(
    "阿序",
  );
  await expect(page.locator(".provider-card")).toHaveCount(1);
  await page.getByRole("button", { name: "清除全部", exact: true }).click();
  await expect(page).toHaveURL(/\/players$/);
  await expect(page.locator(".provider-card")).toHaveCount(6);
  await expect(page.getByLabel("已选筛选条件")).toHaveCount(0);
});

test("scene navigation retains its parent and mobile menus close predictably", async ({
  page,
}) => {
  await page.goto("/experiences/fitness");
  await expect(page.locator(".main-nav a[aria-current=page]")).toHaveText(
    "场景探索",
  );
  const scenes = page.getByRole("navigation", { name: "服务场景导航" });
  await expect(scenes.locator("a[aria-current=page]")).toHaveText("健身陪练");
  await scenes.getByRole("link", { name: "KTV欢唱", exact: true }).click();
  await expect(page).toHaveURL(/\/experiences\/ktv$/);
  await expect(scenes.locator("a[aria-current=page]")).toHaveText("KTV欢唱");
  await page.setViewportSize({ width: 390, height: 844 });
  const trigger = page.getByRole("button", { name: "展开导航" });
  await trigger.click();
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  await trigger.press("Escape");
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await expect(trigger).toBeFocused();
  await trigger.click();
  await page.mouse.click(380, 740);
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await trigger.click();
  await page
    .getByRole("navigation", { name: "主导航", exact: true })
    .getByRole("link", { name: "发现陪玩", exact: true })
    .click();
  await expect(page).toHaveURL(/\/$/);
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
});

test("public pages fit mobile, tablet and desktop without horizontal overflow", async ({
  page,
}, testInfo) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 960 });
    for (const path of ["/", "/experiences", "/players"]) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await expect(
        page.locator(".home-scene, .experience-card, .provider-card").first(),
      ).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        `${path} at ${width}px`,
      ).toBe(true);
      if ((width === 1440 || width === 390) && path === "/") {
        await page.screenshot({
          path: testInfo.outputPath(`home-${width}.png`),
          fullPage: true,
          animations: "disabled",
        });
      }
      if (width === 390 && path === "/players") {
        await page.screenshot({
          path: testInfo.outputPath("discovery-mobile.png"),
          fullPage: true,
          animations: "disabled",
        });
      }
    }
  }
  expect(errors).toEqual([]);
});

test("personal navigation separates role workspaces from public navigation", async ({
  page,
}) => {
  await page.goto("/login");
  await page.getByLabel("邮箱", { exact: true }).fill("support@demo.moli.test");
  await page.getByLabel("密码", { exact: true }).fill("TestPassword48291");
  await page.getByRole("button", { name: "登录，开始新的一局" }).click();
  await expect(page).toHaveURL(/\/account$/);
  const personal = page.getByRole("navigation", { name: "个人空间导航" });
  await expect(personal.locator("a[aria-current=page]")).toHaveText("个人中心");
  await expect(
    personal.getByRole("link", { name: "管理后台", exact: true }),
  ).toHaveCount(0);
  await expect(
    personal.getByRole("link", { name: "客服工作台", exact: true }),
  ).toHaveCount(0);
  await page.locator(".account-menu summary").click();
  await page
    .getByRole("navigation", { name: "员工导航" })
    .getByRole("link", { name: "客服工作台", exact: true })
    .click();
  await expect(page).toHaveURL(/\/support$/);
  await expect(personal.locator("a[aria-current=page]")).toHaveText(
    "客服工作台",
  );
  const account = page.locator(".account-menu");
  await account.locator("summary").press("Enter");
  await expect(
    page.getByRole("navigation", { name: "账号导航" }),
  ).toBeVisible();
  await account.locator("summary").press("Escape");
  await expect(account).not.toHaveAttribute("open", "");
  await expect(account.locator("summary")).toBeFocused();
  await page.setViewportSize({ width: 320, height: 844 });
  await account.locator("summary").click();
  await page.getByRole("button", { name: "退出登录", exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("link", { name: "登录 / 注册" })).toBeVisible();
});
