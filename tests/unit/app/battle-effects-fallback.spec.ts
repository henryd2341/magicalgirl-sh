import { afterEach, describe, expect, it, vi } from "vitest";
import { effectScope } from "vue";

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.resetModules(); });

describe("battle effect resource and preference fallback", () => {
  it.each([
    ["icewater", "Ice"],
    ["circle_03", "Heal"],
  ] as const)("isolates failed %s assets to recipes requiring them", async (failedAsset, affectedElement) => {
    const decode = vi.fn(function (this: { src: string }) {
      return this.src.includes(failedAsset) ? Promise.reject(new Error("one missing asset")) : Promise.resolve();
    });
    vi.stubGlobal("Image", class { naturalWidth = 512; src = ""; decode = decode; });
    const { createBattleEffectsRenderer, loadEffectTextures } = await import("@/ui/battle/battleEffectsRenderer");
    const { BATTLE_ELEMENTS } = await import("@/types/battle");
    expect(await loadEffectTextures()).toBe(false);
    const root = document.createElement("section");
    root.innerHTML = '<div class="battle-hud__enemy-row"><div data-participant-id="e"></div></div>';
    const host = document.createElement("div"); root.append(host); document.body.append(root);
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({ x: 0, y: 0, left: 0, top: 0, right: 300, bottom: 300, width: 300, height: 300, toJSON() {} });
    const marks: string[] = [];
    HTMLElement.prototype.animate = vi.fn(function () {
      marks.push(this.style.maskImage);
      return { finished: Promise.resolve(), playState: "finished", cancel() {} } as unknown as Animation;
    });
    const renderer = createBattleEffectsRenderer(host, root);
    const before = { participants: [{ id: "e", side: "enemy" }] } as import("@/types/battle").BattleSnapshot;
    for (const element of [BATTLE_ELEMENTS[affectedElement], BATTLE_ELEMENTS.Fire]) {
      marks.length = 0;
      await renderer.play({ before, mode: "standard", action: { actionId: "basic-skill", name: "test", category: "magic", element,
        outcomes: [{ type: "hit", tags: [], finalTargetId: "e", hpDelta: -1 }] }, reveal() {}, feedback() {} });
      expect(marks.some(mask => mask.includes("flame_05"))).toBe(element === BATTLE_ELEMENTS.Fire);
      if (element === BATTLE_ELEMENTS[affectedElement]) expect(marks.every(mask => !mask)).toBe(true);
    }
    expect(decode).toHaveBeenCalledTimes(16); renderer.dispose(); root.remove();
  });
  it.each(["reject", "missing"])("does not wait on %s textures and does not retry per action", async failure => {
    vi.resetModules();
    const decode = vi.fn(() => failure === "reject" ? Promise.reject(new Error("decode")) : Promise.resolve());
    vi.stubGlobal("Image", class { naturalWidth = 0; src = ""; decode = decode; });
    const { loadEffectTextures } = await import("@/ui/battle/battleEffectsRenderer");
    expect(await loadEffectTextures()).toBe(false); expect(await loadEffectTextures()).toBe(false);
    expect(decode).toHaveBeenCalledTimes(16);
  });
  it.each(["bad-value", "denied"])("uses Standard for %s storage and respects live OS motion", async scenario => {
    vi.resetModules();
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { if (scenario === "denied") throw new Error("denied"); return "bad-value"; });
    let change = () => {};
    const media = { matches: false, addEventListener: vi.fn((_name, handler) => { change = handler; }), removeEventListener: vi.fn() };
    vi.stubGlobal("matchMedia", () => media);
    const { useBattleEffects } = await import("@/composables/useBattleEffects");
    const scope = effectScope(); const mode = scope.run(useBattleEffects)!;
    expect(mode.preference.value).toBe("standard"); expect(mode.effectiveMode.value).toBe("standard");
    media.matches = true; change(); expect(mode.effectiveMode.value).toBe("reduced"); expect(mode.preference.value).toBe("standard");
    scope.stop(); expect(media.removeEventListener).toHaveBeenCalledTimes(1);
  });
});
