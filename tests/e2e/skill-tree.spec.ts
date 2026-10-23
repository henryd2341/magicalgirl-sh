import { expect, test, type Page } from "@playwright/test";

async function openGame(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "点击开始" }).click();
  await page.getByRole("button", { name: "开始新游戏" }).click();
  await page.getByLabel("角色姓名").fill("技能树验收");
  await page.getByRole("button", { name: /下一步/ }).click();
  await page.getByRole("button", { name: /下一步/ }).click();
  await page.getByRole("button", { name: /确认并开始游戏/ }).click();
  await expect(page.locator(".mg-game")).toBeVisible();
}

async function openSkillTree(page: Page) {
  await openGame(page);
  // Isolated browser context: restore an old purchase without its new ancestors.
  await page.evaluate(async () => {
    const sessionPath = "/src/stores/sessionStore.ts";
    const piniaPath = "/src/stores/index.ts";
    const { useSessionStore } = await import(/* @vite-ignore */ sessionPath);
    const { pinia } = await import(/* @vite-ignore */ piniaPath);
    const store = useSessionStore(pinia);
    await store.patchVariables([
      { path: "player.money", value: 1000000 },
      { path: "player.combat.level", value: 12 },
      {
        path: "player.learnedSkills.player",
        value: ["102", "112", "115", "118", "121", "124", "125"],
      },
      { path: "player.equippedSkills", value: ["102"] },
    ]);
    await store.restoreFromCheckpointSnapshot({
      id: "skill-tree-legacy-fixture",
      kind: "save_checkpoint",
      snapshotVersion: 1,
      createdAt: new Date().toISOString(),
      reason: "skill-tree browser regression",
      sessionSnapshot: {
        sessionState: "IDLE",
        pipelineState: null,
        activeRequestId: null,
      },
      variableValue: await store.getVariableSnapshot(),
      chatMessages: [],
    });
  });

  const entry = page.getByRole("button", { name: "角色Build" });
  const scene = page.getByRole("button", { name: "场景", exact: true });
  if (await scene.isVisible()) {
    if (!(await scene.getAttribute("class"))?.includes("mg-game__mobile-nav-btn--active")) {
      await scene.click();
    }
  }
  await entry.click();
  await expect(page.getByRole("combobox", { name: "技能分支" })).toBeVisible();
}

test("sealed commands and reflected damage reach the live battle HUD", async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await openGame(page);
  await page.evaluate(async () => {
    const sessionPath = "/src/stores/sessionStore.ts";
    const battlePath = "/src/stores/battleStore.ts";
    const piniaPath = "/src/stores/index.ts";
    const { useSessionStore } = await import(/* @vite-ignore */ sessionPath);
    const { useBattleStore } = await import(/* @vite-ignore */ battlePath);
    const { pinia } = await import(/* @vite-ignore */ piniaPath);
    const session = useSessionStore(pinia);
    const battle = useBattleStore(pinia);
    battle.stagePendingEncounter({
      encounterId: "browser-status-contract",
      narrativeReason: "状态规则浏览器验收",
      source: "story",
      enemies: [{ enemy_id: "1", count: 1 }],
    });
    session.enterCombatPending();
    await session.startBattle([{
      id: "browser-player", characterId: "__player__", side: "player", displayName: "状态验收",
      hp: { current: 1000, max: 1000 }, mp: { current: 100, max: 100 },
      level: 10, attack: 10, defense: 10, agility: 10, intelligence: 10,
      isDown: false, isActive: true, canAct: true,
      availableSkillIds: new Set(["36"]),
      statusEffects: [{ effectId: "seal", remainingDuration: 1, stacks: 1, firstTickPhase: 1 }],
    }]);
    battle.activeBattle.participants.find((p: { id: string }) => p.id === "browser-player").availableSkillIds = new Set(["36"]);
    const enemy = battle.activeBattle.participants.find((p: { side: string }) => p.side === "enemy");
    enemy.hp = { current: 1000, max: 1000 };
    enemy.defense = 10;
    enemy.affinities = { weak: 0, resist: 0, nullify: 0, reflect: 0, absorb: 0 };
    enemy.statusEffects = [
      { effectId: "fire_reflect", remainingDuration: 1, stacks: 1, firstTickPhase: 1 },
      { effectId: "sleep", remainingDuration: 2, stacks: 1, firstTickPhase: 1 },
    ];
    battle.rebuildActionMenuForActor("browser-player");
  });
  await page.getByRole("button", { name: "Skill", exact: true }).click();
  const sealed = page.getByRole("button", { name: "火球术（封技）", exact: true });
  await expect(sealed).toBeDisabled();
  await expect(sealed).toHaveAttribute("title", "封技期间禁用消耗 MP 的技能。");
  await page.screenshot({ path: testInfo.outputPath("sealed-command.png"), fullPage: true });

  // A second fixture state isolates reflection from the already-checked seal gate.
  await page.evaluate(async () => {
    const battlePath = "/src/stores/battleStore.ts";
    const piniaPath = "/src/stores/index.ts";
    const { useBattleStore } = await import(/* @vite-ignore */ battlePath);
    const { pinia } = await import(/* @vite-ignore */ piniaPath);
    const battle = useBattleStore(pinia);
    battle.activeBattle.participants.find((p: { id: string }) => p.id === "browser-player").statusEffects = [];
    battle.rebuildActionMenuForActor("browser-player");
  });
  await page.getByRole("button", { name: "Skill", exact: true }).click();
  await page.getByRole("button", { name: "火球术", exact: true }).click();
  await page.locator(".battle-enemy-card").click();
  await expect.poll(() => page.evaluate(async () => {
    const path = "/src/stores/battleStore.ts";
    const piniaPath = "/src/stores/index.ts";
    const { useBattleStore } = await import(/* @vite-ignore */ path);
    const { pinia } = await import(/* @vite-ignore */ piniaPath);
    const battle = useBattleStore(pinia).activeBattle;
    const actor = battle.participants.find((p: { side: string }) => p.side === "player");
    const target = battle.participants.find((p: { side: string }) => p.side === "enemy");
    return {
      reflectedDamage: actor.hp.current < 1000,
      targetHp: target.hp.current,
      shieldPresent: target.statusEffects.some((effect: { effectId: string }) => effect.effectId === "fire_reflect"),
      phase: battle.phase,
      sleepDuration: target.statusEffects.find((effect: { effectId: string }) => effect.effectId === "sleep")?.remainingDuration,
    };
  })).toEqual({
    reflectedDamage: true, targetHp: 1000, shieldPresent: false,
    phase: "PLAYER_COMMAND", sleepDuration: 1,
  });
  await expect(page.locator(".battle-enemy-card__hp-nums")).toHaveText("HP 1000/1000");
  await page.screenshot({ path: testInfo.outputPath("reflected-action.png"), fullPage: true });
});

async function graphIntersections(page: Page) {
  return page.locator(".skilltree-tab").evaluate((tree) => {
    const cards = Array.from(tree.querySelectorAll<HTMLElement>("[data-skill-id]"))
      .map((card) => ({ id: card.dataset.skillId!, rect: card.getBoundingClientRect() }));
    const overlaps: string[] = [];
    for (let i = 0; i < cards.length; i++) {
      for (const other of cards.slice(i + 1)) {
        const { rect, id } = cards[i];
        if (Math.min(rect.right, other.rect.right) - Math.max(rect.left, other.rect.left) > 1
          && Math.min(rect.bottom, other.rect.bottom) - Math.max(rect.top, other.rect.top) > 1) {
          overlaps.push(`${id}/${other.id}`);
        }
      }
    }
    const crossings: string[] = [];
    const detached: string[] = [];
    const paths = tree.querySelectorAll<SVGPathElement>("[data-edge-from]");
    for (const path of paths) {
      const matrix = path.getScreenCTM();
      if (!matrix) continue;
      const length = path.getTotalLength();
      for (const [id, distance, edge] of [
        [path.dataset.edgeFrom, 0, "bottom"], [path.dataset.edgeTo, length, "top"],
      ] as const) {
        const block = tree.querySelector(`[data-skill-block="${id}"]`)!.getBoundingClientRect();
        const point = path.getPointAtLength(distance).matrixTransform(matrix);
        if (Math.abs(point.x - (block.left + block.width / 2)) > 2 || Math.abs(point.y - block[edge]) > 2) {
          detached.push(`${id}/${edge}`);
        }
      }
      for (let distance = 0; distance < length; distance += 5) {
        const point = path.getPointAtLength(distance).matrixTransform(matrix);
        for (const card of cards) {
          if ([path.dataset.edgeFrom, path.dataset.edgeTo].includes(card.id)) continue;
          const r = card.rect;
          if (point.x > r.left + 1 && point.x < r.right - 1
            && point.y > r.top + 1 && point.y < r.bottom - 1) {
            crossings.push(`${path.dataset.edgeFrom}->${path.dataset.edgeTo}/${card.id}`);
          }
        }
      }
    }
    return { overlaps, crossings, detached, paths: paths.length };
  });
}

async function expectContainedBuildViewport(page: Page) {
  const bounds = await page.locator(".character-build__tab-content").evaluate((content) => {
    const panel = content.closest(".character-build-modal")!.getBoundingClientRect();
    const viewport = content.getBoundingClientRect();
    return {
      visible: viewport.height > 0,
      contained: viewport.top >= panel.top && viewport.bottom <= panel.bottom + 1,
      onScreen: panel.top >= 0 && panel.bottom <= window.innerHeight + 1,
    };
  });
  expect(bounds).toEqual({ visible: true, contained: true, onScreen: true });
  const tabHeights = await page.locator(".character-build__tab").evaluateAll((tabs) =>
    tabs.map((tab) => tab.getBoundingClientRect().height),
  );
  expect(Math.min(...tabHeights)).toBeGreaterThanOrEqual(32);
}

for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
  test.describe(`${viewport.width}px viewport`, () => {
    test.use({ viewport, hasTouch: viewport.width === 390 });
    test("local zoom retains geometry, navigation and native scrolling", async ({ page }, testInfo) => {
      test.setTimeout(90_000);
      await openSkillTree(page);
      const selector = page.getByRole("combobox", { name: "技能分支" });
      const reset = page.getByRole("button", { name: /重置为 100%$/ });
      const canvas = page.getByRole("region", { name: /技能树画布/ });
      await page.getByRole("button", { name: "辅助技能", exact: true }).click();
      await page.getByRole("button", { name: "全部分支", exact: true }).click();
      const pageScale = await page.evaluate(() => ({ dpr: devicePixelRatio, scale: visualViewport?.scale }));
      const controlSize = await selector.evaluate((element) => element.getBoundingClientRect().height);

      async function canvasPoint() {
        await canvas.scrollIntoViewIfNeeded();
        return canvas.evaluate((element) => {
          const r = element.getBoundingClientRect();
          const outer = element.closest(".character-build__tab-content")!.getBoundingClientRect();
          return { x: r.left + element.clientWidth / 2, y: (Math.max(r.top, outer.top) + Math.min(r.bottom, outer.bottom)) / 2 };
        });
      }
      async function wheelZoom(deltaY: number, expected: string) {
        const point = await canvasPoint();
        await page.mouse.move(point.x, point.y);
        await page.keyboard.down("Control");
        await page.mouse.wheel(0, deltaY);
        await page.keyboard.up("Control");
        await expect(reset).toHaveText(`${expected}% · 重置`);
      }
      async function checkGeometry(label: string) {
        await expectContainedBuildViewport(page);
        const geometry = await graphIntersections(page);
        expect(geometry.overlaps).toEqual([]);
        expect(geometry.crossings).toEqual([]);
        expect(geometry.detached).toEqual([]);
        await page.screenshot({ path: testInfo.outputPath(`zoom-${label}.png`), fullPage: true });
        const last = page.locator("[data-skill-id]").last();
        await last.scrollIntoViewIfNeeded();
        expect(await last.evaluate((card) => {
          const r = card.getBoundingClientRect();
          const canvas = card.closest(".skilltree-tab__graph-wrap")!.getBoundingClientRect();
          const outer = card.closest(".character-build__tab-content")!.getBoundingClientRect();
          const x = (Math.max(r.left, canvas.left) + Math.min(r.right, canvas.right)) / 2;
          const y = (Math.max(r.top, canvas.top, outer.top) + Math.min(r.bottom, canvas.bottom, outer.bottom)) / 2;
          return card.contains(document.elementFromPoint(x, y));
        })).toBe(true);
      }

      await checkGeometry("100");
      const finePoint = await canvasPoint();
      await page.mouse.move(finePoint.x, finePoint.y);
      await page.keyboard.down("Control");
      for (let step = 0; step < 20; step++) await page.mouse.wheel(0, -1);
      await page.keyboard.up("Control");
      await expect(reset).toHaveText("104% · 重置");
      await expect(reset).toHaveAccessibleName("当前缩放 104%，重置为 100%");
      await reset.click();
      await expect(reset).toHaveText("100% · 重置");
      // Start away from scroll limits so the pointer's content coordinate can stay fixed.
      await canvas.evaluate((element) => { element.scrollLeft = 300; element.scrollTop = 400; });
      const point = await canvasPoint();
      const before = await page.locator("[data-branch-id]").first().boundingBox();
      await wheelZoom(-Math.log(1.5) / 0.002, "150");
      const after = await page.locator("[data-branch-id]").first().boundingBox();
      expect((point.x - after!.x) / 1.5).toBeCloseTo(point.x - before!.x, 0);
      expect((point.y - after!.y) / 1.5).toBeCloseTo(point.y - before!.y, 0);
      expect(await selector.evaluate((element) => element.getBoundingClientRect().height)).toBe(controlSize);
      expect(await page.evaluate(() => ({ dpr: devicePixelRatio, scale: visualViewport?.scale }))).toEqual(pageScale);

      await wheelZoom(-10000, "200");
      await wheelZoom(-10000, "200");
      await selector.selectOption("125");
      await expect(reset).toHaveText("200% · 重置");
      await page.locator('[data-skill-id="125"]').scrollIntoViewIfNeeded();
      await checkGeometry("200-join");
      const reference = page.locator('[data-merge-for="125"] [data-prerequisite-id="112"]');
      await reference.focus();
      await page.keyboard.press("Enter");
      await expect(page.locator('[data-skill-id="112"]')).toBeFocused();
      await expect(reset).toHaveText("200% · 重置");
      await page.getByRole("button", { name: "全部分支", exact: true }).click();
      await checkGeometry("200");
      await wheelZoom(10000, "50");
      await wheelZoom(10000, "50");
      await checkGeometry("50");
      await reset.click();
      await expect(reset).toHaveText("100% · 重置");

      await canvas.evaluate((element) => { element.scrollTop = 300; element.scrollLeft = 300; });
      const scrollPoint = await canvasPoint();
      await page.mouse.move(scrollPoint.x, scrollPoint.y);
      const top = await canvas.evaluate((element) => element.scrollTop);
      await page.mouse.wheel(0, 180);
      await expect.poll(() => canvas.evaluate((element) => element.scrollTop)).toBeGreaterThan(top);
      await expect(reset).toHaveText("100% · 重置");

      if (viewport.width === 390) {
        const touch = await page.context().newCDPSession(page);
        const start = await canvasPoint();
        const top = await canvas.evaluate((element) => element.scrollTop);
        await touch.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: start.x, y: start.y }] });
        for (let step = 1; step <= 6; step++) {
          await touch.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: start.x, y: start.y - step * 15 }] });
        }
        await touch.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
        await expect.poll(() => canvas.evaluate((element) => element.scrollTop)).toBeGreaterThan(top);
        await touch.detach();
      } else {
        // Drag empty canvas space, release outside it, then drag a card's non-control area.
        await canvas.evaluate((element) => { element.scrollLeft = 300; element.scrollTop = 0; });
        const box = await canvas.boundingBox();
        await page.mouse.move(box!.x + 200, box!.y + 10);
        await page.mouse.down();
        await page.mouse.move(box!.x + 100, box!.y - 40, { steps: 8 });
        await expect(canvas).toHaveClass(/--dragging/);
        expect(await canvas.evaluate((element) => [element.scrollLeft, element.scrollTop])).toEqual([400, 50]);
        await page.mouse.up();
        await expect(canvas).not.toHaveClass(/--dragging/);
        await page.getByRole("button", { name: "物理技能", exact: true }).click();
        await selector.selectOption("2");
        const card = page.locator('[data-skill-id="2"]');
        await card.scrollIntoViewIfNeeded();
        const heading = card.locator("h4");
        const h = await heading.boundingBox();
        const before = await canvas.evaluate((element) => element.scrollTop);
        await page.mouse.move(h!.x + h!.width / 2, h!.y + h!.height / 2);
        await page.mouse.down();
        await page.mouse.move(h!.x + h!.width / 2, h!.y + h!.height / 2 - 70, { steps: 8 });
        await page.mouse.up();
        expect(await canvas.evaluate((element) => element.scrollTop)).toBeGreaterThan(before);
        await expect(card).toHaveAttribute("data-state", "learnable");
        await card.getByRole("button", { name: /^学习 / }).click();
        await expect(card).toHaveAttribute("data-state", "learned");
        await expect(card).toBeFocused();
      }

      await page.getByRole("button", { name: "被动技能", exact: true }).click();
      for (const [delta, level] of [[-10000, "200"], [10000, "50"]] as const) {
        await wheelZoom(delta, level);
        await checkGeometry(`${level}-passive`);
      }
      await page.getByRole("button", { name: "装备技能", exact: true }).click();
      await page.getByRole("button", { name: "技能学习", exact: true }).click();
      await expect(reset).toHaveText("100% · 重置");
    });

    test(`skill-tree branches, legacy skills and AND joins at ${viewport.width}px`, async ({
      page,
    }, testInfo) => {
      test.setTimeout(90_000);
      await page.setViewportSize(viewport);
      await openSkillTree(page);
      await expectContainedBuildViewport(page);
      const selector = page.getByRole("combobox", { name: "技能分支" });
      await expect(selector).not.toHaveValue("all");
      await expect(page.locator("[data-branch-id]")).toHaveCount(1);

      await selector.selectOption("2");
      await page.getByRole("button", { name: "学习 横扫", exact: true }).click();
      await expect(page.locator('[data-skill-id="2"]')).toHaveAttribute("data-state", "learned");
      await expect(page.getByRole("button", { name: "学习 突击", exact: true })).toBeEnabled();
      await expect(page.locator(".skilltree-tab__toast")).toHaveText("学习了技能！");
      expect(await page.locator(".skilltree-tab").evaluate((tree) => {
        const toast = tree.querySelector(".skilltree-tab__toast")!.getBoundingClientRect();
        const categories = tree.querySelector(".skilltree-tab__cats")!.getBoundingClientRect();
        return toast.bottom <= categories.top;
      })).toBe(true);
      const allBranches = page.getByRole("button", { name: "全部分支", exact: true });
      if (viewport.width === 390) await allBranches.tap();
      else await allBranches.click();
      await expect(selector).toHaveValue("all");
      await expect.poll(async () => (await graphIntersections(page)).paths).toBeGreaterThan(0);
      expect((await graphIntersections(page)).overlaps).toEqual([]);
      expect((await graphIntersections(page)).crossings).toEqual([]);

      await page.getByRole("button", { name: "辅助技能", exact: true }).click();
      await selector.selectOption("125");
      const join = page.locator('[data-merge-for="125"]');
      await expect(join).toContainText("全部前置");
      await expect(join.locator("[data-prerequisite-id]")).toHaveCount(5);
      await expect(join.locator('[data-state="learned"]')).toHaveCount(5);
      await expect(page.locator('[data-skill-id="125"]')).toHaveAttribute("data-state", "learned");
      const supportCanvas = page.getByRole("region", { name: "辅助技能树画布" });
      await supportCanvas.focus();
      const scrollLeft = await supportCanvas.evaluate((canvas) => canvas.scrollLeft);
      await page.keyboard.press("ArrowRight");
      await expect.poll(() => supportCanvas.evaluate((canvas) => canvas.scrollLeft)).toBeGreaterThan(scrollLeft);
      const protection = page.locator('[data-skill-id="125"]');
      await protection.scrollIntoViewIfNeeded();
      await expectContainedBuildViewport(page);
      expect(await protection.evaluate((card) => {
        const rect = card.getBoundingClientRect();
        const content = card.closest(".character-build__tab-content")!.getBoundingClientRect();
        const graph = card.closest(".skilltree-tab__graph-wrap")!.getBoundingClientRect();
        const x = (rect.left + rect.right) / 2;
        const y = (rect.top + rect.bottom) / 2;
        return x >= graph.left && x <= graph.right && y >= content.top && y <= content.bottom
          && card.contains(document.elementFromPoint(x, y));
      })).toBe(true);
      await page.screenshot({ path: testInfo.outputPath("element-protection.png"), fullPage: true });

      const reference = join.getByRole("button", { name: /^查看 火焰吸收/ });
      await reference.focus();
      await page.keyboard.press("Enter");
      await expect(page.locator('[data-skill-id="112"]')).toBeFocused();
      await expect(page.locator('[data-skill-id="112"]')).toHaveAttribute("data-state", "learned");
      await page.getByRole("button", { name: "全部分支", exact: true }).click();
      expect((await graphIntersections(page)).overlaps).toEqual([]);
      expect((await graphIntersections(page)).crossings).toEqual([]);

      await page.getByRole("button", { name: "魔法技能", exact: true }).click();
      await page.getByRole("button", { name: "全部分支", exact: true }).click();
      await expect(page.locator('[data-skill-id="102"]')).toHaveAttribute("data-state", "learned");
      expect((await graphIntersections(page)).overlaps).toEqual([]);
      expect((await graphIntersections(page)).crossings).toEqual([]);

      await page.getByRole("button", { name: "被动技能", exact: true }).click();
      await expect(selector).not.toHaveValue("all");
      await expect(page.locator("[data-branch-id]")).toHaveCount(1);
      const canvas = page.getByRole("region", { name: "被动技能树画布" });
      await canvas.focus();
      await page.keyboard.press("ArrowDown");
      await expect(canvas).toBeFocused();
      await page.locator("[data-skill-id]").last().scrollIntoViewIfNeeded();
      await expectContainedBuildViewport(page);
      await page.screenshot({ path: testInfo.outputPath("passive-branch.png"), fullPage: true });

      for (const name of ["点数分配", "装备技能"]) {
        await page.getByRole("button", { name, exact: true }).click();
        await expectContainedBuildViewport(page);
      }
    });
  });
}
