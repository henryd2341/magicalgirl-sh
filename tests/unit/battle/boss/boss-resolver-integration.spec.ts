import {
  clearBossProfilesForTests,
  registerBossProfile,
} from "@/engine/battle/boss/bossRegistry";
import {
  createBattleSnapshotFromPendingBattle,
  createEnemyBattleParticipant,
  createPendingBattleSnapshot,
} from "@/engine/battle/battleSetup";
import { resolveEnemyTurn } from "@/engine/battle/battleResolver";
import { registerChallengeBossProfiles } from "@/engine/battle/boss/profiles/registerChallengeBossProfiles";
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

    const resolved = resolveEnemyTurn({
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
    const resolved = resolveEnemyTurn({
      ...active,
      phase: "ENEMY_TURN",
      pressTurn: { ownerSide: "enemy", icons: [{ id: "e1", state: "solid" }] },
    });
    expect(resolved.battleLog?.some((entry) => entry.kind === "action")).toBe(true);
  });
  it("attributes Boss damage-over-time HP loss to the player's DPS windows", () => {
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
    active = {
      ...active,
      phase: "ENEMY_TURN",
      pressTurn: { ownerSide: "enemy", icons: [{ id: "e1", state: "solid" }] },
    };

    const resolved = resolveEnemyTurn(active);
    const pair = resolved.bossRuntime?.mechanicState["hidden:pair"] as { bigWindowDamage: number };
    expect(pair.bigWindowDamage).toBeGreaterThan(0);
  });

});

