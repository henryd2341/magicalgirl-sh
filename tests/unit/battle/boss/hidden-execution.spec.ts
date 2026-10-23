import { getSkill } from "@/content/contentRegistry";
import { resolveNextEnemyAction } from "@/engine/battle/battleResolver";
import { selectBossActionIntent } from "@/engine/battle/boss/bossOrchestrator";
import { clearBossProfilesForTests, registerBossProfile } from "@/engine/battle/boss/bossRegistry";
import { applyBossBattleEvent } from "@/engine/battle/boss/bossRuntime";
import { createEmptyBossRuntimeState, type BossBattleEvent, type HiddenExecutionFailure } from "@/engine/battle/boss/bossTypes";
import { chaosDollProfile } from "@/engine/battle/boss/profiles/chaosDollProfile";
import { hiddenMagicalGirlsProfile, type HiddenPairState } from "@/engine/battle/boss/profiles/hiddenMagicalGirlsProfile";
import { validateBossRuntimeSnapshot } from "@/engine/runtimePersistenceService";
import { useBattleStore } from "@/stores/battleStore";
import { BATTLE_ELEMENTS, type BattleParticipant, type BattleSnapshot } from "@/types/battle";
import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const causes = [
  ["shield_commandment", "hidden:shieldCommandmentFailed", "317"],
  ["big_dps", "hidden:bigDpsFailed", "317"],
  ["final_countdown", "hidden:finalFailed", "316"],
] as const;

function player(id: string, extra: Partial<BattleParticipant> = {}): BattleParticipant {
  return {
    id, side: "player", displayName: id, level: 10,
    hp: { current: 100, max: 100 }, mp: { current: 100, max: 100 },
    attack: 10, defense: 10, agility: 10, intelligence: 10,
    isActive: true, isDown: false, statusEffects: [],
    passiveEffects: getSkill("160").passiveEffects, ...extra,
  };
}

function battle(players = [player("hero")]): BattleSnapshot {
  return {
    lifecycleState: "ACTIVE", phase: "ENEMY_TURN", encounterId: "execution", source: "story", turnCount: 1,
    currentActorId: "sun", selectedActionId: null, selectedTargetId: null,
    participants: [...players, ...["107", "108"].map((enemyId, i) => ({
      ...player(i === 0 ? "sun" : "earth"), enemyId, side: "enemy" as const,
      passiveEffects: [], hp: { current: 1000, max: 1000 },
    }))],
    pressTurn: { ownerSide: "enemy", icons: [1, 2, 3, 4].map((id) => ({ id: String(id), state: "solid" })) },
    pressTurnAllocation: { participantIds: ["sun", "earth"], initialIconCount: 4 },
    bossRuntime: {
      ...createEmptyBossRuntimeState(),
      profileIds: { sun: hiddenMagicalGirlsProfile.id, earth: hiddenMagicalGirlsProfile.id },
      phaseByActorId: { sun: "trial", earth: "trial" },
      queuedCounters: { sun: null, earth: null },
      mechanicState: { "hidden:pair": {
        phase: "trial", confluenceRounds: 0, bigWindowStartRound: 1, bigWindowDamage: 0,
        smallWindow: null, crisisEntered: { "107": false, "108": false },
        finalPlayerRoundsRemaining: null, reviveTargetActorId: null, ailmentSuccesses: {},
      } satisfies HiddenPairState },
    },
  };
}
function get(state: BattleSnapshot, id: string) { return state.participants.find((p) => p.id === id)!; }
function pair(state: BattleSnapshot) { return state.bossRuntime!.mechanicState["hidden:pair"] as HiddenPairState; }
function pending(state: BattleSnapshot, cause: HiddenExecutionFailure): BattleSnapshot {
  state.bossRuntime!.flags[causes.find(([name]) => name === cause)![1]] = true;
  if (cause === "final_countdown") pair(state).finalPlayerRoundsRemaining = 0;
  return state;
}
function restore(state: BattleSnapshot): BattleSnapshot {
  const json = JSON.parse(JSON.stringify(state)) as BattleSnapshot;
  expect(validateBossRuntimeSnapshot(json)).toBe(true);
  const store = useBattleStore();
  store.restoreBattleSnapshot({ activeBattle: json });
  return store.activeBattle!;
}

beforeEach(() => {
  setActivePinia(createPinia());
  clearBossProfilesForTests();
  registerBossProfile(hiddenMagicalGirlsProfile);
  registerBossProfile(chaosDollProfile);
  vi.spyOn(Math, "random").mockReturnValue(0.5);
});
afterEach(() => { vi.restoreAllMocks(); clearBossProfilesForTests(); });

describe("hidden one-shot execution", () => {
  it.each(causes)("settles %s through Endure for all living players including reserves and spends one action", (cause, flag, skillId) => {
    const eventSpy = vi.spyOn(hiddenMagicalGirlsProfile, "reduceEvent");
    const state = pending(battle([
      player("hero", { statusEffects: [{ effectId: "element_null", remainingDuration: 1, stacks: 1 }] }),
      player("spent", { endureUsed: true }), player("absent", { passiveEffects: [] }),
      player("down", { hp: { current: 0, max: 100 }, isDown: true }),
      player("reserve", { isActive: false }), player("reserveAbsent", { isActive: false, passiveEffects: [] }),
    ]), cause);
    const next = resolveNextEnemyAction(state);
    for (const id of ["hero", "reserve"]) expect(get(next, id)).toMatchObject({ hp: { current: 1 }, isDown: false, endureUsed: true });
    for (const id of ["spent", "absent", "down", "reserveAbsent"]) expect(get(next, id)).toMatchObject({ hp: { current: 0 }, isDown: true });
    expect(get(next, "down").endureUsed).not.toBe(true);
    expect(get(next, "hero").statusEffects).toContainEqual(expect.objectContaining({ effectId: "element_null" }));
    expect(next.bossRuntime!.flags[flag]).toBe(false);
    expect(state.bossRuntime!.flags[flag]).toBe(true);
    expect(next).toMatchObject({ phase: "ENEMY_TURN", currentActorId: "earth", lifecycleState: "ACTIVE" });
    expect(next.battleResult).toBeUndefined();
    expect(next.pressTurn.icons).toHaveLength(3);
    expect(next.pressTurn.icons.every((icon) => icon.state === "solid")).toBe(true);
    const events = eventSpy.mock.calls.map(([, event]) => event);
    expect(events.filter((event) => event.type === "hidden_execution_resolved")).toEqual([{ type: "hidden_execution_resolved", failure: cause }]);
    expect(events.filter((event) => event.type === "action_resolved")).toEqual([
      { type: "action_resolved", actorId: "sun", actionId: skillId, targetIds: ["hero", "spent", "absent", "reserve", "reserveAbsent"] },
    ]);
    expect(events.filter((event) => event.type === "participant_down").map((event) => event.participantId))
      .toEqual(["spent", "absent", "reserveAbsent"]);
    expect(events.filter((event) => event.type === "damage_applied").map((event) => [event.targetId, event.amount]))
      .toEqual([["hero", 99], ["spent", 100], ["absent", 100], ["reserve", 99], ["reserveAbsent", 100]]);
    expect(next.battleLog?.filter((entry) => entry.kind === "action")).toHaveLength(1);
    expect(next.battleLog?.[0]?.summary).toContain("498");
    expect(next.battleLog?.some((entry) => entry.summary.includes("双重击破"))).toBe(false);
    expect(pair(next).reviveTargetActorId).toBeNull();
    expect(selectBossActionIntent(next, "earth", () => 0.5)?.type).not.toBe("execute_players");
  });

  it.each(causes)("%s defeats a party without unused Endure", (cause) => {
    const next = resolveNextEnemyAction(pending(battle([player("spent", { endureUsed: true }), player("absent", { passiveEffects: [] })]), cause));
    expect(next).toMatchObject({ phase: "RESULT", battleResult: { outcome: "defeat", endReason: "all_players_down" } });
  });

  it("continues the next enemy's queued ordinary attack without a rescue turn or Endure refresh", () => {
    const state = pending(battle(), "shield_commandment");
    state.bossRuntime!.queuedCounters.earth = "316";
    const first = resolveNextEnemyAction(state);
    expect(first.currentActorId).toBe("earth");
    const next = resolveNextEnemyAction(first);
    expect(get(next, "hero")).toMatchObject({ hp: { current: 0 }, isDown: true, endureUsed: true });
    expect(next.battleResult?.outcome).toBe("defeat");
    expect(next.bossRuntime!.queuedCounters.earth).toBeNull();
    expect(next.battleLog?.filter((entry) => entry.kind === "action")).toHaveLength(2);
  });

  it("acknowledges only the selected pending failure, keeping shield -> DPS -> final priority", () => {
    let state = battle();
    for (const [cause] of causes) state = pending(state, cause);
    state = resolveNextEnemyAction(state);
    expect(state.bossRuntime!.flags).toMatchObject({
      "hidden:shieldCommandmentFailed": false, "hidden:bigDpsFailed": true, "hidden:finalFailed": true,
    });
    expect(selectBossActionIntent(state, "earth", () => 0.5)).toMatchObject({ type: "execute_players", failure: "big_dps" });
    state = resolveNextEnemyAction(state);
    expect(state.bossRuntime!.flags).toMatchObject({ "hidden:bigDpsFailed": false, "hidden:finalFailed": true });
    expect(selectBossActionIntent(state, "sun", () => 0.5)).toMatchObject({ type: "execute_players", failure: "final_countdown" });
  });

  it.each(["shield_commandment", "big_dps"] as const)("a genuinely new %s failure rearms, without granting a second Endure", (cause) => {
    let state = resolveNextEnemyAction(pending(battle(), cause));
    const trigger: BossBattleEvent = cause === "shield_commandment"
      ? { type: "status_applied", sourceId: "hero", targetId: "hero", effectId: "fire_null" }
      : { type: "round_ended", turnCount: 16 };
    state = applyBossBattleEvent(state, trigger);
    expect(selectBossActionIntent(state, "earth", () => 0.5)).toMatchObject({ type: "execute_players", failure: cause });
    if (cause === "big_dps") expect(pair(state)).toMatchObject({ bigWindowStartRound: 17, bigWindowDamage: 0 });
    expect(resolveNextEnemyAction(state).battleResult?.outcome).toBe("defeat");
  });

  it("expired final countdown stays consumed through later rounds, damage and save/restore", () => {
    let state = battle();
    pair(state).phase = "horizon";
    pair(state).crisisEntered = { "107": true, "108": true };
    pair(state).finalPlayerRoundsRemaining = 1;
    state = applyBossBattleEvent(state, { type: "round_ended", turnCount: 1 });
    state = restore(state);
    expect(state.bossRuntime!.flags["hidden:finalFailed"]).toBe(true);
    state = restore(resolveNextEnemyAction(state));
    expect(get(state, "hero").endureUsed).toBe(true);
    expect(pair(state).finalPlayerRoundsRemaining).toBe(0);
    for (const turnCount of [2, 3, 4]) state = applyBossBattleEvent(state, { type: "round_ended", turnCount });
    state = applyBossBattleEvent(state, { type: "damage_applied", sourceId: "hero", targetId: "sun", amount: 1, element: BATTLE_ELEMENTS.Fire });
    expect(pair(state).finalPlayerRoundsRemaining).toBe(0);
    expect(state.bossRuntime!.flags["hidden:finalFailed"]).toBe(false);
    expect(selectBossActionIntent(state, "earth", () => 0.5)?.type).not.toBe("execute_players");
  });

  it.each(causes)("old pending %s snapshots execute once and consumed state round-trips without replay", (cause, flag) => {
    let state = restore(pending(battle(), cause));
    const eventSpy = vi.spyOn(hiddenMagicalGirlsProfile, "reduceEvent");
    state = restore(resolveNextEnemyAction(state));
    expect(state.bossRuntime!.flags[flag]).toBe(false);
    expect(get(state, "hero")).toMatchObject({ hp: { current: 1 }, endureUsed: true });
    expect(state.currentActorId).toBe("earth");
    expect(state.pressTurn.icons).toHaveLength(3);
    state.bossRuntime!.queuedCounters.earth = "316";
    state = resolveNextEnemyAction(state);
    expect(state.battleResult?.outcome).toBe("defeat");
    expect(eventSpy.mock.calls.filter(([, event]) => event.type === "hidden_execution_resolved")).toHaveLength(1);
  });

  it("ordinary 316 does not consume a final execution flag", () => {
    const state = pending(battle(), "final_countdown");
    const next = applyBossBattleEvent(state, { type: "action_resolved", actorId: "sun", actionId: "316", targetIds: ["hero"] });
    expect(next.bossRuntime!.flags["hidden:finalFailed"]).toBe(true);
  });

  it("player deaths do not change the pair's pending revival or emit a double-defeat log", () => {
    const state = battle();
    get(state, "sun").isDown = true;
    get(state, "sun").hp.current = 0;
    pair(state).reviveTargetActorId = "sun";
    const next = applyBossBattleEvent(state, { type: "participant_down", participantId: "hero" });
    expect(pair(next).reviveTargetActorId).toBe("sun");
    expect(next.battleLog).toBeUndefined();
  });

  it("chaos doll retains hard defeat despite unused Endure in active and reserve players", () => {
    const state = battle([player("hero"), player("reserve", { isActive: false })]);
    state.participants = state.participants.filter((p) => p.id !== "earth");
    get(state, "sun").enemyId = "106";
    state.pressTurnAllocation!.participantIds = ["sun"];
    state.bossRuntime = {
      ...createEmptyBossRuntimeState(), profileIds: { sun: chaosDollProfile.id },
      phaseByActorId: { sun: "collapse" }, counters: { "doll:finalRounds": 0 },
    };
    const next = resolveNextEnemyAction(state);
    expect(next.battleResult?.outcome).toBe("defeat");
    for (const id of ["hero", "reserve"]) {
      expect(get(next, id)).toMatchObject({ hp: { current: 0 }, isDown: true });
      expect(get(next, id).endureUsed).not.toBe(true);
    }
  });
});
