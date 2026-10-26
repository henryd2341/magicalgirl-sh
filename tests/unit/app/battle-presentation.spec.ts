import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { defineComponent, h, inject, nextTick, toRaw } from "vue";
import { render } from "@testing-library/vue";
import { useBattleStore } from "@/stores/battleStore";
import { resolveNextEnemyAction, resolveSelectedBattleAction } from "@/engine/battle/battleResolver";
import { type BattleActionTrace, type BattleSnapshot, type BattleTraceCollector } from "@/types/battle";
import { cloneBattlePresentationData } from "@/stores/battlePresentationData";
import { impactBeats, effectFamily, outcomeLabel } from "@/ui/battle/battleEffectRecipes";
import { battleInspectionKey, useBattlePresentation } from "@/ui/battle/useBattlePresentation";
import { setBattleEffects, normalizeBattleEffects, useBattleEffects } from "@/composables/useBattleEffects";
import { createBattleEffectsRenderer, loadEffectTextures, MAX_EFFECT_ELEMENTS } from "@/ui/battle/battleEffectsRenderer";
import type { EffectPlayback } from "@/ui/battle/battleEffectsRenderer";
import { getSkill } from "@/content/contentRegistry";

function battle(): BattleSnapshot {
  return {
    encounterId: "presentation", source: "story", lifecycleState: "ACTIVE", phase: "PLAYER_COMMAND", turnCount: 1,
    participants: ["p", "e"].map((id, i) => ({ id, side: i ? "enemy" : "player", displayName: id,
      level: 10, hp: { current: 10000, max: 10000 }, mp: { current: 999, max: 999 },
      attack: 20, defense: 10, intelligence: 20, agility: 100, isDown: false, isActive: true,
      statusEffects: [], availableSkillIds: new Set(["174", "36"]),
    })),
    pressTurn: { ownerSide: "player", icons: [{ id: "pt", state: "solid" }] },
    pressTurnAllocation: { participantIds: ["p"], initialIconCount: 1 }, currentActorId: "p",
    selectedActionId: "attack", selectedTargetId: "e", battleLog: [],
  };
}
const attack: BattleActionTrace = { actorId: "p", actionId: "attack", name: "斩击", category: "physical", outcomes: [
  { actorId: "p", primaryTargetId: "e", finalTargetId: "e", type: "hit", tags: [], hpDelta: -10 },
] };

beforeEach(() => {
  setActivePinia(createPinia());
  vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
  vi.spyOn(Math, "random").mockReturnValue(.1);
  vi.stubGlobal("Image", class { src = ""; naturalWidth = 512; decode() { return Promise.resolve(); } });
  setBattleEffects("standard");
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("authoritative detached receipts", () => {
  it.each(["player", "enemy"])("does not change %s result or consume extra RNG", side => {
    const state = battle();
    if (side === "enemy") { state.phase = "ENEMY_TURN"; state.currentActorId = "e"; state.pressTurn.ownerSide = "enemy"; state.pressTurnAllocation!.participantIds = ["e"]; }
    const resolve = side === "player" ? resolveSelectedBattleAction : resolveNextEnemyAction;
    const random = vi.mocked(Math.random);
    random.mockClear(); const expected = resolve(structuredClone(state)); const calls = random.mock.calls.length;
    random.mockClear(); const trace: BattleTraceCollector = {};
    expect(resolve(structuredClone(state), trace)).toEqual(expected);
    expect(random).toHaveBeenCalledTimes(calls);
    expect(trace.action?.outcomes.length).toBeGreaterThan(0);
  });
  it("records all 15 actual hits but excludes MP costs and status riders", () => {
    const state = battle(); state.selectedActionId = "basic-skill"; state.selectedContentId = "174";
    vi.mocked(Math.random).mockReturnValueOnce(.999).mockReturnValue(.1);
    const trace: BattleTraceCollector = {};
    resolveSelectedBattleAction(state, trace);
    expect(impactBeats(trace.action!)).toHaveLength(15);
    expect(trace.action?.outcomes.some(o => o.mpDelta === -150)).toBe(true);
  });
  it("retains an interrupted hit chain without inventing the remaining hits", () => {
    const state = battle(); state.selectedActionId = "basic-skill"; state.selectedContentId = "174";
    vi.mocked(Math.random).mockReturnValue(.999);
    const trace: BattleTraceCollector = {}; resolveSelectedBattleAction(state, trace);
    expect(impactBeats(trace.action!)).toHaveLength(1);
    expect(impactBeats(trace.action!)[0]?.outcomes[0]?.type).toBe("miss");
  });
  it("keeps aggregate reflection in a single beat with its true recipient", () => {
    const state = battle(); state.participants[1]!.statusEffects = [{ effectId: "physical_reflect", remainingDuration: 3, stacks: 1 }];
    const trace: BattleTraceCollector = {}; resolveSelectedBattleAction(state, trace);
    const beats = impactBeats(trace.action!);
    expect(beats).toHaveLength(1);
    expect(beats[0]!.outcomes.map(o => o.finalTargetId)).toEqual(["e", "p"]);
  });
  it("retains Endure and absorption clamping without treating nominal damage as HP loss", () => {
    const state = battle(); state.participants[1]!.hp.current = 5;
    state.participants[1]!.passiveEffects = getSkill("160").passiveEffects;
    const trace: BattleTraceCollector = {};
    const result = resolveSelectedBattleAction(state, trace);
    expect(result.participants[1]).toMatchObject({ hp: { current: 1 }, endureUsed: true, isDown: false });
    expect(trace.action!.outcomes[0]!.hpDelta).toBeLessThan(-4);
    expect(outcomeLabel(trace.action!.outcomes[0]!)).toBe("命中");
    state.participants[1]!.hp.current = 9999;
    state.participants[1]!.statusEffects = [{ effectId: "physical_absorb", remainingDuration: 2, stacks: 1 }];
    expect(resolveSelectedBattleAction(state, trace).participants[1]!.hp.current).toBe(10000);
    expect(outcomeLabel(trace.action!.outcomes[0]!)).toBe("吸收");
  });
  it("keeps receipt outside saves, consumes an item once and clears on same-ID restore", () => {
    const store = useBattleStore(); store.activeBattle = battle();
    store.activeBattle.selectedActionId = "basic-item"; store.activeBattle.selectedContentId = "1"; store.activeBattle.selectedTargetId = "p";
    store.activeBattle.participants[0]!.hp.current = 20;
    const consumed = vi.fn(); store.onItemConsumed = consumed;
    store.confirmSelectedAction();
    expect(consumed).toHaveBeenCalledTimes(1);
    expect(store.latestActionReceipt).not.toBeNull();
    expect(JSON.stringify(store.activeBattle)).not.toContain("outcomes");
    const receipt = structuredClone(toRaw(store.latestActionReceipt));
    store.activeBattle!.participants[0]!.hp.current = 1;
    expect(toRaw(store.latestActionReceipt)).toEqual(receipt);
    const serial = store.actionSerial; const generation = store.battleGeneration;
    const saved = cloneBattlePresentationData(store.activeBattle!);
    expect(saved.participants[0]?.availableSkillIds).toBeInstanceOf(Set);
    store.restoreBattleSnapshot({ activeBattle: saved });
    expect(store.latestActionReceipt).toBeNull(); expect(store.actionSerial).toBe(serial); expect(store.battleGeneration).toBe(generation + 1);
  });
  it("rejects invalid actions without a successful receipt", () => {
    const store = useBattleStore(); store.activeBattle = battle(); store.activeBattle.selectedTargetId = "absent";
    store.confirmSelectedAction(); expect(store.latestActionReceipt).toBeNull(); expect(store.actionSerial).toBe(0);
  });
  it("records neutral successful pass and exceptional phase transitions", () => {
    const store = useBattleStore(); store.activeBattle = battle(); store.activeBattle.selectedActionId = "pass";
    store.confirmSelectedAction(); expect(store.latestActionReceipt?.actionId).toBe("pass");
    store.activeBattle = battle(); store.activeBattle.participants[0]!.hp.current = 0; store.activeBattle.participants[0]!.isDown = true;
    store.confirmSelectedAction(); expect(store.latestActionReceipt?.actionId).toBe("state-change");
    expect(store.activeBattle?.phase).toBe("RESULT");
  });
});

describe("display-only action lane", () => {
  function setup() {
    const store = useBattleStore(); store.activeBattle = battle();
    let input: EffectPlayback | undefined; let finish = () => {};
    const player = { play: vi.fn((value: EffectPlayback) => { input = value; return new Promise<void>(resolve => { finish = resolve; }); }), cancel: vi.fn(() => finish()) };
    let lane!: ReturnType<typeof useBattlePresentation>;
    let openInspection!: () => () => void;
    const inspection = defineComponent({ setup() { openInspection = inject(battleInspectionKey)!.open; return () => h("div"); } });
    const wrapper = render(defineComponent({ setup() { lane = useBattlePresentation(store, () => player); return () => h(inspection); } }));
    return { store, lane, player, wrapper, openInspection, get input() { return input!; }, finish: () => finish() };
  }
  it("holds all HUD fields and full logs, settles canonically once and reveals only on impact", async () => {
    const context = setup(); const before = structuredClone(toRaw(context.store.activeBattle!));
    const work = context.lane.run(() => context.store.confirmSelectedAction());
    await nextTick();
    expect(context.lane.busy.value).toBe(true);
    expect(context.lane.displayedBattle.value).toEqual(before);
    expect(context.store.activeBattle?.battleLog?.length).toBeGreaterThan(0);
    expect(context.store.activeBattle?.participants[1]?.hp.current).toBeLessThan(10000);
    const second = vi.fn(); await context.lane.run(second); expect(second).not.toHaveBeenCalled();
    context.input.reveal(); expect(context.lane.displayedBattle.value).toBe(context.store.activeBattle);
    context.finish(); await work; expect(context.lane.busy.value).toBe(false);
  });
  it.each(["off", "skip", "restore", "hidden", "unmount"])("releases %s without stale callbacks affecting another battle", async reason => {
    const c = setup(); const work = c.lane.run(() => c.store.confirmSelectedAction()); await nextTick();
    const stale = c.input;
    if (reason === "off") setBattleEffects("off");
    else if (reason === "restore") c.store.restoreBattleSnapshot({ activeBattle: battle() });
    else if (reason === "hidden") document.dispatchEvent(new Event("visibilitychange"));
    else if (reason === "unmount") c.wrapper.unmount();
    else c.lane.skip();
    await work; await c.lane.waitUntilReady();
    const current = c.store.activeBattle; stale.reveal(); stale.feedback("stale");
    expect(c.lane.busy.value).toBe(false); expect(c.lane.displayedBattle.value).toBe(current); expect(c.lane.feedback.value).toBe("");
  });
  it("Off is synchronous and renderer rejection does not lock input", async () => {
    const c = setup(); setBattleEffects("off");
    const work = c.lane.run(() => c.store.confirmSelectedAction());
    expect(c.lane.busy.value).toBe(false); expect(c.player.play).not.toHaveBeenCalled(); await work;
    c.store.activeBattle = battle(); setBattleEffects("standard");
    c.player.play.mockRejectedValueOnce(new Error("renderer"));
    await c.lane.run(() => c.store.confirmSelectedAction()); expect(c.lane.busy.value).toBe(false);
  });
  it("inspection fast-forwards and subsequent actions stay live until it closes", async () => {
    const c = setup(); const first = c.lane.run(() => c.store.confirmSelectedAction()); await nextTick();
    const close = c.openInspection(); await first;
    expect(c.lane.busy.value).toBe(false);
    c.store.activeBattle = battle();
    await c.lane.run(() => c.store.confirmSelectedAction());
    expect(c.player.play).toHaveBeenCalledTimes(1);
    expect(c.lane.displayedBattle.value).toBe(c.store.activeBattle);
    close(); close(); c.store.activeBattle = battle();
    const next = c.lane.run(() => c.store.confirmSelectedAction()); await nextTick();
    expect(c.player.play).toHaveBeenCalledTimes(2);
    c.lane.skip(); await next;
  });
});

describe("recipes, preference and renderer bounds", () => {
  it.each(["absorb", "reflect", "mixed", "ordinary"])("routes real group %s textures to compatible result anchors", async scenario => {
    await loadEffectTextures();
    const before = battle();
    if (scenario === "mixed" || scenario === "ordinary") before.participants.push(...["e2", "e3"].map(id => ({ ...structuredClone(before.participants[1]!), id })));
    before.selectedActionId = "basic-skill"; before.selectedContentId = "37";
    const shield = (id: string, effectId: string) => {
      const target = before.participants.find(p => p.id === id)!;
      target.hp.current = 5000; target.statusEffects = [{ effectId, remainingDuration: 2, stacks: 1 }];
    };
    if (scenario === "absorb") shield("e", "fire_absorb");
    if (scenario === "reflect") shield("e", "fire_reflect");
    if (scenario === "mixed") { shield("e2", "fire_absorb"); shield("e3", "fire_reflect"); }
    const trace: BattleTraceCollector = {}; resolveSelectedBattleAction(before, trace);
    expect(trace.action?.contentId).toBe("37"); expect(impactBeats(trace.action!)).toHaveLength(1);
    const root = document.createElement("section");
    root.innerHTML = '<div class="battle-hud__party-row"><div data-participant-id="p"></div></div><div class="battle-hud__enemy-row"><div data-participant-id="e"></div><div data-participant-id="e2"></div><div data-participant-id="e3"></div></div>';
    const host = document.createElement("div"); root.append(host); document.body.append(root);
    const positions: Record<string, [number, number]> = { p: [100, 500], e: [200, 100], e2: [400, 100], e3: [600, 100] };
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function () {
      const position = positions[this.dataset.participantId ?? ""];
      const [x, y] = position ?? [0, 0]; const width = position ? 80 : 900; const height = position ? 80 : 700;
      return { x, y, left: x, top: y, right: x + width, bottom: y + height, width, height, toJSON() {} };
    });
    const marks: { mask: string; color: string; x: number; y: number; duration: number }[] = [];
    let maximum = 0;
    HTMLElement.prototype.animate = vi.fn(function (_frames, options) {
      maximum = Math.max(maximum, host.childElementCount);
      marks.push({ mask: this.style.maskImage, color: this.style.backgroundColor, x: parseFloat(this.style.left), y: parseFloat(this.style.top), duration: (options as KeyframeAnimationOptions).duration as number });
      return { finished: Promise.resolve(), playState: "finished", cancel() {} } as unknown as Animation;
    });
    const renderer = createBattleEffectsRenderer(host, root); const reveal = vi.fn();
    await renderer.play({ action: trace.action!, before, mode: "standard", reveal, feedback: vi.fn() });
    const impacts = marks.filter(mark => mark.duration === 300);
    const at = (id: string, texture: string, color: string) => expect(impacts).toContainEqual(expect.objectContaining({ mask: expect.stringContaining(texture), color, x: positions[id]![0] + 40, y: positions[id]![1] + 40 }));
    if (scenario === "absorb" || scenario === "mixed") at(scenario === "absorb" ? "e" : "e2", "magic_01", "rgb(86, 239, 189)");
    if (scenario === "reflect" || scenario === "mixed") { at(scenario === "reflect" ? "e" : "e3", "magic_01", "rgb(230, 199, 103)"); at("p", "flame_01", "rgb(255, 147, 111)"); }
    const flames = impacts.filter(mark => mark.mask.includes("flame_01"));
    expect(flames).toHaveLength(scenario === "absorb" ? 0 : scenario === "mixed" ? 2 : 1);
    if (scenario === "mixed") at("e", "flame_01", "rgb(255, 147, 111)");
    if (scenario === "ordinary") { at("e2", "flame_01", "rgb(255, 147, 111)"); expect(maximum).toBe(12); }
    expect(maximum).toBeLessThanOrEqual(MAX_EFFECT_ELEMENTS); expect(host.childElementCount).toBe(0); expect(reveal).toHaveBeenCalledTimes(1);
    renderer.dispose(); root.remove();
  });
  it("classifies five forms and keeps nominal damage out of HP-loss labels", () => {
    expect([effectFamily(attack), effectFamily({ ...attack, category: "magic", actionId: "basic-skill" }), effectFamily({ ...attack, targetType: "all_enemies" }), effectFamily({ ...attack, category: "heal" }), effectFamily({ ...attack, category: "support" })]).toEqual(["slash", "magic", "area", "heal", "support"]);
    expect(outcomeLabel(attack.outcomes[0]!)).toBe("命中");
    expect(outcomeLabel({ ...attack.outcomes[0]!, type: "absorb", hpDelta: 999 })).toBe("吸收");
    expect(normalizeBattleEffects("corrupt")).toBe("standard");
  });
  it("persists preference with reduced-motion ceiling and removes its media listener", () => {
    const media = { matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() };
    vi.mocked(window.matchMedia).mockReturnValue(media as unknown as MediaQueryList);
    let state!: ReturnType<typeof useBattleEffects>;
    const view = render(defineComponent({ setup() { state = useBattleEffects(); return () => h("div"); } }));
    expect(state.effectiveMode.value).toBe("reduced"); expect(state.preference.value).toBe("standard");
    setBattleEffects("off"); expect(localStorage.getItem("mg-battle-effects")).toBe("off");
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("denied"); });
    setBattleEffects("reduced"); expect(state.effectiveMode.value).toBe("reduced");
    view.unmount(); expect(media.removeEventListener).toHaveBeenCalledTimes(1);
  });
  it("bounds 15 hits and 50 actions, cancels stalled animations by deadline and releases all owned elements", async () => {
    vi.useFakeTimers(); await loadEffectTextures();
    const root = document.createElement("section"); root.innerHTML = '<div class="battle-hud__enemy-row"><div data-participant-id="e"></div></div><div class="battle-presentation-cue"></div>';
    const host = document.createElement("div"); root.append(host); document.body.append(root);
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({ x: 0, y: 0, left: 0, top: 0, right: 300, bottom: 300, width: 300, height: 300, toJSON() {} });
    let maximum = 0; let stall = false; let active = 0;
    HTMLElement.prototype.animate = vi.fn(function () {
      maximum = Math.max(maximum, host.childElementCount); active++;
      let finish = () => {};
      const animation = { playState: "running", finished: new Promise<void>(resolve => { finish = resolve; }), cancel() { this.playState = "idle"; finish(); } };
      if (!stall) queueMicrotask(finish);
      animation.finished.finally(() => active--);
      return animation as unknown as Animation;
    });
    const renderer = createBattleEffectsRenderer(host, root); const reveal = vi.fn();
    const many = { ...attack, outcomes: Array.from({ length: 15 }, () => attack.outcomes[0]!) };
    for (let i = 0; i < 50; i++) {
      await renderer.play({ action: many, before: battle(), mode: "standard", reveal, feedback: vi.fn() });
      expect(host.childElementCount).toBe(0); expect(active).toBe(0); expect(vi.getTimerCount()).toBe(0);
    }
    expect(maximum).toBeLessThanOrEqual(MAX_EFFECT_ELEMENTS); expect(reveal).toHaveBeenCalledTimes(50);
    stall = true; const work = renderer.play({ action: attack, before: battle(), mode: "standard", reveal, feedback: vi.fn() });
    await vi.advanceTimersByTimeAsync(3000); await work;
    expect(reveal).toHaveBeenCalledTimes(51); expect(active).toBe(0); expect(host.childElementCount).toBe(0);
    renderer.dispose(); root.remove();
  });
});
