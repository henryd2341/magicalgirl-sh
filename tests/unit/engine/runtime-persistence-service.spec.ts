import {
  RuntimePersistenceService,
  sanitizeRuntimeSnapshot,
  validateBossRuntimeSnapshot,
} from "@/engine/runtimePersistenceService";
import {
  clearBossProfilesForTests,
  registerBossProfile,
} from "@/engine/battle/boss/bossRegistry";
import { createEmptyBossRuntimeState } from "@/engine/battle/boss/bossTypes";
import { InMemoryRuntimeSnapshotRepository } from "@/persistence/repositories/runtimeSnapshotRepository";
import type { BattleSnapshot, PendingBattleSnapshot } from "@/types/battle";
import { beforeEach, describe, expect, it } from "vitest";

const idle = {
  sessionState: "IDLE" as const,
  pipelineState: null,
  activeRequestId: null,
};

function pending(source: PendingBattleSnapshot["source"]): PendingBattleSnapshot {
  return {
    lifecycleState: "PENDING",
    encounterId: "enc-1",
    narrativeReason: "test",
    enemies: [],
    source,
  };
}

function active(source: BattleSnapshot["source"]): BattleSnapshot {
  return {
    lifecycleState: "ACTIVE",
    phase: "PLAYER_COMMAND",
    encounterId: "enc-1",
    source,
    participants: [],
    pressTurn: { solidIcons: 1, blinkingIcons: 0 },
  };
}

describe("RuntimePersistenceService", () => {
  beforeEach(() => {
    clearBossProfilesForTests();
  });

  it.each(["training/free", "training/challenge"] as const)(
    "drops %s temporary combat and persists a stable idle snapshot",
    async (source) => {
      const repository = new InMemoryRuntimeSnapshotRepository();
      const service = new RuntimePersistenceService({
        repository,
        now: () => "2026-07-13T00:00:00.000Z",
      });

      await service.saveCurrent({
        sessionSnapshot: {
          sessionState: "IN_COMBAT",
          pipelineState: null,
          activeRequestId: null,
        },
        pendingBattle: null,
        activeBattle: active(source),
      });

      await expect(repository.getCurrent()).resolves.toMatchObject({
        sessionSnapshot: idle,
        pendingBattle: null,
        activeBattle: null,
      });
    },
  );

  it("preserves story combat snapshots", async () => {
    const input = {
      sessionSnapshot: {
        sessionState: "COMBAT_PENDING" as const,
        pipelineState: null,
        activeRequestId: null,
      },
      pendingBattle: pending("story"),
      activeBattle: null,
    };

    expect(sanitizeRuntimeSnapshot(input)).toBe(input);
  });

  it("round-trips valid Boss runtime and accepts legacy snapshots", () => {
    registerBossProfile({
      id: "persisted-boss",
      actorEnemyIds: ["100"],
      initialPhase: "phase-1",
      skillIds: ["255"],
      reduceEvent: () => [],
      selectForcedIntent: () => null,
      enumerateUtilityCandidates: () => [],
    });
    const snapshot = active("story");
    snapshot.participants = [
      {
        id: "enemy-1",
        enemyId: "100",
        side: "enemy",
        displayName: "Boss",
        hp: { current: 1, max: 1 },
        mp: { current: 0, max: 0 },
        isDown: false,
        isActive: true,
      },
    ];
    snapshot.bossRuntime = {
      ...createEmptyBossRuntimeState(),
      profileIds: { "enemy-1": "persisted-boss" },
      phaseByActorId: { "enemy-1": "phase-1" },
    };

    expect(validateBossRuntimeSnapshot(snapshot)).toBe(true);
    expect(
      validateBossRuntimeSnapshot(
        JSON.parse(JSON.stringify(snapshot)) as BattleSnapshot,
      ),
    ).toBe(true);
    expect(validateBossRuntimeSnapshot(active("story"))).toBe(true);
  });

  it("rejects corrupt story Boss runtime and discards corrupt training runtime", () => {
    const corrupt = active("story");
    corrupt.bossRuntime = {
      ...createEmptyBossRuntimeState(),
      profileIds: { missing: "unknown-profile" },
      decisionSteps: 999,
    };

    expect(validateBossRuntimeSnapshot(corrupt)).toBe(false);
    expect(() =>
      sanitizeRuntimeSnapshot({
        sessionSnapshot: {
          sessionState: "IN_COMBAT",
          pipelineState: null,
          activeRequestId: null,
        },
        pendingBattle: null,
        activeBattle: corrupt,
      }),
    ).toThrow(/BOSS_RUNTIME_INVALID/);

    corrupt.source = "training/challenge";
    expect(
      sanitizeRuntimeSnapshot({
        sessionSnapshot: {
          sessionState: "IN_COMBAT",
          pipelineState: null,
          activeRequestId: null,
        },
        pendingBattle: null,
        activeBattle: corrupt,
      }),
    ).toEqual({
      sessionSnapshot: idle,
      pendingBattle: null,
      activeBattle: null,
    });
  });

  it("sanitizes legacy snapshots when either battle is training sourced", () => {
    expect(
      sanitizeRuntimeSnapshot({
        sessionSnapshot: {
          sessionState: "IN_COMBAT",
          pipelineState: null,
          activeRequestId: null,
        },
        pendingBattle: pending("story"),
        activeBattle: active("training/free"),
      }),
    ).toEqual({
      sessionSnapshot: idle,
      pendingBattle: null,
      activeBattle: null,
    });
  });
});
