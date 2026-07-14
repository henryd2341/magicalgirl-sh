import {
  applyBossBattleEvent,
  applyBossEffects,
} from "@/engine/battle/boss/bossRuntime";
import {
  clearBossProfilesForTests,
  registerBossProfile,
} from "@/engine/battle/boss/bossRegistry";
import { createEmptyBossRuntimeState } from "@/engine/battle/boss/bossTypes";
import type { BattleSnapshot } from "@/types/battle";
import { beforeEach, describe, expect, it } from "vitest";

function snapshot(): BattleSnapshot {
  return {
    turnCount: 2,
    participants: [],
    battleLog: [],
    bossRuntime: {
      ...createEmptyBossRuntimeState(),
      profileIds: { "enemy-1": "runtime-test" },
      phaseByActorId: { "enemy-1": "phase-1" },
      cooldowns: { burst: 2 },
    },
  } as BattleSnapshot;
}

describe("bossRuntime", () => {
  beforeEach(() => {
    clearBossProfilesForTests();
  });

  it("reduces events, decrements cooldowns, and appends mechanism logs", () => {
    registerBossProfile({
      id: "runtime-test",
      actorEnemyIds: ["100"],
      initialPhase: "phase-1",
      skillIds: ["255"],
      reduceEvent: (_context, event) =>
        event.type === "round_started"
          ? [
              { type: "increment_counter", key: "rounds", amount: 1 },
              {
                type: "append_mechanic_log",
                summary: "阶段检测",
                details: ["回合开始"],
              },
            ]
          : [],
      selectForcedIntent: () => null,
      enumerateUtilityCandidates: () => [],
    });

    const next = applyBossBattleEvent(snapshot(), {
      type: "round_started",
      turnCount: 2,
    });

    expect(next.bossRuntime?.cooldowns.burst).toBe(1);
    expect(next.bossRuntime?.counters.rounds).toBe(1);
    expect(next.battleLog?.at(-1)).toMatchObject({
      kind: "mechanic",
      summary: "阶段检测",
    });
  });

  it("rejects a second phase transition for the same actor in one event", () => {
    expect(() =>
      applyBossEffects(snapshot(), [
        { type: "set_phase", actorId: "enemy-1", phase: "phase-2" },
        { type: "set_phase", actorId: "enemy-1", phase: "phase-3" },
      ]),
    ).toThrow(/phase transition/i);
  });
});
