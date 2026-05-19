import { expect, test } from "@playwright/test";

test("application shell supports the MVP page flow navigation skeleton", async ({
  page,
}) => {
  await page.goto("/");

  await expect(
    page.getByRole("button", { name: /按下 enter 或点击任意位置开始/i }),
  ).toBeVisible();

  await page
    .getByRole("button", { name: /按下 enter 或点击任意位置开始/i })
    .click();
  await expect(page.getByRole("button", { name: "开始新游戏" })).toBeVisible();

  await page.getByRole("button", { name: "开始新游戏" }).click();
  await expect(
    page.getByRole("heading", { name: "新游戏初始化", level: 1 }),
  ).toBeVisible();

  await page.getByRole("button", { name: "确认并进入主游戏" }).click();
  await expect(
    page.getByRole("heading", { name: "主游戏页", level: 1 }),
  ).toBeVisible();

  await page.getByRole("button", { name: "设置" }).click();
  await expect(
    page.getByRole("heading", { name: /设置 \/ Provider 配置/i, level: 1 }),
  ).toBeVisible();

  await page.getByRole("button", { name: "返回主游戏" }).click();
  await expect(
    page.getByRole("heading", { name: "主游戏页", level: 1 }),
  ).toBeVisible();

  await page.getByRole("button", { name: "存档导出" }).click();
  await expect(
    page.getByRole("heading", { name: "存档导出入口", level: 1 }),
  ).toBeVisible();
});
