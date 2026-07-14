import {
  MAX_BOSS_DECISION_STEPS,
  selectBossActionIntent,
} from "@/engine/battle/boss/bossOrchestrator";
import {
  clearBossProfilesForTests,
  registerBossProfile,
  type BossProfile,
} from "@/engine/battle/boss/bossRegistry";
import { createEmptyBossRuntimeState } from "@/engine/battle/boss/bossTypes";
import type { BattleSnapshot } from "@/types/battle";
import { beforeEach, describe, expect, it } from "vitest";

function createSnapshot(): BattleSnapshot {
  return {
    participants: [
      {
        id: "enemy-1",
        enemyId: "100",
        side: "enemy",
        displayName: "Boss",
        hp: { current: 100, max: 100 },
        mp: { current: 100, max: 100 },
        isDown: false,
        isActive: true,
      },
      {
        id: "player-1",
        side: "player",
        displayName: "Player",
        hp: { current: 100, max: 100 },
        mp: { current: 50, max: 50 },
        isDown: false,
        isActive: true,
      },
    ],
    bossRuntime: {
      ...createEmptyBossRuntimeState(),
      profileIds: { "enemy-1": "priority-test" },
      phaseByActorId: { "enemy-1": "phase-1" },
      queuedCounters: { "enemy-1": "256" },
    },
  } as BattleSnapshot;
}

function createProfile(
  priorityIntent: BossProfile["selectPriorityIntent"],
): BossProfile {
  return {
    id: "priority-test",
    actorEnemyIds: ["100"],
    initialPhase: "phase-1",
    skillIds: ["255", "256", "257"],
    reduceEvent: () => [],
    selectPriorityIntent: priorityIntent,
    selectForcedIntent: () => ({
      type: "use_skill",
      actorId: "enemy-1",
      skillId: "257",
      targetIds: ["player-1"],
      reason: "profile tree",
    }),
    enumerateUtilityCandidates: () => [
      {
        intent: {
          type: "use_skill",
          actorId: "enemy-1",
          skillId: "255",
          targetIds: ["player-1"],
          reason: "utility",
        },
        available: true,
        score: 1,
        noise: 0,
        stableOrder: 1,
      },
    ],
  };
}

describe("bossOrchestrator", () => {
  beforeEach(() => {
    clearBossProfilesForTests();
  });

  it("uses hard defeat before revival, counters, profile tree, and utility", () => {
    registerBossProfile(
      createProfile((_context, priority) => {
        if (priority === "hard_defeat") {
          return {
            type: "force_defeat",
            skillId: "999",
            reason: "DPS deadline expired",
          };
        }
        if (priority === "revival") {
          return {
            type: "use_skill",
            actorId: "enemy-1",
            skillId: "258",
            targetIds: ["enemy-2"],
            reason: "revival",
          };
        }
        return null;
      }),
    );

    expect(
      selectBossActionIntent(createSnapshot(), "enemy-1", () => 0),
    ).toMatchObject({ type: "force_defeat", skillId: "999" });
  });

  it("uses a queued counter before profile tree and consumes no legacy enemy", () => {
    registerBossProfile(createProfile(() => null));

    expect(
      selectBossActionIntent(createSnapshot(), "enemy-1", () => 0),
    ).toMatchObject({
      type: "use_skill",
      skillId: "256",
      reason: "queued counter",
    });

    const normal = createSnapshot();
    normal.bossRuntime = undefined;
    expect(selectBossActionIntent(normal, "enemy-1", () => 0)).toBeNull();
  });

  it("defines a bounded decision loop", () => {
    expect(MAX_BOSS_DECISION_STEPS).toBe(32);
  });
});
