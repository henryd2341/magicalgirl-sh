import {
  DbWorkerClient,
  createInProcessDbWorkerEndpoint,
} from "@/persistence/dbClient";
import { DbRuntimeSnapshotRepository } from "@/persistence/repositories/runtimeSnapshotRepository";
import { createDbWorkerRuntime } from "@/workers/db.worker";
import { describe, expect, it } from "vitest";

describe("DbRuntimeSnapshotRepository", () => {
  it("saves and reads the latest runtime session and battle snapshot", async () => {
    const endpoint = createInProcessDbWorkerEndpoint(createDbWorkerRuntime());
    const client = new DbWorkerClient(endpoint);
    await client.initialize();
    const repository = new DbRuntimeSnapshotRepository(client);

    await repository.saveCurrent({
      id: "current",
      updatedAt: "2026-05-26T00:00:00.000Z",
      sessionSnapshot: {
        sessionState: "COMBAT_PENDING",
        pipelineState: null,
        activeRequestId: null,
      },
      pendingBattle: {
        lifecycleState: "PENDING",
        encounterId: "enc-runtime-pending",
        narrativeReason: "刷新恢复测试。",
        enemies: [
          {
            instanceId: "runtime-shadow-1",
            enemyId: "runtime-shadow",
            displayName: "runtime-shadow",
            side: "enemy",
          },
        ],
      },
      activeBattle: null,
    });

    expect(await repository.getCurrent()).toEqual({
      id: "current",
      updatedAt: "2026-05-26T00:00:00.000Z",
      sessionSnapshot: {
        sessionState: "COMBAT_PENDING",
        pipelineState: null,
        activeRequestId: null,
      },
      pendingBattle: expect.objectContaining({
        encounterId: "enc-runtime-pending",
      }),
      activeBattle: null,
    });
  });

  it("overwrites the previous current runtime snapshot", async () => {
    const endpoint = createInProcessDbWorkerEndpoint(createDbWorkerRuntime());
    const client = new DbWorkerClient(endpoint);
    await client.initialize();
    const repository = new DbRuntimeSnapshotRepository(client);

    await repository.saveCurrent({
      id: "current",
      updatedAt: "2026-05-26T00:00:00.000Z",
      sessionSnapshot: {
        sessionState: "COMBAT_PENDING",
        pipelineState: null,
        activeRequestId: null,
      },
      pendingBattle: null,
      activeBattle: null,
    });
    await repository.saveCurrent({
      id: "current",
      updatedAt: "2026-05-26T00:00:01.000Z",
      sessionSnapshot: {
        sessionState: "POST_COMBAT_READY",
        pipelineState: null,
        activeRequestId: null,
      },
      pendingBattle: null,
      activeBattle: null,
    });

    expect(await repository.getCurrent()).toMatchObject({
      updatedAt: "2026-05-26T00:00:01.000Z",
      sessionSnapshot: {
        sessionState: "POST_COMBAT_READY",
      },
    });
  });
});
