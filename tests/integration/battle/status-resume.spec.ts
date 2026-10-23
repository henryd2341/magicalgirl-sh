import { refreshBattleStatus, resolveNextEnemyAction } from "@/engine/battle/battleResolver";
import { RuntimePersistenceService } from "@/engine/runtimePersistenceService";
import { DbWorkerClient, createInProcessDbWorkerEndpoint } from "@/persistence/dbClient";
import { DbRuntimeSnapshotRepository } from "@/persistence/repositories/runtimeSnapshotRepository";
import { useBattleStore } from "@/stores/battleStore";
import type { BattleSnapshot } from "@/types/battle";
import { createDbWorkerRuntime } from "@/workers/db.worker";
import { createSharedRawSqliteFactory } from "../../helpers/sharedRawSqlite";
import { createPinia, setActivePinia } from "pinia";
import { afterEach, describe, expect, it, vi } from "vitest";

function savedBattle(): BattleSnapshot {
  return {
    lifecycleState: "ACTIVE", source: "story", phase: "PLAYER_COMMAND", encounterId: "status-resume", turnCount: 4,
    currentActorId: "p", selectedActionId: null,
    pressTurn: { ownerSide: "player", icons: [{ id: "p-icon", state: "solid" }] },
    pressTurnAllocation: { participantIds: ["p"], initialIconCount: 1 },
    participants: [
      {
        id: "p", side: "player", displayName: "Player", isActive: true, isDown: false,
        hp: { current: 100, max: 100 }, mp: { current: 100, max: 100 },
        statusEffects: [{ effectId: "paralyze", remainingDuration: 2, stacks: 1 }],
      },
      {
        id: "e", side: "enemy", displayName: "Enemy", isActive: true, isDown: false,
        hp: { current: 100, max: 100 }, mp: { current: 100, max: 100 },
        statusEffects: [
          { effectId: "fire_reflect", remainingDuration: 1, stacks: 1 },
          { effectId: "instant_death", remainingDuration: 2, stacks: 1 },
        ],
      },
    ],
  };
}

afterEach(() => vi.restoreAllMocks());

describe("status phase persistence", () => {
  it("preserves phase/cache fields through runtime serialization, SQLite worker recreation, and store restore", async () => {
    const random = vi.spyOn(Math, "random").mockReturnValue(0.75);
    const original = refreshBattleStatus(savedBattle());
    expect(random).toHaveBeenCalledTimes(1);
    const sqlite3Factory = createSharedRawSqliteFactory();
    const connect = async () => {
      const client = new DbWorkerClient(createInProcessDbWorkerEndpoint(
        createDbWorkerRuntime({ storage: "memory", sqlite3Factory }),
      ));
      await client.initialize();
      return new DbRuntimeSnapshotRepository(client);
    };
    const first = await connect();
    await new RuntimePersistenceService({ repository: first }).saveCurrent({
      sessionSnapshot: { sessionState: "IN_COMBAT", pipelineState: null, activeRequestId: null },
      activeBattle: original, pendingBattle: null,
    });
    const reloaded = (await (await connect()).getCurrent())!.activeBattle!;
    expect(reloaded).toEqual(original);
    setActivePinia(createPinia());
    const store = useBattleStore();
    store.restoreBattleSnapshot({ activeBattle: reloaded });
    expect(store.activeBattle!.participants).toEqual(original.participants);
    expect(random).toHaveBeenCalledTimes(1);
    expect(store.activeBattle!.participants[1]!.hp.current).toBe(100);

    const finishRound = (snapshot: BattleSnapshot) => resolveNextEnemyAction({
      ...snapshot, phase: "ENEMY_TURN", currentActorId: null,
      pressTurn: { ownerSide: "enemy", icons: [] },
      pressTurnAllocation: { participantIds: ["e"], initialIconCount: 1 },
    });
    const uninterrupted = finishRound(original);
    const resumed = finishRound(store.activeBattle!);
    expect(resumed.participants).toEqual(uninterrupted.participants);
    expect(resumed.turnCount).toBe(uninterrupted.turnCount);
    expect(resumed.participants[1]!.statusEffects).toContainEqual({
      effectId: "instant_death", remainingDuration: 1, stacks: 1,
    });
    const final = finishRound(resumed);
    expect(final.participants[1]!.hp.current).toBe(0);
    expect(final.participants[1]!.statusEffects?.some((effect) => effect.effectId === "instant_death")).toBe(false);
    expect(final.battleResult?.outcome).toBe("victory");
  });
});
