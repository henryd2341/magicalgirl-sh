import { expect, test, type Page } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";

const evidence = ".trellis/tasks/10-26-battle-presentation-effects/evidence/implementation";
async function open(page: Page, mode = "standard", theme = "e-girl") {
  await page.goto(`/tests/e2e/fixtures/battle-presentation-live.html?shell=1&effects=0&vfx=${mode}&theme=${theme}`);
  await expect(page.getByText("纹理就绪", { exact: true })).toBeVisible();
}
async function launch(page: Page, scenario: string) {
  await page.locator(`[data-scenario="${scenario}"]`).click();
}
async function idle(page: Page) { await expect(page.locator(".battle-presentation-cue")).toHaveCount(0); }

test("one canonical settlement, final-only fifteen-hit HP/log reveal, input guard and cleanup", async ({ page }) => {
  await open(page);
  await launch(page, "multi");
  await expect(page.locator(".battle-presentation-cue")).toBeVisible();
  const before = await page.locator(".battle-enemy-card__hp-nums").allTextContents();
  expect(before.every(text => text.includes("10000/10000"))).toBe(true);
  const result = await page.evaluate(() => ({
    hp: (window as any).hudBattle.activeBattle.participants.filter((p: any) => p.side === "enemy").map((p: any) => p.hp.current),
    receipt: (window as any).hudBattle.latestActionReceipt,
  }));
  expect(result.hp.every((hp: number) => hp < 10000)).toBe(true);
  expect(result.receipt.outcomes.filter((o: any) => o.hpDelta < 0)).toHaveLength(35);
  expect(result.receipt.outcomes.filter((o: any) => o.hpDelta < 0 && o.finalTargetId === "enemy-1")).toHaveLength(15);
  await expect(page.getByRole("button", { name: "执行样例", exact: true })).toBeDisabled();
  await page.waitForTimeout(450);
  expect(await page.locator(".battle-enemy-card__hp-nums").allTextContents()).toEqual(before);
  await idle(page);
  expect(await page.locator(".battle-enemy-card__hp-nums").allTextContents()).not.toEqual(before);
  await expect(page.locator(".battle-effects-layer > *")).toHaveCount(0);
  expect(await page.evaluate(() => document.querySelector(".battle-effects-layer")!.getAnimations({ subtree: true }).length)).toBe(0);
});

test("skip, live Off, same-ID restore and inspection immediately reconcile", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await open(page);
  for (const interruption of ["skip", "off", "restore", "inspect"]) {
    await page.getByLabel("演出模式").selectOption("standard"); await launch(page, "multi");
    await expect(page.locator(".battle-presentation-cue")).toBeVisible();
    if (interruption === "skip") await page.getByRole("button", { name: "跳过", exact: true }).click();
    if (interruption === "off") await page.getByLabel("演出模式").selectOption("off");
    if (interruption === "restore") await page.getByRole("button", { name: "同 ID 恢复" }).click();
    if (interruption === "inspect") {
      await page.getByRole("button", { name: "查看队伍", exact: true }).click();
      await expect(page.getByRole("dialog", { name: "玩家队伍", exact: true })).toBeVisible();
      await page.keyboard.press("Escape");
    }
    await idle(page); await expect(page.locator(".battle-effects-layer > *")).toHaveCount(0);
  }
});

for (const mode of ["standard", "reduced", "off"]) test(`${mode}: terminal result never leaks early`, async ({ page }) => {
  await open(page, mode); await launch(page, "final");
  if (mode === "standard") {
    await expect(page.getByRole("heading", { name: "战斗进行中", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "完成战斗" })).toHaveCount(0);
  }
  await idle(page);
  await expect(page.getByRole("heading", { name: "战斗结束", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "完成战斗" })).toBeEnabled();
});

test("missing textures and rejected animation fall back without stale decorations", async ({ page }) => {
  await page.route("**/assets/battle-effects/**", route => route.request().resourceType() === "image" ? route.abort() : route.continue());
  await page.goto("/tests/e2e/fixtures/battle-presentation-live.html?effects=0&vfx=standard");
  await expect(page.getByText("纹理不可用 · 精简反馈", { exact: true })).toBeVisible();
  await launch(page, "multi"); await idle(page);
  await page.evaluate(() => { Element.prototype.animate = () => { throw new Error("injected unsupported animation"); }; });
  await launch(page, "slash"); await idle(page);
  await expect(page.locator(".battle-effects-layer > *")).toHaveCount(0);
});

test("hidden allies get named recovery feedback without opening/reordering the roster", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await open(page); await launch(page, "hidden");
  await expect(page.locator(".battle-presentation-cue")).toContainText("盐田堇子");
  await expect(page.getByRole("dialog", { name: "玩家队伍", exact: true })).toHaveCount(0);
  await expect(page.locator(".battle-party-slot--front")).toHaveAttribute("data-participant-id", "ally-0");
  await idle(page);
});

test("real group shields render recovery, interception and reflected damage at their actual anchors", async ({ page }) => {
  await open(page, "off"); await launch(page, "area");
  const diagnostics = await page.evaluate(async () => {
    const { createBattleEffectsRenderer, loadEffectTextures, participantAnchor } = await import("/src/ui/battle/battleEffectsRenderer.ts");
    const { cloneBattlePresentationData } = await import("/src/stores/battlePresentationData.ts");
    const { resolveSelectedBattleAction } = await import("/src/engine/battle/battleResolver.ts");
    await loadEffectTextures();
    const root = document.querySelector<HTMLElement>("#battle-overlay")!;
    const host = document.createElement("div"); host.className = "battle-effects-layer"; root.append(host);
    const renderer = createBattleEffectsRenderer(host, root); const original = Element.prototype.animate;
    const results = [];
    try {
      for (const scenario of ["absorb", "reflect", "mixed", "ordinary"]) {
        const before = cloneBattlePresentationData((window as any).hudBattle.activeBattle);
        if (scenario === "absorb" || scenario === "reflect") before.participants = before.participants.filter((p: any) => p.side === "player" || p.id === "enemy-1");
        before.currentActorId = "ally-0"; before.selectedActionId = "basic-skill"; before.selectedContentId = "37"; before.selectedTargetId = "enemy-1";
        const actor = before.participants.find((p: any) => p.id === "ally-0")!; actor.mp.current = 999; actor.availableSkillIds = new Set(["37"]);
        for (const p of before.participants.filter((p: any) => p.side === "enemy")) {
          p.hp.current = 5000; p.statusEffects = [];
          const shield = scenario === "absorb" || (scenario === "mixed" && p.id === "extra-1") ? "fire_absorb"
            : scenario === "reflect" || (scenario === "mixed" && p.id === "extra-2") ? "fire_reflect" : null;
          if (shield) p.statusEffects = [{ effectId: shield, remainingDuration: 2, stacks: 1 }];
        }
        const trace: any = {}; const random = Math.random; Math.random = () => .1;
        try { resolveSelectedBattleAction(before, trace); } finally { Math.random = random; }
        const marks: { mask: string; color: string; x: number; y: number; duration: number }[] = [];
        let maximum = 0; let reveals = 0;
        Element.prototype.animate = function (frames, options) {
          if (this.parentElement === host) {
            maximum = Math.max(maximum, host.childElementCount);
            const element = this as HTMLElement;
            marks.push({ mask: element.style.maskImage, color: element.style.backgroundColor, x: parseFloat(element.style.left), y: parseFloat(element.style.top), duration: (options as KeyframeAnimationOptions).duration as number });
          }
          return original.call(this, frames, options);
        };
        const anchors = Object.fromEntries(before.participants.map((p: any) => [p.id, participantAnchor(root, host, p.id, p.side)]));
        const start = performance.now();
        await renderer.play({ action: trace.action, before, mode: "standard", reveal() { reveals++; }, feedback() {} });
        results.push({ scenario, action: trace.action, anchors, marks, maximum, reveals, duration: performance.now() - start, remaining: host.childElementCount, animations: host.getAnimations({ subtree: true }).length });
      }
    } finally { Element.prototype.animate = original; renderer.dispose(); host.remove(); }
    return results;
  });
  await writeFile(`${evidence}/repair-group-diagnostics.json`, JSON.stringify(diagnostics, null, 2));
  for (const result of diagnostics) {
    const impacts = result.marks.filter(mark => mark.duration === 300);
    const at = (id: string, texture: string, color: string) => {
      const point = result.anchors[id];
      expect(point.visible).toBe(true);
      expect(impacts.some(mark => mark.mask.includes(texture) && mark.color === color && Math.abs(mark.x - point.x) < .01 && Math.abs(mark.y - point.y) < .01)).toBe(true);
    };
    if (result.scenario === "absorb" || result.scenario === "mixed") at(result.scenario === "absorb" ? "enemy-1" : "extra-1", "magic_01", "rgb(86, 239, 189)");
    if (result.scenario === "reflect" || result.scenario === "mixed") { at(result.scenario === "reflect" ? "enemy-1" : "extra-2", "magic_01", "rgb(230, 199, 103)"); at("ally-0", "flame_01", "rgb(255, 147, 111)"); }
    if (result.scenario === "mixed") at("enemy-1", "flame_01", "rgb(255, 147, 111)");
    expect(impacts.filter(mark => mark.mask.includes("flame_01"))).toHaveLength(result.scenario === "absorb" ? 0 : result.scenario === "mixed" ? 2 : 1);
    if (result.scenario === "ordinary") expect(result.maximum).toBe(12);
    expect(result.maximum).toBeLessThanOrEqual(48); expect(result.duration).toBeLessThan(2000);
    expect(result.reveals).toBe(1); expect(result.remaining).toBe(0); expect(result.animations).toBe(0);
  }
});

test("scrolled-away enemies and live resize use visible anchors without stale effects", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await open(page);
  await page.evaluate(() => (window as any).presentationFixture.launch("overflow"));
  await page.locator(".battle-hud__enemy-row").evaluate(element => { element.scrollLeft = element.scrollWidth; });
  const anchors = await page.evaluate(async () => {
    const { participantAnchor } = await import("/src/ui/battle/battleEffectsRenderer.ts");
    const root = document.querySelector<HTMLElement>("#battle-overlay")!;
    const host = document.querySelector<HTMLElement>(".battle-effects-layer")!;
    return [participantAnchor(root, host, "enemy-1", "enemy"), participantAnchor(root, host, "extra-7", "enemy")];
  });
  expect(anchors[0]?.visible).toBe(false); expect(anchors[1]?.visible).toBe(true);
  await page.setViewportSize({ width: 844, height: 390 }); await idle(page);
  await expect(page.locator(".battle-effects-layer > *")).toHaveCount(0);
});

for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }, { width: 844, height: 390 }, { width: 360, height: 640 }]) {
  test(`${viewport.width}x${viewport.height}: five textured forms and overflow`, async ({ page }) => {
    test.setTimeout(60000); await page.setViewportSize(viewport); await open(page);
    await mkdir(evidence, { recursive: true });
    for (const scenario of ["slash", "magic", "area", "heal", "support"]) {
      await page.evaluate(() => {
        const original = Element.prototype.animate;
        const paused: Animation[] = [];
        (window as any).pausedEffects = paused;
        (window as any).restoreAnimate = () => { Element.prototype.animate = original; for (const animation of paused) animation.play(); };
        Element.prototype.animate = function (frames, options) {
          const animation = original.call(this, frames, options);
          if (this.classList.contains("battle-effect-texture") && typeof options === "object" && options.duration === 300) {
            animation.pause(); animation.currentTime = 45; paused.push(animation);
          }
          return animation;
        };
      });
      await launch(page, scenario);
      if (viewport.height >= 500) await page.waitForFunction(() => (window as any).pausedEffects.length > 0);
      await page.screenshot({ path: `${evidence}/frame-${viewport.width}-${scenario}.png`, animations: "allow" });
      await page.evaluate(() => (window as any).restoreAnimate());
      await idle(page);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
}

for (const theme of ["kidcore", "pastel-brutalism"]) test(`${theme}: textured forms in the existing theme`, async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await open(page, "standard", theme);
  await launch(page, "multi"); await page.waitForTimeout(400);
  await page.screenshot({ path: `${evidence}/theme-${theme}.png`, animations: "allow" });
  await idle(page);
});

test("capture actual magical travel and its endpoints", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 }); await open(page);
  await page.evaluate(() => {
    const original = Element.prototype.animate;
    (window as any).pausedEffects = [];
    Element.prototype.animate = function (frames, options) {
      const animation = original.call(this, frames, options);
      if (this.classList.contains("battle-effect-texture") && Array.isArray(frames) && frames.length === 2) {
        animation.pause(); animation.currentTime = 85; (window as any).pausedEffects.push(animation);
      }
      return animation;
    };
  });
  await launch(page, "magic"); await page.waitForFunction(() => (window as any).pausedEffects.length > 0);
  await page.screenshot({ path: `${evidence}/frame-1440-travel.png`, animations: "allow" });
  await page.getByRole("button", { name: "跳过", exact: true }).click(); await idle(page);
});

test("50 action and remount cycles return native animation/element counts to idle", async ({ page }) => {
  test.setTimeout(90000); await open(page);
  for (let i = 0; i < 50; i++) {
    await page.evaluate(() => (window as any).presentationFixture.launch("slash"));
    await idle(page);
    expect(await page.locator(".battle-effects-layer > *").count()).toBe(0);
    if (i % 10 === 9) await page.evaluate(() => (window as any).presentationFixture.remount());
  }
  expect(await page.evaluate(() => document.querySelector(".battle-effects-layer")!.getAnimations({ subtree: true }).length)).toBe(0);
});

test("multi-hit, reduced and off stay within their actual playback deadlines", async ({ page }) => {
  await open(page);
  const durations = await page.evaluate(async () => {
    const fixture = (window as any).presentationFixture;
    const result: Record<string, number> = {};
    for (const mode of ["standard", "reduced", "off"]) {
      fixture.setMode(mode);
      const start = performance.now();
      await fixture.launch("multi");
      while (document.querySelector(".battle-presentation-cue")) await new Promise(requestAnimationFrame);
      result[mode] = performance.now() - start;
    }
    return result;
  });
  await writeFile(`${evidence}/playback-durations.json`, JSON.stringify(durations, null, 2));
  expect(durations.standard).toBeLessThanOrEqual(2000);
  expect(durations.reduced).toBeLessThanOrEqual(200);
  expect(durations.off).toBeLessThan(100);
});

for (const width of [1440, 390]) test(`${width}: warmed Standard/Off 30-second frame samples`, async ({ page, browser }) => {
  test.setTimeout(120000); await page.setViewportSize({ width, height: width === 1440 ? 900 : 844 }); await open(page);
  const results: Record<string, unknown> = { browser: browser.version(), viewport: page.viewportSize() };
  const client = await page.context().newCDPSession(page);
  for (const mode of ["off", "standard"]) {
    await page.getByLabel("演出模式").selectOption(mode);
    await launch(page, "area"); await idle(page); await page.waitForTimeout(1500);
    await client.send("Tracing.start", { categories: "devtools.timeline,disabled-by-default-devtools.timeline,v8,blink.user_timing", transferMode: "ReturnAsStream" });
    results[mode] = await page.evaluate(async () => {
      const fixture = (window as any).presentationFixture;
      const frames: number[] = []; const longTasks: { start: number; duration: number }[] = [];
      const observer = new PerformanceObserver(list => { for (const entry of list.getEntries()) longTasks.push({ start: entry.startTime, duration: entry.duration }); });
      observer.observe({ type: "longtask", buffered: false });
      let frame = 0; let last = performance.now(); let maximum = 0;
      const loop = (time: number) => { frames.push(time - last); last = time; maximum = Math.max(maximum, document.querySelectorAll(".battle-effects-layer > *").length); frame = requestAnimationFrame(loop); };
      frame = requestAnimationFrame(loop);
      const start = performance.now(); const actions: number[] = [];
      while (performance.now() - start < 30000) { actions.push(performance.now()); await fixture.launch("area"); await new Promise(resolve => setTimeout(resolve, 1000)); }
      cancelAnimationFrame(frame); observer.disconnect();
      const sorted = frames.slice(2).sort((a, b) => a - b);
      return { p95: sorted[Math.floor(sorted.length * .95)], frames, longTasks, actions, maximum, duration: performance.now() - start };
    });
    const completed = new Promise<{ stream: string }>(resolve => client.once("Tracing.tracingComplete", resolve));
    await client.send("Tracing.end");
    const { stream } = await completed;
    let trace = "";
    while (true) {
      const chunk = await client.send("IO.read", { handle: stream });
      trace += chunk.data;
      if (chunk.eof) break;
    }
    await client.send("IO.close", { handle: stream });
    await writeFile(`${evidence}/trace-${width}-${mode}.json`, trace);
  }
  await writeFile(`${evidence}/performance-${width}.json`, JSON.stringify(results, null, 2));
  const off = results.off as { p95: number }; const standard = results.standard as { p95: number; maximum: number };
  expect(standard.maximum).toBeLessThanOrEqual(48); expect(standard.p95 - off.p95).toBeLessThanOrEqual(8);
});
