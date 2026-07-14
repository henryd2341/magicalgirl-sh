import {
  createEmptyBossRuntimeState,
  type BossBattleEvent,
  type BossBattleRuntimeState,
} from "@/engine/battle/boss/bossTypes";
import type { BattleSnapshot } from "@/types/battle";
import { describe, expect, it } from "vitest";

describe("Boss battle contracts", () => {
  it("keeps runtime state serializable through a JSON round trip", () => {
    const state: BossBattleRuntimeState = {
      ...createEmptyBossRuntimeState(),
      profileIds: { "enemy-1": "test-profile" },
      phaseByActorId: { "enemy-1": "phase-1" },
      cooldowns: { "enemy-1:skill-255": 2 },
      queuedCounters: { "enemy-1": null },
      flags: { enraged: false },
      counters: { totalDamage: 1200 },
      lists: { downedPartners: ["enemy-2"] },
      mechanicState: { dpsWindow: { startTurn: 1, damage: 1200 } },
    };

    const restored = JSON.parse(
      JSON.stringify(state),
    ) as BossBattleRuntimeState;

    expect(restored).toEqual(state);
    expect(JSON.stringify(restored)).not.toContain("function");
  });

  it("models event data and attaches enemy identity plus runtime to snapshots", () => {
    const event: BossBattleEvent = {
      type: "damage_applied",
      sourceId: "player-1",
      targetId: "enemy-1",
      amount: 300,
      element: 1,
    };
    const snapshot = {
      participants: [{ id: "enemy-1", enemyId: "100" }],
      bossRuntime: {
        profileIds: { "enemy-1": "test-profile" },
      },
    } as BattleSnapshot;

    expect(event.amount).toBe(300);
    expect(snapshot.participants[0]?.enemyId).toBe("100");
    expect(snapshot.bossRuntime?.profileIds["enemy-1"]).toBe("test-profile");
  });
});

