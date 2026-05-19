import { expect, test } from "@playwright/test";

test("app shell renders the premium prototype landing page", async ({
  page,
}) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: "MagicalGirl Shell", level: 1 }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /启动新月协议/i }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: /系统通知中心/i }),
  ).toBeVisible();
});
