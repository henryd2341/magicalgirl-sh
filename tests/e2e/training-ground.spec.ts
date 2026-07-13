import { expect, test } from "@playwright/test";

test("training ground opens from the game shell and preserves local configuration", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "点击开始" }).click();
  await page.getByRole("button", { name: "开始新游戏" }).click();

  await page.getByLabel("角色姓名").fill("训练测试员");
  await page.getByRole("button", { name: /下一步/ }).click();
  await page.getByRole("button", { name: /下一步/ }).click();
  await page.getByRole("button", { name: /确认并开始游戏/ }).click();

  const entry = page.getByRole("button", { name: "训练场" }).first();
  await expect(entry).toBeVisible();
  await entry.click();

  const dialog = page.getByRole("dialog", { name: "训练场" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("status")).toHaveText("训练场内容尚未开放");
  await expect(dialog).toContainText("沙盒规则");
  await expect(dialog).toContainText("当前先锋将作为训练队伍");

  await dialog.getByRole("tab", { name: "挑战模式" }).click();
  await expect(dialog.getByRole("heading", { name: "挑战阶梯" })).toBeVisible();

  await dialog.getByRole("tab", { name: "自由练习" }).click();
  const addEnemy = dialog.getByRole("button", { name: /^添加 / }).first();
  await expect(addEnemy).toBeVisible();
  await addEnemy.click();
  await expect(dialog.getByRole("heading", { name: /训练阵容/ })).toContainText("1/4");
  await expect(dialog.getByRole("button", { name: "开战确认" })).toBeDisabled();

  await dialog.getByRole("button", { name: "关闭训练场" }).click();
  await expect(dialog).toBeHidden();
  await entry.click();
  await expect(page.getByRole("dialog", { name: "训练场" })).toContainText("1/4");
});
