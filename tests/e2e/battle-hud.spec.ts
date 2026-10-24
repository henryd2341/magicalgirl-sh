import { expect, test, type Page } from "@playwright/test";

async function openHud(page: Page, theme = "e-girl", effects = 5) {
  await page.goto(`/tests/e2e/fixtures/battle-hud.html?theme=${theme}&effects=${effects}`);
  await expect(page.getByRole("heading", { name: "战斗进行中", exact: true })).toBeVisible();
}

async function state(page: Page) {
  return page.evaluate(() => JSON.stringify((window as any).hudBattle.activeBattle));
}

const viewports = [
  { width: 1440, height: 900 },
  { width: 1280, height: 720 },
  { width: 360, height: 640 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
  { width: 768, height: 1024 },
  { width: 844, height: 390 },
];

for (const viewport of viewports) {
  test(`${viewport.width}x${viewport.height}: stable command and party geometry`, async ({ page }, info) => {
    await page.setViewportSize(viewport);
    await openHud(page);
    await expect(page.locator("button button")).toHaveCount(0);
    const party = page.locator(".battle-hud__party-row");
    const initial = await party.boundingBox();
    const command = await page.getByLabel("行动指令区域").boundingBox();
    expect(command!.x + command!.width).toBeLessThan(initial!.x);
    for (const count of [0, 1, 3, 8]) {
      await page.evaluate(count => {
        const store = (window as any).hudBattle;
        store.activeBattle.participants[0].availableSkillIds = new Set(
          ["36", "37", "38", "39", "40", "41", "42", "43"].slice(0, count),
        );
        store.rebuildActionMenuForActor("ally-0");
      }, count);
      const skill = page.getByRole("button", { name: "Skill", exact: true });
      if (count) {
        await skill.click();
        await expect(page.locator(".battle-command-menu__items > li")).toHaveCount(count);
      } else await expect(skill).toBeDisabled();
      expect((await party.boundingBox())!.height).toBe(initial!.height);
      if (count) await page.getByRole("button", { name: "返回根菜单" }).click();
    }
    if (viewport.width <= 1024) {
      const front = page.locator(".battle-hud__party-row .battle-party-slot--front");
      await expect(front).toHaveAttribute("data-participant-id", "ally-0");
      await expect(page.locator(".battle-party-slot--next")).toHaveAttribute("data-participant-id", "ally-1");
      const trigger = page.getByRole("button", { name: "查看队伍", exact: true });
      await trigger.scrollIntoViewIfNeeded();
      await expect(trigger).toBeInViewport();
      if (viewport.height >= 640) expect((await trigger.boundingBox())!.y + 44).toBeLessThanOrEqual(viewport.height);
      const before = await state(page);
      await trigger.click();
      const modal = page.getByRole("dialog", { name: "玩家队伍", exact: true });
      await expect(modal).toBeVisible();
      expect(
        await page.locator(".battle-broadcast-icon").evaluate((icon: HTMLElement) => {
          icon.focus();
          const rect = icon.getBoundingClientRect();
          return {
            focused: document.activeElement === icon,
            receivesPointer: document.elementFromPoint(rect.x + 10, rect.y + 10) === icon,
          };
        }),
      ).toEqual({ focused: false, receivesPointer: false });
      await expect(modal.locator(".battle-party-card")).toHaveCount(4);
      const boxes = await modal.locator(".battle-party-slot").evaluateAll(cards =>
        cards.map(c => {
          const r = c.getBoundingClientRect();
          return { x: r.x, y: r.y, height: r.height };
        }),
      );
      expect(boxes[0].y).toBe(boxes[1].y);
      expect(boxes[2].y).toBe(boxes[3].y);
      expect(boxes[2].y).toBeGreaterThan(boxes[0].y);
      expect(boxes[0].height).toBeGreaterThanOrEqual(230);
      await page.screenshot({ path: info.outputPath("roster.png") });
      await page.keyboard.press("Escape");
      await expect(modal).not.toBeVisible();
      await expect(trigger).toBeFocused();
      expect(await state(page)).toBe(before);
    } else {
      const card = await party.locator(".battle-party-card").first().boundingBox();
      expect(card!.width).toBe(220);
      expect(Math.abs(card!.height - (viewport.width === 1440 ? 313.59375 : 259.90625))).toBeLessThan(0.1);
    }
    await page.screenshot({ path: info.outputPath("hud.png") });
  });
}

// e146ac1 root-menu measurements; the two 3px-border themes add 2px to card height.
const originalDesktop = [
  { width: 1440, height: 900, cardHeight: 313.59375 },
  { width: 1280, height: 720, cardHeight: 259.90625 },
  { width: 1920, height: 1080, cardHeight: 334.71875 },
];

for (const theme of ["e-girl", "pastel-brutalism", "kidcore"]) {
  test(`${theme}: original desktop dimensions survive short skill menus`, async ({ page }, info) => {
    for (const viewport of originalDesktop) {
      await page.setViewportSize(viewport);
      await openHud(page, theme, 9);
      const cards = page.locator(".battle-hud__party-row .battle-party-card");
      const expectedHeight = viewport.cardHeight + (theme === "e-girl" ? 0 : 2);
      for (const count of [8, 0, 1, 3]) {
        await page.evaluate(count => {
          const store = (window as any).hudBattle;
          store.activeBattle.participants[0].availableSkillIds = new Set(["36", "37", "38", "39", "40", "41", "42", "43"].slice(0, count));
          store.rebuildActionMenuForActor("ally-0");
        }, count);
        for (const card of await cards.all()) {
          const rect = (await card.boundingBox())!;
          expect(rect.width).toBe(220);
          expect(Math.abs(rect.height - expectedHeight)).toBeLessThan(0.1);
        }
        if (count) {
          await page.getByRole("button", { name: "Skill", exact: true }).click();
          await expect(page.locator(".battle-command-menu__items > li")).toHaveCount(count);
          const rect = (await cards.first().boundingBox())!;
          expect(Math.abs(rect.height - expectedHeight)).toBeLessThan(0.1);
          await page.getByRole("button", { name: "返回根菜单" }).click();
        } else await expect(page.getByRole("button", { name: "Skill", exact: true })).toBeDisabled();
      }
      expect(await cards.first().locator("img").evaluate(el => getComputedStyle(el).objectPosition)).toBe("50% 50%");
      await page.screenshot({ path: info.outputPath(`desktop-${viewport.width}.png`) });
    }
  });
}

for (const theme of ["e-girl", "pastel-brutalism", "kidcore"]) {
  test(`${theme}: icon order, vital baselines and names`, async ({ page }, info) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openHud(page, theme, 9);
    const card = page.locator('.battle-hud__party-row [data-participant-id="ally-0"]');
    const baseline = await card.locator(".battle-party-card__body").boundingBox();
    for (const count of [0, 1, 4, 5, 8, 9, 40]) {
      await page.evaluate(count => {
        const battle = (window as any).hudBattle.activeBattle;
        const effects = [...(window as any).hudEffects.keys()]
          .slice(0, count)
          .map(effectId => ({ effectId, remainingDuration: 3, stacks: 1 }));
        battle.participants[0].statusEffects = effects;
        battle.participants.find((p: any) => p.side === "enemy").statusEffects = effects;
      }, count);
      const icons = card.locator(".battle-status-effects__grid img");
      await expect(icons).toHaveCount(count);
      expect((await card.locator(".battle-party-card__body").boundingBox())!.y).toBe(baseline!.y);
      for (const portrait of [card, page.locator(".battle-enemy-slot")]) {
        if (count) {
          const frame = (await portrait.boundingBox())!;
          const effects = (await portrait.locator(".battle-status-effects").boundingBox())!;
          expect(Math.abs(effects.x + effects.width - (frame.x + frame.width - 7))).toBeLessThan(0.1);
          expect(effects.y - frame.y).toBe(7);
          expect(effects.x).toBeGreaterThan(frame.x);
        }
        const positions = await portrait.locator(".battle-status-effects__grid img").evaluateAll(images =>
          images.map(image => {
            const r = image.getBoundingClientRect();
            return { x: r.x, y: r.y };
          }),
        );
        for (let i = 0; i < count; i++) {
          expect(positions[i].y).toBe(positions[i % 4].y);
          if (i >= 4) expect(positions[i].x).toBeLessThan(positions[i - 4].x);
        }
      }
      if (count === 40) {
        const before = await state(page);
        await card.getByRole("button", { name: /查看.*的状态/ }).click();
        const dialog = page.getByRole("dialog", { name: "鹿目真昼的状态", exact: true });
        await expect(dialog.locator("li")).toHaveCount(40);
        await page.screenshot({ path: info.outputPath("status-names.png") });
        await dialog.locator("li").last().scrollIntoViewIfNeeded();
        await expect(dialog.locator("li").last()).toBeInViewport();
        await page.keyboard.press("Escape");
        expect(await state(page)).toBe(before);
        await page.keyboard.press("Tab");
        await page.screenshot({ path: info.outputPath("all-effects.png") });
      }
    }
    await page.evaluate(() => {
      (window as any).hudBattle.activeBattle.participants[0].statusEffects = [
        { effectId: "未知状态名称很长也不能挤动生命魔力栏", stacks: 1, remainingDuration: 1 },
      ];
    });
    await expect(card.getByAltText("未知状态名称很长也不能挤动生命魔力栏")).toBeVisible();
    const inspect = card.getByRole("button", { name: /查看.*的状态/ });
    await inspect.focus();
    await expect(page.getByRole("tooltip")).toContainText("未知状态名称很长也不能挤动生命魔力栏");
    await page.keyboard.press("Tab");
    expect((await card.locator(".battle-party-card__body").boundingBox())!.y).toBe(baseline!.y);
    await page.evaluate(() => {
      (window as any).hudBattle.activeBattle.currentActorId = "ally-1";
    });
    expect((await card.locator(".battle-party-card__body").boundingBox())!.y).toBe(baseline!.y);
    await page.screenshot({ path: info.outputPath("unknown-status.png") });
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.locator(".battle-hud__party-row .battle-party-slot--front")).toBeVisible();
    await page.screenshot({ path: info.outputPath("mobile-theme.png") });
  });
}

test("manual roster inspection, nested status dialog, targeting and live progression", async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openHud(page);
  const trigger = page.getByRole("button", { name: "查看队伍", exact: true });
  await page.getByRole("button", { name: "Item", exact: true }).click();
  await page.getByRole("button", { name: "回复", exact: true }).click();
  await page.getByRole("button", { name: /药草/ }).click();
  await expect(page.getByRole("dialog", { name: "玩家队伍", exact: true })).toHaveCount(0);
  await page.evaluate(() => {
    (window as any).hudBattle.activeBattle.battleLog = Array.from({ length: 1000 }, (_, index) => ({
      id: `log-${index}`, sequence: index + 1, turnCount: 1,
      side: "system", kind: "system", visibility: "both", summary: "Earlier action",
    }));
  });
  const pending = await state(page);
  await trigger.click();
  const modal = page.getByRole("dialog", { name: "玩家队伍", exact: true });
  await expect(modal.getByRole("button", { name: "关闭玩家队伍" })).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  expect(await page.evaluate(() => document.activeElement?.closest("dialog")?.getAttribute("aria-label"))).toBe(
    "玩家队伍",
  );
  await modal.getByRole("button", { name: "查看鹿目真昼的状态" }).click();
  await expect(page.getByRole("dialog", { name: "鹿目真昼的状态", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(modal.getByRole("button", { name: "查看鹿目真昼的状态" })).toBeFocused();
  await modal.getByRole("button", { name: "关闭玩家队伍" }).click();
  expect(await state(page)).toBe(pending);
  await trigger.click();
  await modal.locator('[data-participant-id="ally-1"] .battle-party-card').click();
  await expect(modal).not.toBeVisible();
  expect(await page.evaluate(() => (window as any).hudBattle.activeBattle.participants[1].hp.current)).toBe(120);
  expect(await page.evaluate(() => (window as any).hudBattle.activeBattle.battleLog.length)).toBe(1000);
  expect(await page.evaluate(() => (window as any).hudBattle.activeBattle.pressTurn.icons.length)).toBe(3);
  await trigger.click();
  await expect(modal.locator(".battle-party-card:enabled")).toHaveCount(0);
  await page.evaluate(() => {
    const b = (window as any).hudBattle.activeBattle;
    const enemy = b.participants.find((p: any) => p.side === "enemy");
    b.phase = "ENEMY_TURN";
    b.currentActorId = enemy.id;
    b.pressTurn = { ownerSide: "enemy", icons: [{ id: "enemy", state: "solid" }] };
    b.pressTurnAllocation = { participantIds: [enemy.id], initialIconCount: 1 };
  });
  await expect.poll(() => page.evaluate(() => (window as any).hudBattle.activeBattle.phase)).toBe("PLAYER_COMMAND");
  await expect(modal).toBeVisible();
  const progressed = await state(page);
  await page.keyboard.press("Escape");
  expect(await state(page)).toBe(progressed);
  await page.screenshot({ path: info.outputPath("after-target-and-enemy.png") });
});

test("status inspection survives a live foreground change without trapping the battle", async ({ page }, info) => {
  await page.setViewportSize({ width: 360, height: 640 });
  await openHud(page);
  await page.locator(".battle-party-slot--front .battle-status-effects__inspect").click();
  const status = page.getByRole("dialog", { name: "鹿目真昼的状态", exact: true });
  await expect(status).toBeVisible();
  await page.evaluate(() => {
    const b = (window as any).hudBattle.activeBattle;
    b.participants[0].hp.current = 0;
    b.participants[0].isDown = true;
    const enemy = b.participants.find((p: any) => p.side === "enemy");
    b.phase = "ENEMY_TURN";
    b.currentActorId = enemy.id;
    b.pressTurn = { ownerSide: "enemy", icons: [{ id: "enemy", state: "solid" }] };
    b.pressTurnAllocation = { participantIds: [enemy.id], initialIconCount: 1 };
  });
  await expect(page.locator(".battle-party-slot--front")).toHaveAttribute("data-participant-id", "ally-1");
  await expect(status).toBeVisible();
  await expect(status.getByRole("button", { name: "关闭鹿目真昼的状态" })).toBeInViewport();
  await page.screenshot({ path: info.outputPath("status-after-foreground-change.png") });
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "查看队伍", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "玩家队伍", exact: true })).toBeVisible();
});

test("default LOG dock can be dragged into a saved floating position and restored", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openHud(page);
  const icon = page.getByRole("button", { name: "恢复战斗播报", exact: true });
  const before = await icon.boundingBox();
  expect(await icon.evaluate(element => element.closest(".battle-hud__log-dock") != null)).toBe(true);
  await page.mouse.move(before!.x + 26, before!.y + 26);
  await page.mouse.down();
  await page.mouse.move(34, 58, { steps: 4 });
  await page.mouse.up();
  const moved = await icon.boundingBox();
  expect(moved!.x).toBe(8);
  expect(moved!.y).toBe(32);
  expect(await icon.evaluate(element => element.parentElement === document.body)).toBe(true);
  await expect(page.getByRole("complementary", { name: "战斗播报" })).toHaveCount(0);
  await icon.click();
  await expect(page.getByRole("complementary", { name: "战斗播报" })).toBeVisible();
  await page.getByRole("button", { name: "最小化战斗播报" }).click();
  expect(await icon.boundingBox()).toEqual(moved);
});

for (const theme of ["e-girl", "pastel-brutalism", "kidcore"]) {
  test(`${theme}: four effect rows stay above vitals at normal and enlarged text`, async ({ page }, info) => {
    for (const width of [360, 390, 1280]) {
      await page.setViewportSize({ width, height: width === 360 ? 640 : width === 390 ? 844 : 720 });
      await openHud(page, theme, 9);
      await page.evaluate(() => {
        const b = (window as any).hudBattle.activeBattle;
        b.participants.find((p: any) => p.side === "enemy").statusEffects = b.participants[0].statusEffects;
      });
      for (const fontSize of [16, 24]) {
        await page.evaluate(size => { document.documentElement.style.fontSize = `${size}px`; }, fontSize);
        const enemyEffects = await page.locator(".battle-enemy-slot .battle-status-effects").boundingBox();
        const enemyName = await page.locator(".battle-enemy-card__name").boundingBox();
        expect(enemyEffects!.y + enemyEffects!.height).toBeLessThan(enemyName!.y);
        const front = page.locator(".battle-hud__party-row .battle-party-slot--front");
        const actor = await front.locator(".battle-party-card__actor").boundingBox();
        const effects = await front.locator(".battle-status-effects").boundingBox();
        const vitals = await front.locator(".battle-party-card__body").boundingBox();
        expect(actor!.x + actor!.width).toBeLessThan(effects!.x);
        expect(actor!.y + actor!.height).toBeLessThan(vitals!.y);
        const frame = (await front.boundingBox())!;
        expect(effects!.y - frame.y).toBe(7);
        expect(Math.abs(effects!.x + effects!.width - frame.x - frame.width + 7)).toBeLessThan(0.1);
        expect(effects!.y + effects!.height).toBeLessThan(vitals!.y);
        if (width <= 390) {
          const trigger = page.getByRole("button", { name: "查看队伍", exact: true });
          if (fontSize === 16) expect((await trigger.boundingBox())!.y + 44).toBeLessThanOrEqual(width === 360 ? 640 : 844);
          const triggerBox = await trigger.boundingBox();
          const logBox = await page.locator(".battle-broadcast-icon").boundingBox();
          expect(vitals!.y + vitals!.height).toBeLessThan(triggerBox!.y);
          expect(triggerBox!.y + triggerBox!.height).toBeLessThan(logBox!.y);
          if (fontSize === 16) expect(logBox!.y + logBox!.height).toBeLessThanOrEqual(width === 360 ? 640 : 844);
          await trigger.click();
          const modal = page.getByRole("dialog", { name: "玩家队伍", exact: true });
          const card = modal.locator('[data-participant-id="ally-0"]');
          const modalEffects = await card.locator(".battle-status-effects").boundingBox();
          const modalActor = await card.locator(".battle-party-card__actor").boundingBox();
          expect(modalActor!.x + modalActor!.width).toBeLessThan(modalEffects!.x);
          const modalVitals = await card.locator(".battle-party-card__body").boundingBox();
          expect(modalEffects!.y + modalEffects!.height).toBeLessThan(modalVitals!.y);
          await page.screenshot({ path: info.outputPath(`roster-${width}-${fontSize}px.png`) });
          await page.keyboard.press("Escape");
        }
        await page.screenshot({ path: info.outputPath(`hud-${width}-${fontSize}px.png`) });
      }
    }
  });
}

test("downed revival targets, extra reserves, swap and zero-effect roster remain accessible", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 360, height: 640 });
  await openHud(page, "e-girl", 0);
  await page.evaluate(() => {
    const store = (window as any).hudBattle;
    const b = store.activeBattle;
    b.participants[1].hp.current = 0;
    b.participants[1].isDown = true;
    b.participants.push({ ...b.participants[2], id: "reserve", displayName: "后备成员", isActive: false });
  });
  await page.getByRole("button", { name: "Item", exact: true }).click();
  await page.getByRole("button", { name: "复活", exact: true }).click();
  await page.getByRole("button", { name: /复活药/ }).click();
  const trigger = page.getByRole("button", { name: "查看队伍", exact: true });
  await trigger.click();
  const modal = page.getByRole("dialog", { name: "玩家队伍", exact: true });
  await expect(modal.locator(".battle-party-card")).toHaveCount(5);
  await modal.locator('[data-participant-id="reserve"]').scrollIntoViewIfNeeded();
  await expect(modal.locator('[data-participant-id="reserve"]')).toBeInViewport();
  await modal.locator('[data-participant-id="ally-1"] .battle-party-card').click();
  await expect(modal).not.toBeVisible();
  expect(await page.evaluate(() => (window as any).hudBattle.activeBattle.participants[1].isDown)).toBe(false);
  expect(await page.evaluate(() => (window as any).hudBattle.activeBattle.participants[1].hp.current)).toBe(30);
  await page.getByRole("button", { name: "Swap", exact: true }).click();
  await page.locator(".battle-swap-popup__card").filter({ hasText: "盐田堇子" }).click();
  await page.locator(".battle-swap-popup__card").filter({ hasText: "后备成员" }).click();
  await expect(page.locator(".battle-swap-overlay")).toHaveCount(0);
  expect(
    await page.evaluate(
      () => (window as any).hudBattle.activeBattle.participants.find((p: any) => p.id === "reserve").isActive,
    ),
  ).toBe(true);
  await page.screenshot({ path: info.outputPath("revival-reserve-swap.png") });
});

test("enlarged text keeps stack and full roster reachable through local scrollports", async ({ page }, info) => {
  await page.setViewportSize({ width: 360, height: 640 });
  await openHud(page);
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "24px";
  });
  const trigger = page.getByRole("button", { name: "查看队伍", exact: true });
  await trigger.scrollIntoViewIfNeeded();
  await expect(trigger).toBeInViewport();
  await trigger.click();
  const modal = page.getByRole("dialog", { name: "玩家队伍", exact: true });
  await modal.locator(".battle-party-card").last().scrollIntoViewIfNeeded();
  await expect(modal.locator(".battle-party-card").last()).toBeInViewport();
  await expect(modal.getByRole("button", { name: "关闭玩家队伍" })).toBeInViewport();
  await page.screenshot({ path: info.outputPath("enlarged-text.png") });
});

test.describe("touch interaction", () => {
  test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });
  test("stack and disabled enemy effects open without targeting", async ({ page }) => {
    await openHud(page);
    await page.getByRole("button", { name: "Item", exact: true }).tap();
    await page.getByRole("button", { name: "回复", exact: true }).tap();
    await page.getByRole("button", { name: /药草/ }).tap();
    const before = await state(page);
    const enemyStatus = page.locator(".battle-enemy-slot .battle-status-effects__inspect");
    await expect(page.locator(".battle-enemy-card")).toBeDisabled();
    await enemyStatus.tap();
    await expect(page.getByRole("dialog", { name: "牙牛的状态", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "关闭牙牛的状态" }).tap();
    await page.getByRole("button", { name: "查看队伍", exact: true }).tap();
    const modal = page.getByRole("dialog", { name: "玩家队伍", exact: true });
    await expect(modal).toBeVisible();
    await modal.getByRole("button", { name: "关闭玩家队伍" }).tap();
    expect(await state(page)).toBe(before);
  });
});
