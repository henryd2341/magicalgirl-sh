import {
  DbWorkerClient,
  createInProcessDbWorkerEndpoint,
} from "@/persistence/dbClient";
import { DbCheckpointRepository } from "@/persistence/repositories/checkpointRepository";
import type { CheckpointSnapshotRecord } from "@/types/recovery";
import { createDbWorkerRuntime } from "@/workers/db.worker";
import { describe, expect, it } from "vitest";

function createRepository(): DbCheckpointRepository {
  const client = new DbWorkerClient(
    createInProcessDbWorkerEndpoint(createDbWorkerRuntime()),
  );
  return new DbCheckpointRepository(client);
}

function createCheckpoint(
  overrides: Partial<CheckpointSnapshotRecord>,
): CheckpointSnapshotRecord {
  return {
    id: "checkpoint-idle-1",
    kind: "idle_checkpoint",
    createdAt: "2026-05-24T00:00:00.000Z",
    reason: "before request",
    sessionSnapshot: {
      sessionState: "IDLE",
      pipelineState: null,
      activeRequestId: null,
    },
    metadata: {
      requestId: "request-1",
    },
    ...overrides,
  };
}

describe("checkpoint_snapshot sqlite persistence", () => {
  it("stores checkpoint snapshots and returns the latest checkpoint by kind", async () => {
    const repository = createRepository();

    await repository.initialize();
    await repository.save(
      createCheckpoint({
        id: "checkpoint-combat-old",
        kind: "combat_checkpoint",
        createdAt: "2026-05-24T00:01:00.000Z",
        reason: "entered combat",
      }),
    );
    await repository.save(
      createCheckpoint({
        id: "checkpoint-save-1",
        kind: "save_checkpoint",
        createdAt: "2026-05-24T00:02:00.000Z",
        reason: "manual save",
      }),
    );
    await repository.save(
      createCheckpoint({
        id: "checkpoint-combat-new",
        kind: "combat_checkpoint",
        createdAt: "2026-05-24T00:03:00.000Z",
        reason: "enemy turn",
        activeBattle: {
          lifecycleState: "ACTIVE",
          phase: "ENEMY_TURN",
          encounterId: "encounter-1",
          participants: [],
          pressTurn: {
            ownerSide: "enemy",
            icons: [],
          },
        },
      }),
    );

    expect((await repository.list()).map((record) => record.id)).toEqual([
      "checkpoint-combat-old",
      "checkpoint-save-1",
      "checkpoint-combat-new",
    ]);
    expect(await repository.getLatestByKind("combat_checkpoint")).toMatchObject(
      {
        id: "checkpoint-combat-new",
        kind: "combat_checkpoint",
        reason: "enemy turn",
      },
    );
  });

  it("returns cloned checkpoint payloads so callers cannot mutate repository state", async () => {
    const repository = createRepository();

    await repository.initialize();
    await repository.save(
      createCheckpoint({
        id: "checkpoint-clone",
        metadata: {
          requestId: "request-before-mutation",
        },
      }),
    );

    const [firstRead] = await repository.list();
    firstRead.metadata = {
      requestId: "mutated",
    };

    const [secondRead] = await repository.list();
    expect(secondRead.metadata).toEqual({
      requestId: "request-before-mutation",
    });
  });
});
