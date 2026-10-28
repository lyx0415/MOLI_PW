import { test, expect } from "@playwright/test";

test("customers can collect a provider and remove the last saved item from their own favorites", async ({
  page,
}) => {
  await page.goto("/login");
  await page
    .getByLabel("邮箱", { exact: true })
    .fill("customer@demo.moli.test");
  await page.getByLabel("密码", { exact: true }).fill("TestPassword48291");
  await page.getByRole("button", { name: "登录，开始新的一局" }).click();
  await expect(page).toHaveURL(/\/account$/);
  await page.goto("/");
  await page.getByRole("button", { name: "收藏晚风", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "取消收藏晚风", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.locator(".market-saved").click();
  await expect(page).toHaveURL(/favorites=true/);
  await expect(page.locator(".provider-card")).toHaveCount(1);
  await page.getByRole("button", { name: "取消收藏晚风", exact: true }).click();
  await expect(page.locator(".provider-card")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "去发现陪玩", exact: true }),
  ).toBeVisible();
});

test("customers land directly on discovery and partner applications are a secondary public page", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "发现陪玩",
  );
  await expect(page.locator(".provider-card")).toHaveCount(6);
  const navigation = page.getByRole("navigation", {
    name: "主导航",
    exact: true,
  });
  await expect(navigation.locator("a").filter({ hasText: "首页" })).toHaveCount(
    0,
  );
  await expect(
    navigation.getByRole("link", { name: /申请|陪玩入驻|管理|工作台/ }),
  ).toHaveCount(0);
  await page.getByRole("link", { name: "了解陪玩申请", exact: true }).click();
  await expect(page).toHaveURL(/\/apply$/);
  await expect(
    page.getByRole("heading", { name: "准备好分享你的擅长了吗？" }),
  ).toBeVisible();
  await expect(page.getByLabel("陪玩昵称", { exact: true })).toHaveCount(0);
  await page.getByRole("link", { name: "登录后申请", exact: true }).click();
  await expect(page).toHaveURL(/\/login\?redirect=\/apply$/);
  await expect(page.locator(".auth-story")).not.toContainText("管理者");
});

test("root search prices the matching service and the explicit return link keeps customer filters", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("搜索陪玩", { exact: true }).fill("线下电竞");
  await page.getByRole("button", { name: "找陪玩", exact: true }).click();
  await expect(page.locator(".provider-card")).toHaveCount(1);
  await expect(page.locator(".card-bottom strong")).toHaveText("¥120.00");
  await page.getByRole("link", { name: "查看晚风的主页" }).click();
  await expect(
    page.getByText("线下服务：", { exact: false }).first(),
  ).toBeVisible();
  await page.getByRole("link", { name: "返回发现陪玩", exact: true }).click();
  await expect(page.getByLabel("搜索陪玩", { exact: true })).toHaveValue(
    "线下电竞",
  );
  await expect(page.locator(".provider-card")).toHaveCount(1);
});

test("employee entry is absent from customer navigation and API authorization remains enforced", async ({
  page,
}) => {
  await page.goto("/login");
  await page
    .getByLabel("邮箱", { exact: true })
    .fill("customer@demo.moli.test");
  await page.getByLabel("密码", { exact: true }).fill("TestPassword48291");
  await page.getByRole("button", { name: "登录，开始新的一局" }).click();
  await expect(page).toHaveURL(/\/account$/);
  await expect(page.locator(".account-shortcuts")).toContainText("我的订单");
  await expect(page.locator(".account-shortcuts")).toContainText("我的收藏");
  await page.locator(".account-menu summary").click();
  await expect(page.getByRole("navigation", { name: "员工导航" })).toHaveCount(
    0,
  );
  expect((await page.request.get("/api/admin/overview")).status()).toBe(403);
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/account$/);
});
