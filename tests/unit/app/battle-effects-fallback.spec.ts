import { afterEach, describe, expect, it, vi } from "vitest";
import { effectScope } from "vue";

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.resetModules(); });

describe("battle effect resource and preference fallback", () => {
  it.each(["reject", "missing"])("does not wait on %s textures and does not retry per action", async failure => {
    vi.resetModules();
    const decode = vi.fn(() => failure === "reject" ? Promise.reject(new Error("decode")) : Promise.resolve());
    vi.stubGlobal("Image", class { naturalWidth = 0; src = ""; decode = decode; });
    const { loadEffectTextures } = await import("@/ui/battle/battleEffectsRenderer");
    expect(await loadEffectTextures()).toBe(false); expect(await loadEffectTextures()).toBe(false);
    expect(decode).toHaveBeenCalledTimes(7);
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
