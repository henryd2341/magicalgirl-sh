import { advanceEmptyPlayerPhase, resolveNextEnemyAction, resolveSelectedBattleAction } from "@/engine/battle/battleResolver";
import { clearBossProfilesForTests, registerBossProfile } from "@/engine/battle/boss/bossRegistry";
import { applyBossBattleEvent } from "@/engine/battle/boss/bossRuntime";
import { createEmptyBossRuntimeState } from "@/engine/battle/boss/bossTypes";
import { chaosDollProfile } from "@/engine/battle/boss/profiles/chaosDollProfile";
import { createPressTurnStateForSide } from "@/engine/battle/pressTurn";
import { useBattleStore } from "@/stores/battleStore";
import { BATTLE_ELEMENTS, type BattleParticipant, type BattleSnapshot } from "@/types/battle";
import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function snapshot(): BattleSnapshot {
  return {
    lifecycleState: "ACTIVE", phase: "PLAYER_COMMAND", source: "training/challenge",
    encounterId: "chaos-doll-icons", turnCount: 1, currentActorId: "hero",
    pressTurn: { ownerSide: "player", icons: [] },
    pressTurnAllocation: { participantIds: ["hero"], initialIconCount: 1 },
    participants: [
      {
        id: "doll", enemyId: "106", side: "enemy", displayName: "混乱玩偶",
        hp: { current: 8500, max: 8500 }, mp: { current: 999, max: 999 },
        isDown: false, isActive: true, agility: 10, attack: 20, statusEffects: [],
      },
      {
        id: "hero", side: "player", displayName: "主角",
        hp: { current: 50000, max: 50000 }, mp: { current: 100, max: 100 },
        isDown: false, isActive: true, agility: 10, defense: 20, statusEffects: [],
      },
    ],
    bossRuntime: {
      ...createEmptyBossRuntimeState(),
      profileIds: { doll: "chaos-doll" }, phaseByActorId: { doll: "integrity" },
    },
  };
}

describe("chaos doll phase-start Press Turn allocation", () => {
  beforeEach(() => {
    clearBossProfilesForTests();
    registerBossProfile(chaosDollProfile);
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    // Use an ordinary attack to isolate icon settlement from Boss skill selection.
    vi.spyOn(chaosDollProfile, "selectForcedIntent").mockReturnValue({
      type: "use_skill", actorId: "doll", skillId: "0", targetIds: ["hero"], reason: "icon settlement",
    });
  });
  afterEach(() => {
    vi.restoreAllMocks();
    clearBossProfilesForTests();
  });

  it.each([
    [1, 1, 1, 4], [0, 1, 1, 3], [1, 0, 1, 3], [1, 1, 0, 3],
    [1, 0, 0, 2], [0, 1, 0, 2], [0, 0, 1, 2], [0, 0, 0, 1],
  ])("allocates %s/%s/%s integrity as %s solid icons at enemy phase start", (blade, eye, core, count) => {
    const state = snapshot();
    state.bossRuntime!.mechanicState["doll:integrity"] = { blade, eye, core, extraPart: 1000 };
    state.bossRuntime!.mechanicState["doll:brokenPart"] = "blade";
    const next = advanceEmptyPlayerPhase(state);
    expect(next.phase).toBe("ENEMY_TURN");
    expect(next.pressTurn.icons).toHaveLength(count);
    expect(next.pressTurn.icons.every((icon) => icon.state === "solid")).toBe(true);
    expect(new Set(next.pressTurn.icons.map((icon) => icon.id)).size).toBe(count);
    expect(next.pressTurnAllocation).toEqual({ participantIds: ["doll"], initialIconCount: count });
    expect(next.currentActorId).toBe("doll");
  });

  it("uses initial integrity for missing legacy state and missing part fields", () => {
    const state = snapshot();
    expect(advanceEmptyPlayerPhase(state).pressTurn.icons).toHaveLength(4);
    expect(createPressTurnStateForSide(state.participants, "enemy").icons).toHaveLength(4);
    state.bossRuntime!.mechanicState["doll:integrity"] = { blade: 0 };
    expect(advanceEmptyPlayerPhase(state).pressTurn.icons).toHaveLength(3);
  });

  it.each<[string, Partial<BattleParticipant>]>([
    ["inactive", { isActive: false }],
    ["down", { isDown: true, hp: { current: 0, max: 8500 } }],
    ["cannot act", { canAct: false }],
    ["sleep", { statusEffects: [{ effectId: "sleep", remainingDuration: 2, stacks: 1 }] }],
    ["freeze", { statusEffects: [{ effectId: "freeze", remainingDuration: 2, stacks: 1 }] }],
  ])("grants no base or part icons when doll is %s", (_label, overrides) => {
    const state = snapshot();
    state.participants.push({ ...state.participants[0]!, id: "normal", enemyId: "unknown-normal" });
    Object.assign(state.participants[0]!, overrides);
    const next = advanceEmptyPlayerPhase(state);
    expect(next.pressTurn.icons).toHaveLength(1);
    expect(next.pressTurn.icons[0]!.id).toContain("normal");
    expect(next.pressTurnAllocation!.initialIconCount).toBe(1);
    expect(next.currentActorId).toBe("normal");
  });

  it("leaves ordinary enemies and player allocation unchanged", () => {
    const state = snapshot();
    state.participants[1]!.enemyId = "106";
    expect(createPressTurnStateForSide(state.participants, "player", state.bossRuntime).icons).toHaveLength(1);
    state.participants.push({ ...state.participants[0]!, id: "normal", enemyId: "unknown-normal" });
    const next = advanceEmptyPlayerPhase(state);
    expect(next.pressTurn.icons).toHaveLength(5);
    expect(next.pressTurnAllocation).toEqual({ participantIds: ["doll", "normal"], initialIconCount: 5 });
  });

  it("spends four ordinary actions before returning to the unchanged player budget", () => {
    let state = advanceEmptyPlayerPhase(snapshot());
    for (let remaining = 3; remaining >= 1; remaining--) {
      state = resolveNextEnemyAction(state);
      expect(state.phase).toBe("ENEMY_TURN");
      expect(state.pressTurn.icons).toHaveLength(remaining);
      expect(state.currentActorId).toBe("doll");
      expect(state.pressTurnAllocation!.initialIconCount).toBe(4);
    }
    state = resolveNextEnemyAction(state);
    expect(state.phase).toBe("PLAYER_COMMAND");
    expect(state.pressTurn.icons).toHaveLength(1);
    expect(state.battleLog!.filter((entry) => entry.actionId === "enemy_skill")).toHaveLength(4);
  });

  it.each(["miss", "critical", "weak"] as const)("retains ordinary %s settlement", (outcome) => {
    const state = advanceEmptyPlayerPhase(snapshot());
    if (outcome === "weak") state.participants[1]!.affinities = {
      weak: BATTLE_ELEMENTS.Physical, resist: 0, nullify: 0, reflect: 0, absorb: 0,
    };
    vi.mocked(Math.random).mockReturnValue(outcome === "miss" ? 0.999 : outcome === "critical" ? 0 : 0.5);
    const next = resolveNextEnemyAction(state);
    expect(next.pressTurn.icons.map((icon) => icon.state)).toEqual(outcome === "miss"
      ? ["solid", "solid"] : ["solid", "solid", "solid", "blinking"]);
    expect(next.pressTurnAllocation!.initialIconCount).toBe(4);
  });

  it("does not recalculate remaining icons after mid-phase part damage", () => {
    const state = snapshot();
    state.bossRuntime!.mechanicState["doll:integrity"] = { blade: 1, eye: 1, core: 1 };
    const spent = resolveNextEnemyAction(advanceEmptyPlayerPhase(state));
    const damaged = applyBossBattleEvent(spent, {
      type: "damage_applied", sourceId: "hero", targetId: "doll", amount: 1,
      element: BATTLE_ELEMENTS.Physical, actionCategory: "physical",
    });
    expect(damaged.bossRuntime!.mechanicState["doll:integrity"]).toEqual({ blade: 0, eye: 1, core: 1 });
    expect(damaged.pressTurn).toEqual(spent.pressTurn);
    expect(resolveNextEnemyAction(damaged).pressTurn.icons).toHaveLength(2);
  });

  it.each([1, 4])("preserves a saved phase's remaining blinking icon (original budget %s), then reallocates next phase", (initialIconCount) => {
    const state = advanceEmptyPlayerPhase(snapshot());
    state.pressTurn.icons = [{ id: "saved-half-turn", state: "blinking" }];
    state.pressTurnAllocation!.initialIconCount = initialIconCount;
    state.bossRuntime!.mechanicState["doll:integrity"] = { blade: 0, eye: 1, core: 1 };
    setActivePinia(createPinia());
    const store = useBattleStore();
    store.restoreBattleSnapshot({ activeBattle: JSON.parse(JSON.stringify(state)) });
    expect(store.activeBattle!.pressTurn).toEqual(state.pressTurn);
    expect(store.activeBattle!.pressTurnAllocation).toEqual(state.pressTurnAllocation);
    expect(store.activeBattle!.bossRuntime).toEqual(state.bossRuntime);
    store.resolveNextEnemyAction();
    expect(store.activeBattle!.phase).toBe("PLAYER_COMMAND");
    const next = resolveSelectedBattleAction({ ...store.activeBattle!, selectedActionId: "guard" });
    expect(next.phase).toBe("ENEMY_TURN");
    expect(next.pressTurn.icons).toHaveLength(3);
    expect(next.pressTurnAllocation).toEqual({ participantIds: ["doll"], initialIconCount: 3 });
  });
});
