import {
  applyBossBattleEvent,
  applyBossEffects,
  deriveBossSignals,
} from "@/engine/battle/boss/bossRuntime";
import {
  clearBossProfilesForTests,
  registerBossProfile,
} from "@/engine/battle/boss/bossRegistry";
import { createEmptyBossRuntimeState } from "@/engine/battle/boss/bossTypes";
import type { BattleSnapshot } from "@/types/battle";
import { beforeEach, describe, expect, it } from "vitest";
import { reactive } from "vue";

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

  it("clones reactive Boss runtime state without throwing DataCloneError", () => {
    const reactiveSnapshot = reactive(snapshot()) as BattleSnapshot;
    reactiveSnapshot.bossRuntime!.mechanicState.nested = {
      values: [1, { active: true }],
    };

    const next = applyBossEffects(reactiveSnapshot, [
      { type: "set_counter", key: "actions", value: 1 },
    ]);

    expect(next.bossRuntime?.counters.actions).toBe(1);
    expect(next.bossRuntime?.mechanicState.nested).toEqual({
      values: [1, { active: true }],
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
  it("derives only active public signals from Boss runtime state", () => {
    const current = snapshot();
    current.turnCount = 7;
    current.participants = [{ id: "enemy-1", displayName: "Boss" } as never];
    current.bossRuntime!.queuedCounters["enemy-1"] = "317";
    current.bossRuntime!.mechanicState["hidden:pair"] = {
      bigWindowStartRound: 1,
      bigWindowDamage: 1450,
      smallWindow: null,
      reviveTargetActorId: "enemy-2",
      finalPlayerRoundsRemaining: 4,
    };

    expect(deriveBossSignals(current)).toEqual(expect.arrayContaining([
      { id: "boss:phase", label: "当前阶段", value: "phase-1", urgency: "normal" },
      { id: "boss:counter:enemy-1", label: "Boss反制", value: "技能 317 已就绪", urgency: "warning" },
      { id: "hidden:big-dps", label: "大 DPS 检定", value: "1450 / 2000 · 剩余 1 回合", urgency: "danger" },
      { id: "hidden:revive", label: "复苏脉动", value: "下一实际行动", urgency: "danger" },
      { id: "hidden:final", label: "终景倒计时", value: "4 回合", urgency: "danger" },
    ]));
  });

});
