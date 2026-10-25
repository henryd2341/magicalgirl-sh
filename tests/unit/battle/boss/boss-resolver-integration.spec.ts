import {
  clearBossProfilesForTests,
  registerBossProfile,
} from "@/engine/battle/boss/bossRegistry";
import {
  createBattleSnapshotFromPendingBattle,
  createEnemyBattleParticipant,
  createPendingBattleSnapshot,
} from "@/engine/battle/battleSetup";
import { resolveNextEnemyAction } from "@/engine/battle/battleResolver";
import { applyBossBattleEvent } from "@/engine/battle/boss/bossRuntime";
import { registerChallengeBossProfiles } from "@/engine/battle/boss/profiles/registerChallengeBossProfiles";
import { getStatusEffectMap } from "@/content/contentRegistry";
import type { BattleParticipant } from "@/types/battle";
import { beforeEach, describe, expect, it } from "vitest";

const player: BattleParticipant = {
  id: "player-1",
  side: "player",
  displayName: "Player",
  level: 10,
  hp: { current: 200, max: 200 },
  mp: { current: 100, max: 100 },
  attack: 20,
  defense: 10,
  agility: 10,
  intelligence: 10,
  isDown: false,
  isActive: true,
};

describe("Boss resolver integration", () => {
  beforeEach(() => {
    clearBossProfilesForTests();
  });

  it("copies enemy identity, initializes runtime, and resolves a forced skill", () => {
    registerBossProfile({
      id: "resolver-test",
      actorEnemyIds: ["boss-test"],
      initialPhase: "opening",
      skillIds: ["1"],
      reduceEvent: (_context, event) =>
        event.type === "before_enemy_action"
          ? [{ type: "append_mechanic_log", summary: "Boss开始行动" }]
          : [],
      selectForcedIntent: (context) => ({
        type: "use_skill",
        actorId: context.actorId!,
        skillId: "1",
        targetIds: ["player-1"],
        reason: "forced opener",
      }),
      enumerateUtilityCandidates: () => [],
    });

    const pending = createPendingBattleSnapshot({
      encounterId: "boss-integration",
      narrativeReason: "Boss test",
      source: "training/challenge",
      enemies: [{ enemy_id: "boss-test", count: 1 }],
    });
    const active = createBattleSnapshotFromPendingBattle({
      pendingBattle: pending,
      playerParty: [player],
    });

    expect(active.participants.find((entry) => entry.side === "enemy")?.enemyId)
      .toBe("boss-test");
    expect(active.bossRuntime).toMatchObject({
      profileIds: { "enemy-1": "resolver-test" },
      phaseByActorId: { "enemy-1": "opening" },
    });
    // The forced opener is a positive-MP skill; ordinary MP accounting still applies.
    active.participants.find((entry) => entry.side === "enemy")!.mp = { current: 4, max: 4 };

    const resolved = resolveNextEnemyAction({
      ...active,
      phase: "ENEMY_TURN",
      pressTurn: { ownerSide: "enemy", icons: [{ id: "e1", state: "solid" }] },
    });

    expect(resolved.battleLog).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "mechanic",
          summary: "Boss开始行动",
        }),
        expect.objectContaining({
          actionId: "enemy_skill",
          summary: expect.stringContaining("斩击"),
        }),
      ]),
    );
  });

  it("leaves normal encounters on the legacy utility path", () => {
    const pending = createPendingBattleSnapshot({
      encounterId: "normal-integration",
      narrativeReason: "normal test",
      source: "story",
      enemies: [{ enemy_id: "unknown-normal", count: 1 }],
    });
    const active = createBattleSnapshotFromPendingBattle({
      pendingBattle: pending,
      playerParty: [player],
    });

    expect(active.bossRuntime).toBeUndefined();
    const resolved = resolveNextEnemyAction({
      ...active,
      phase: "ENEMY_TURN",
      pressTurn: { ownerSide: "enemy", icons: [{ id: "e1", state: "solid" }] },
    });
    expect(resolved.battleLog?.some((entry) => entry.kind === "action")).toBe(true);
  });
  it("executes the shield commandment at the next enemy action", () => {
    registerChallengeBossProfiles();
    const pending = createPendingBattleSnapshot({
      encounterId: "hidden-shield-commandment",
      narrativeReason: "shield commandment",
      source: "training/challenge",
      enemies: [{ enemy_id: "107", count: 1 }, { enemy_id: "108", count: 1 }],
    });
    let active = createBattleSnapshotFromPendingBattle({ pendingBattle: pending, playerParty: [player] });
    active.participants = [player, ...pending.enemies.map(createEnemyBattleParticipant)];
    active = applyBossBattleEvent(active, {
      type: "status_applied",
      sourceId: player.id,
      targetId: player.id,
      effectId: "fire_reflect",
    });

    const resolved = resolveNextEnemyAction({
      ...active,
      phase: "ENEMY_TURN",
      pressTurn: { ownerSide: "enemy", icons: [{ id: "e1", state: "solid" }] },
    });

    expect(resolved).toMatchObject({ lifecycleState: "RESOLVED", phase: "RESULT", resultSummary: "失败" });
    expect(resolved.participants.filter(participant => participant.side === "player").every(participant => participant.hp.current === 0)).toBe(true);
    expect(resolved.battleLog?.some(entry => entry.summary.includes("镜壁戒律"))).toBe(true);
  });

  it.each([true, false])("executes queued 325 on the first living player after a different player's six-stage trigger (target buffed: %s)", (targetBuffed) => {
    registerChallengeBossProfiles();
    const statuses = [...getStatusEffectMap().values()];
    const effects = statuses.filter((effect) => effect.type === "shield" || (targetBuffed && effect.type === "buff"))
      .map((effect) => ({ effectId: effect.id, remainingDuration: effect.duration, stacks: effect.stackable ? 2 : 1 }));
    effects.push({ effectId: "attack_down", remainingDuration: 3, stacks: 1 });
    const first = { ...player, statusEffects: effects };
    const trigger = { ...player, id: "trigger-player", statusEffects: [
      { effectId: "attack_up", remainingDuration: 3, stacks: 2 },
      { effectId: "defense_up", remainingDuration: 3, stacks: 2 },
    ] };
    const pending = createPendingBattleSnapshot({
      encounterId: "hidden-dispel", narrativeReason: "six-stage dispel", source: "training/challenge",
      enemies: [{ enemy_id: "107", count: 1 }, { enemy_id: "108", count: 1 }],
    });
    let active = createBattleSnapshotFromPendingBattle({ pendingBattle: pending, playerParty: [first, trigger] });
    active = applyBossBattleEvent(active, {
      type: "status_applied", sourceId: trigger.id, targetId: trigger.id, effectId: "defense_up",
    });
    const earth = active.participants.find((entry) => entry.enemyId === "108")!;
    expect(active.bossRuntime?.queuedCounters[earth.id]).toBe("325");
    const resolved = resolveNextEnemyAction({
      ...active, phase: "ENEMY_TURN", currentActorId: earth.id,
      pressTurn: { ownerSide: "enemy", icons: [{ id: "e1", state: "solid" }, { id: "e2", state: "solid" }] },
      pressTurnAllocation: { participantIds: [earth.id], initialIconCount: 2 },
    });
    expect(resolved.bossRuntime?.queuedCounters[earth.id]).toBeNull();
    expect(resolved.participants.find((entry) => entry.id === first.id)?.statusEffects?.map((effect) => effect.effectId)).toEqual(
      effects.filter((effect) => getStatusEffectMap().get(effect.effectId)!.type !== "buff").map((effect) => effect.effectId),
    );
    expect(resolved.participants.find((entry) => entry.id === trigger.id)?.statusEffects).toEqual(trigger.statusEffects);
    expect(resolved.participants.find((entry) => entry.id === earth.id)?.mp).toEqual(earth.mp);
    expect(resolved.pressTurn.icons).toHaveLength(1);
    expect(resolved.phase).toBe("ENEMY_TURN");
    const actions = resolved.battleLog?.filter((entry) => entry.kind === "action");
    expect(actions).toHaveLength(1);
    expect(actions![0]!.summary).toContain("万象归土");
  });

  it("attributes Boss damage-over-time HP loss to the player's DPS windows", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    registerChallengeBossProfiles();
    const pending = createPendingBattleSnapshot({
      encounterId: "hidden-dot",
      narrativeReason: "dot attribution",
      source: "training/challenge",
      enemies: [{ enemy_id: "107", count: 1 }, { enemy_id: "108", count: 1 }],
    });
    let active = createBattleSnapshotFromPendingBattle({ pendingBattle: pending, playerParty: [player] });
    active.participants = [player, ...pending.enemies.map(createEnemyBattleParticipant)];
    const sun = active.participants.find(participant => participant.enemyId === "107")!;
    sun.statusEffects = [{ effectId: "poison", remainingDuration: 2, stacks: 1 }];
    active.participants = active.participants.map((participant) =>
      participant.side === "enemy" ? { ...participant, canAct: false } : participant,
    );
    active = {
      ...active,
      phase: "ENEMY_TURN",
      pressTurn: { ownerSide: "enemy", icons: [{ id: "e1", state: "solid" }] },
    };

    let resolved = active;
    for (let step = 0; step < 10 && resolved.phase === "ENEMY_TURN"; step += 1) {
      resolved = resolveNextEnemyAction(resolved);
    }
    const pair = resolved.bossRuntime?.mechanicState["hidden:pair"] as { bigWindowDamage: number };
    expect(pair.bigWindowDamage).toBeGreaterThan(0);
    vi.restoreAllMocks();
  });


  function resolveForcedHiddenSkill(
    skillId: string,
    configure?: (participants: BattleParticipant[]) => void,
  ) {
    registerBossProfile({
      id: `forced-hidden-${skillId}`,
      actorEnemyIds: ["107", "108"],
      initialPhase: "test",
      skillIds: [skillId],
      reduceEvent: () => [],
      selectForcedIntent: (context) => ({
        type: "use_skill",
        actorId: context.actorId!,
        skillId,
        targetIds: context.snapshot.participants
          .filter((participant) => participant.side === "enemy")
          .map((participant) => participant.id),
        reason: "resolver regression test",
      }),
      enumerateUtilityCandidates: () => [],
    });

    const pending = createPendingBattleSnapshot({
      encounterId: `forced-hidden-${skillId}`,
      narrativeReason: "enemy ally skill resolution",
      source: "training/challenge",
      enemies: [{ enemy_id: "107", count: 1 }, { enemy_id: "108", count: 1 }],
    });
    const active = createBattleSnapshotFromPendingBattle({
      pendingBattle: pending,
      playerParty: [player],
    });
    configure?.(active.participants);

    return resolveNextEnemyAction({
      ...active,
      phase: "ENEMY_TURN",
      pressTurn: { ownerSide: "enemy", icons: [{ id: "e1", state: "solid" }] },
    });
  }

  it("resolves enemy all_allies healing against every living ally", () => {
    const startingHp = new Map<string, number>();
    const resolved = resolveForcedHiddenSkill("321", (participants) => {
      for (const participant of participants.filter((entry) => entry.side === "enemy")) {
        participant.hp.current = Math.floor(participant.hp.max / 2);
        startingHp.set(participant.id, participant.hp.current);
      }
    });

    expect(resolved.participants.find((entry) => entry.side === "player")?.hp.current).toBe(200);
    for (const enemy of resolved.participants.filter((entry) => entry.side === "enemy")) {
      expect(enemy.hp.current).toBe(
        Math.min(enemy.hp.max, startingHp.get(enemy.id)! + Math.round(enemy.hp.max * 0.2)),
      );
    }
  });

  it("resolves enemy all_allies support effects against every living ally", () => {
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0);
    const resolved = resolveForcedHiddenSkill("320");

    expect(resolved.participants.find((entry) => entry.side === "player")?.hp.current).toBe(200);
    for (const enemy of resolved.participants.filter((entry) => entry.side === "enemy")) {
      expect(enemy.statusEffects).toEqual(
        expect.arrayContaining([expect.objectContaining({ effectId: "defense_up" })]),
      );
    }
    randomSpy.mockRestore();
  });

  it("resolves enemy all_allies cleansing for debuffs and ailments", () => {
    const resolved = resolveForcedHiddenSkill("322", (participants) => {
      for (const participant of participants.filter((entry) => entry.side === "enemy")) {
        participant.statusEffects = [
          { effectId: "attack_down", remainingDuration: 3, stacks: 1 },
          { effectId: "poison", remainingDuration: 3, stacks: 1 },
          { effectId: "attack_up", remainingDuration: 3, stacks: 1 },
        ];
      }
    });

    for (const enemy of resolved.participants.filter((entry) => entry.side === "enemy")) {
      expect(enemy.statusEffects?.map((effect) => effect.effectId)).toEqual(["attack_up"]);
    }
  });

});
