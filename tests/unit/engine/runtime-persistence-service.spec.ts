import { RuntimePersistenceService, sanitizeRuntimeSnapshot } from "@/engine/runtimePersistenceService";
import { InMemoryRuntimeSnapshotRepository } from "@/persistence/repositories/runtimeSnapshotRepository";
import type { BattleSnapshot, PendingBattleSnapshot } from "@/types/battle";
import { describe, expect, it } from "vitest";

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
