import { applyBossEffects } from "@/engine/battle/boss/bossRuntime";
import { getSkill } from "@/content/contentRegistry";
import { clearBossProfilesForTests, registerBossProfile } from "@/engine/battle/boss/bossRegistry";
import { chaosDollProfile } from "@/engine/battle/boss/profiles/chaosDollProfile";
import type { BossBattleEvent } from "@/engine/battle/boss/bossTypes";
import { refreshBattleStatus, resolveNextEnemyAction, resolveSelectedBattleAction } from "@/engine/battle/battleResolver";
import * as enemyUtility from "@/engine/battle/enemyUtility";
import { useBattleStore } from "@/stores/battleStore";
import type { BattleParticipant, BattleSnapshot } from "@/types/battle";
import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function member(id: string, side: "player" | "enemy"): BattleParticipant {
  return {
    id, side, displayName: id, isActive: true, isDown: false,
    hp: { current: 100, max: 100 }, mp: { current: 100, max: 100 },
    statusEffects: [],
  };
}

function fixture(): BattleSnapshot {
  return {
    lifecycleState: "ACTIVE", phase: "PLAYER_COMMAND", source: "story",
    encounterId: "independent-status-review", turnCount: 1,
    participants: [member("p", "player"), member("e", "enemy")],
    currentActorId: "p", selectedActionId: null, selectedTargetId: "e",
    pressTurn: { ownerSide: "player", icons: [{ id: "one", state: "solid" }] },
    pressTurnAllocation: { participantIds: ["p"], initialIconCount: 1 },
    bossRuntime: {
      profileIds: {}, phaseByActorId: {}, cooldowns: {}, queuedCounters: {},
      flags: {}, counters: {}, lists: {}, mechanicState: {}, decisionSteps: 0,
    },
  };
}

type DirectDeathBoundary = "before_enemy_action" | "round_ended" | "action_resolved";

function directDeathFixture(boundary: DirectDeathBoundary, targetId: string, revive = false) {
  const events: BossBattleEvent[] = [];
  registerBossProfile({
    id: "direct-death-probe", actorEnemyIds: [], initialPhase: "active", skillIds: [],
    reduceEvent(_context, event) {
      events.push(event);
      if (event.type === boundary) {
        return [{ type: "apply_status", actorId: targetId, effectId: "instant_death", duration: 1 }];
      }
      if (revive && event.type === "participant_down" && event.participantId === targetId) {
        return [{ type: "revive_actor", actorId: targetId, hpPercent: 50 }];
      }
      return [];
    },
    selectForcedIntent() { return { type: "pass", actorId: "e", reason: "review boundary" }; },
    enumerateUtilityCandidates() { return []; },
  });
  const snapshot = fixture();
  snapshot.bossRuntime!.profileIds.e = "direct-death-probe";
  if (boundary === "action_resolved") {
    snapshot.selectedActionId = "guard";
    snapshot.pressTurn.icons.push({ id: "two", state: "solid" });
    snapshot.pressTurnAllocation!.initialIconCount = 2;
  } else {
    snapshot.phase = "ENEMY_TURN";
    snapshot.currentActorId = "e";
    snapshot.pressTurn = {
      ownerSide: "enemy",
      icons: boundary === "round_ended" ? [] : [
        { id: "one", state: "solid" }, { id: "two", state: "solid" },
      ],
    };
    snapshot.pressTurnAllocation = { participantIds: ["e"], initialIconCount: 2 };
  }
  return {
    snapshot, events,
    resolve: () => boundary === "action_resolved"
      ? resolveSelectedBattleAction(snapshot)
      : resolveNextEnemyAction(snapshot),
  };
}

beforeEach(() => {
  setActivePinia(createPinia());
  vi.spyOn(Math, "random").mockReturnValue(0.75);
});
afterEach(() => {
  vi.restoreAllMocks();
  clearBossProfilesForTests();
});

describe("independent combat contract regressions", () => {
  it("direct effect bundles spend one ailment shield and block every harmful payload", () => {
    const snapshot = fixture();
    snapshot.participants[0]!.statusEffects = [
      { effectId: "ailment_null", remainingDuration: 1, stacks: 1 },
    ];
    const next = applyBossEffects(snapshot, [
      { type: "apply_status", actorId: "p", effectId: "poison", duration: 3 },
      { type: "apply_status", actorId: "p", effectId: "burn", duration: 3 },
      { type: "apply_status", actorId: "p", effectId: "attack_down", duration: 3 },
    ]);
    expect(next.participants[0]!.statusEffects?.map((effect) => effect.effectId)).toEqual(["attack_down"]);
  });

  it("reapplying direct paralysis in one phase preserves its already saved roll", () => {
    const effect = { type: "apply_status" as const, actorId: "p", effectId: "paralyze", duration: 3 };
    const first = applyBossEffects(fixture(), [effect]);
    expect(first.participants[0]!.canAct).toBe(true);
    expect(Math.random).toHaveBeenCalledTimes(1);
    vi.mocked(Math.random).mockReturnValue(0);
    const second = applyBossEffects(first, [effect]);
    expect(second.participants[0]!.canAct).toBe(true);
    expect(Math.random).toHaveBeenCalledTimes(1);
  });

  it("legacy all-controlled player snapshots resume into an advancing phase", () => {
    const snapshot = fixture();
    snapshot.participants[0]!.canAct = false;
    snapshot.participants[0]!.statusEffects = [
      { effectId: "freeze", remainingDuration: 1, stacks: 1 },
    ];
    const store = useBattleStore();
    store.restoreBattleSnapshot({ activeBattle: snapshot });
    expect(store.activeBattle!.phase).toBe("ENEMY_TURN");
    expect(store.activeBattle!.pressTurn.ownerSide).toBe("enemy");
    expect(store.activeBattle!.pressTurn.icons).toHaveLength(1);
    expect(store.activeBattle!.pressTurnAllocation).toEqual({ participantIds: ["e"], initialIconCount: 1 });
    expect(store.activeBattle!.participants[0]!.statusEffects).toEqual(
      expect.arrayContaining([expect.objectContaining({ effectId: "freeze", remainingDuration: 1 })]),
    );
    store.activeBattle!.pressTurn.icons = [];
    store.resolveNextEnemyAction();
    expect(store.activeBattle!.phase).toBe("ENEMY_TURN");
    expect(store.activeBattle!.turnCount).toBe(2);
    expect(store.activeBattle!.pressTurn.ownerSide).toBe("enemy");
    expect(store.activeBattle!.pressTurn.icons).toHaveLength(1);
    expect(store.activeBattle!.participants[0]!.statusEffects).toEqual([]);
    expect(store.activeBattle!.participants[0]!.canAct).toBe(true);
  });

  it("a status-disabled revived participant retains their original action eligibility", () => {
    const snapshot = fixture();
    snapshot.participants[0]!.statusEffects = [
      { effectId: "sleep", remainingDuration: 3, stacks: 1 },
    ];
    const first = refreshBattleStatus(snapshot);
    expect(first.participants[0]!.canAct).toBe(false);
    const next = applyBossEffects(first, [
      { type: "revive_actor", actorId: "p", hpPercent: 50 },
    ]);
    expect(refreshBattleStatus(next).participants[0]!.canAct).toBe(false);
  });

  it("a cleansed actor receives only remaining shared icons, including a legacy omitted queue member", () => {
    const snapshot = fixture();
    const sleeper = member("sleeper", "player");
    sleeper.canAct = false;
    sleeper.statusEffects = [{ effectId: "sleep", remainingDuration: 3, stacks: 1 }];
    snapshot.participants.unshift(sleeper);
    snapshot.pressTurn.icons.push({ id: "two", state: "solid" });
    snapshot.pressTurnAllocation!.initialIconCount = 2;
    const next = resolveSelectedBattleAction({
      ...snapshot, selectedActionId: "basic-item", selectedContentId: "17", selectedTargetId: "sleeper",
    });
    expect(next.currentActorId).toBe("sleeper");
    expect(next.pressTurn.icons).toHaveLength(1);
    expect(next.pressTurnAllocation!.initialIconCount).toBe(2);
  });

  it("a cleansed enemy rejoins a legacy phase queue without new action icons", () => {
    const snapshot = fixture();
    const sleeper = member("e2", "enemy");
    sleeper.canAct = false;
    sleeper.statusEffects = [{ effectId: "sleep", remainingDuration: 3, stacks: 1 }];
    snapshot.participants.push(sleeper);
    snapshot.phase = "ENEMY_TURN";
    snapshot.currentActorId = "e";
    snapshot.pressTurn = {
      ownerSide: "enemy", icons: [{ id: "one", state: "solid" }, { id: "two", state: "solid" }],
    };
    snapshot.pressTurnAllocation = { participantIds: ["e"], initialIconCount: 2 };
    vi.spyOn(enemyUtility, "selectEnemyAction").mockImplementation((actor) => ({
      action: enemyUtility.buildEnemySkillAction("322")!, target: actor, score: 1,
    }));
    const store = useBattleStore();
    store.restoreBattleSnapshot({ activeBattle: snapshot });
    store.resolveNextEnemyAction();
    expect(store.activeBattle!.participants.find((participant) => participant.id === "e2")!.canAct).toBe(true);
    expect(store.activeBattle!.currentActorId).toBe("e2");
    expect(store.activeBattle!.pressTurn.icons).toHaveLength(1);
    expect(store.activeBattle!.pressTurnAllocation!.initialIconCount).toBe(2);
  });

  it("lethal reflected enemy damage reaches Endure and actual-damage Boss bookkeeping once", () => {
    registerBossProfile(chaosDollProfile);
    const snapshot = fixture();
    const enemy = snapshot.participants[1]!;
    enemy.enemyId = "106";
    enemy.hp.current = 10;
    enemy.passiveEffects = getSkill("160").passiveEffects;
    snapshot.participants[0]!.statusEffects = [
      { effectId: "fire_reflect", remainingDuration: 1, stacks: 1 },
    ];
    snapshot.phase = "ENEMY_TURN";
    snapshot.currentActorId = "e";
    snapshot.pressTurn = { ownerSide: "enemy", icons: [{ id: "one", state: "solid" }] };
    snapshot.pressTurnAllocation = { participantIds: ["e"], initialIconCount: 1 };
    snapshot.bossRuntime!.profileIds.e = "chaos-doll";
    snapshot.bossRuntime!.phaseByActorId.e = "integrity";
    snapshot.bossRuntime!.queuedCounters.e = "306";
    const next = resolveNextEnemyAction(snapshot);
    expect(next.participants[0]!.hp.current).toBe(100);
    expect(next.participants[1]!).toMatchObject({ hp: { current: 1 }, endureUsed: true, isDown: false });
    expect(next.bossRuntime!.mechanicState["doll:integrity"]).toMatchObject({ blade: 910 });
  });

  it("legacy delayed death emits one down event before victory, including after JSON resume", () => {
    const events: BossBattleEvent[] = [];
    registerBossProfile({
      id: "status-event-probe", actorEnemyIds: [], initialPhase: "active", skillIds: [],
      reduceEvent(_context, event) { events.push(event); return []; },
      selectForcedIntent() { return null; },
      enumerateUtilityCandidates() { return []; },
    });
    const snapshot = fixture();
    snapshot.bossRuntime!.profileIds.e = "status-event-probe";
    snapshot.participants[1]!.statusEffects = [
      { effectId: "instant_death", remainingDuration: 1, stacks: 1 },
    ];
    snapshot.phase = "ENEMY_TURN";
    snapshot.pressTurn = { ownerSide: "enemy", icons: [] };
    snapshot.pressTurnAllocation = { participantIds: ["e"], initialIconCount: 1 };
    const next = resolveNextEnemyAction(JSON.parse(JSON.stringify(snapshot)) as BattleSnapshot);
    expect(next.battleResult!.outcome).toBe("victory");
    expect(events.filter((event) => event.type === "participant_down")).toEqual([
      { type: "participant_down", participantId: "e" },
    ]);
  });

  describe.each(["before_enemy_action", "round_ended", "action_resolved"] as const)(
    "direct instant death at the %s resolver boundary",
    (boundary) => {
      it.each(["p", "e"])("settles the last %s death and one down event in the same resolver call", (targetId) => {
        const probe = directDeathFixture(boundary, targetId);
        const next = probe.resolve();
        expect(next.participants.find((participant) => participant.id === targetId)!).toMatchObject({
          hp: { current: 0 }, isDown: true,
        });
        expect(probe.events.filter((event) => event.type === "participant_down")).toEqual([
          { type: "participant_down", participantId: targetId },
        ]);
        expect(next.phase).toBe("RESULT");
        expect(next.lifecycleState).toBe("RESOLVED");
        expect(next.battleResult!.outcome).toBe(targetId === "p" ? "defeat" : "victory");
      });

      it("honors a down-event revival before terminal-state settlement", () => {
        const probe = directDeathFixture(boundary, "e", true);
        const next = probe.resolve();
        expect(probe.events.filter((event) => event.type === "participant_down")).toEqual([
          { type: "participant_down", participantId: "e" },
        ]);
        expect(next.participants.find((participant) => participant.id === "e")!).toMatchObject({
          hp: { current: 50 }, isDown: false,
        });
        expect(next.lifecycleState).toBe("ACTIVE");
        expect(next.phase).not.toBe("RESULT");
        expect(next.battleResult).toBeUndefined();
      });
    },
  );

  it.each(["endure", "shield"] as const)("direct death stopped by %s emits no false down event", (protection) => {
    const probe = directDeathFixture("before_enemy_action", "p");
    const player = probe.snapshot.participants[0]!;
    if (protection === "endure") {
      player.passiveEffects = getSkill("160").passiveEffects;
    } else {
      player.statusEffects = [{ effectId: "ailment_null", remainingDuration: 1, stacks: 1 }];
    }
    const next = probe.resolve();
    expect(probe.events.filter((event) => event.type === "participant_down")).toEqual([]);
    expect(next.participants[0]!.hp.current).toBe(protection === "endure" ? 1 : 100);
    expect(next.participants[0]!.isDown).toBe(false);
    expect(next.participants[0]!.statusEffects).toEqual([]);
    if (protection === "endure") expect(next.participants[0]!.endureUsed).toBe(true);
    expect(next.lifecycleState).toBe("ACTIVE");
    expect(next.phase).not.toBe("RESULT");
    expect(next.battleResult).toBeUndefined();
  });
});
