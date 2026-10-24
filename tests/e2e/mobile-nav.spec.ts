import { expect, test, type Page } from "@playwright/test";

test.use({ hasTouch: true });

async function openGame(page: Page) {
  await page.addInitScript(() => localStorage.setItem("mg-pixi-enabled", "false"));
  await page.goto("/");
  await page.getByRole("button", { name: "点击开始" }).click();
  await page.getByRole("button", { name: "开始新游戏" }).click();
  await page.getByLabel("角色姓名").fill("浮动导航验收");
  await page.getByRole("button", { name: /下一步/ }).click();
  await page.getByRole("button", { name: /下一步/ }).click();
  await page.getByRole("button", { name: /确认并开始游戏/ }).click();
  await expect(page.locator(".mg-game")).toBeVisible();
}

test("floating controls do not cover pending or post-combat actions", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 360, height: 844 });
  await openGame(page);

  for (const state of ["COMBAT_PENDING", "POST_COMBAT_READY"] as const) {
    await page.evaluate(async (sessionState) => {
      const sessionPath = "/src/stores/sessionStore.ts";
      const battlePath = "/src/stores/battleStore.ts";
      const piniaPath = "/src/stores/index.ts";
      const { useSessionStore } = await import(/* @vite-ignore */ sessionPath);
      const { useBattleStore } = await import(/* @vite-ignore */ battlePath);
      const { pinia } = await import(/* @vite-ignore */ piniaPath);
      const session = useSessionStore(pinia);
      if (sessionState === "COMBAT_PENDING") {
        useBattleStore(pinia).stagePendingEncounter({
          encounterId: "mobile-nav-pending",
          narrativeReason: "Mobile navigation layout fixture",
          source: "story",
          enemies: [{ enemy_id: "1", count: 1 }],
        });
        session.enterCombatPending();
      } else {
        await session.restoreFromCheckpointSnapshot({
          id: "mobile-nav-post-combat",
          kind: "save_checkpoint",
          snapshotVersion: 1,
          createdAt: new Date().toISOString(),
          reason: "Mobile navigation layout fixture",
          sessionSnapshot: { sessionState, pipelineState: null, activeRequestId: null },
          variableValue: await session.getVariableSnapshot(),
          chatMessages: [],
        });
      }
    }, state);

    const action = page.getByRole("button", { name: state === "COMBAT_PENDING" ? "进入战斗" : "继续剧情", exact: true });
    await expect(action).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath(`${state}.png`), animations: "disabled" });
    const actionBounds = (await action.boundingBox())!;
    for (const button of await page.getByRole("navigation", { name: "移动端面板" }).getByRole("button").all()) {
      const bounds = (await button.boundingBox())!;
      expect(bounds.y + bounds.height).toBeLessThanOrEqual(actionBounds.y);
    }
    // Check pointer access without starting combat or making a provider request.
    await action.click({ trial: true });
  }
});

for (const width of [360, 390]) {
  test(`${width}px floating panel controls retain input, drawers and Formation`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 844 });
    await openGame(page);
    const nav = page.getByRole("navigation", { name: "移动端面板" });
    const scene = nav.getByRole("button", { name: "场景", exact: true });
    const character = nav.getByRole("button", { name: "角色", exact: true });
    await expect(nav.getByRole("button")).toHaveCount(2);

    for (const [theme, radius] of [["e-girl", "8px"], ["kidcore", "12px"], ["pastel-brutalism", "0px"]]) {
      await page.evaluate((id) => { document.documentElement.dataset.theme = id; }, theme);
      const layout = await nav.evaluate((element) => {
        const top = document.querySelector("#game-top-bar")!.getBoundingClientRect();
        const center = document.querySelector(".mg-game__center")!.getBoundingClientRect();
        const input = document.querySelector("#game-input-dock")!.getBoundingClientRect();
        return {
          reservedHeight: element.getBoundingClientRect().height,
          centerGap: center.top - top.bottom,
          buttons: Array.from(element.querySelectorAll("button")).map((button) => {
            const r = button.getBoundingClientRect();
            return { width: r.width, height: r.height, aboveInput: r.bottom <= input.top - 8,
              borderRadius: getComputedStyle(button).borderRadius,
              onScreen: r.left >= 0 && r.right <= innerWidth && r.top > top.bottom };
          }),
        };
      });
      expect(layout.reservedHeight).toBe(0);
      expect(layout.centerGap).toBe(0);
      for (const button of layout.buttons) {
        expect(button.width).toBeGreaterThanOrEqual(44);
        expect(button.height).toBeGreaterThanOrEqual(44);
        expect(button.borderRadius).toBe(radius);
        expect(button.aboveInput && button.onScreen).toBe(true);
      }
      await page.locator("#story-input-box").fill("输入区仍可编辑");
      await expect(page.locator("#story-input-box")).toHaveValue("输入区仍可编辑");
      await expect(page.getByRole("button", { name: "发送", exact: true })).toBeEnabled();
      await page.screenshot({ path: testInfo.outputPath(`${theme}-${width}.png`), fullPage: true, animations: "disabled" });
    }

    await scene.focus();
    await page.keyboard.press("Tab");
    await expect(character).toBeFocused();
    expect(await character.evaluate((el) => getComputedStyle(el).outlineStyle)).toBe("solid");
    await page.getByRole("button", { name: "打开菜单" }).click();
    await expect(page.getByRole("navigation", { name: "移动端游戏菜单" })).toBeVisible();
    await page.getByRole("button", { name: "关闭菜单" }).click();

    await scene.tap();
    await expect(scene).toHaveAttribute("aria-expanded", "true");
    await page.getByRole("button", { name: "队伍编组", exact: true }).click();
    await expect(page.locator(".formation-modal")).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath(`formation-${width}.png`), fullPage: true, animations: "disabled" });
    await page.locator(".formation-modal .mg-modal__close").click();
    await character.tap();
    await expect(character).toHaveAttribute("aria-expanded", "true");
    await expect(scene).toHaveAttribute("aria-expanded", "false");
    await page.screenshot({ path: testInfo.outputPath(`character-${width}.png`), fullPage: true, animations: "disabled" });
    await page.locator("#game-character-panel .mg-panel-toggle").tap();
    await expect(character).toHaveAttribute("aria-expanded", "false");
    await scene.tap();
    await page.locator("#game-scene-panel .mg-panel-toggle").tap();
    await expect(scene).toHaveAttribute("aria-expanded", "false");
    await page.locator("#story-input-box").fill("切换面板后仍可编辑");
    await page.locator(".mg-game__messages").evaluate((el) => { el.scrollTop = el.scrollHeight; });
    await page.screenshot({ path: testInfo.outputPath(`story-end-${width}.png`), fullPage: true, animations: "disabled" });

    for (const desktopWidth of [768, 1280]) {
      await page.setViewportSize({ width: desktopWidth, height: 900 });
      await expect(nav).toHaveCount(0);
      if (width === 390) {
        await page.screenshot({ path: testInfo.outputPath(`non-mobile-${desktopWidth}.png`), fullPage: true, animations: "disabled" });
      }
    }
  });
}
