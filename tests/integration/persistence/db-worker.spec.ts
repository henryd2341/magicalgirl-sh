import {
  DbWorkerClient,
  createInProcessDbWorkerEndpoint,
} from "@/persistence/dbClient";
import { createDbWorkerRuntime } from "@/workers/db.worker";
import { describe, expect, it } from "vitest";

describe("DbWorkerClient", () => {
  it("initializes the worker runtime, applies migrations, and reads back inserted records", async () => {
    const endpoint = createInProcessDbWorkerEndpoint(createDbWorkerRuntime());
    const client = new DbWorkerClient(endpoint);

    const initResult = await client.initialize();
    expect(initResult.ready).toBe(true);
    expect(initResult.appliedMigrations).toContain("001_init");

    await client.insertTestRecord({
      id: "record-alpha",
      label: "alpha",
      createdAt: "2026-05-19T00:00:00.000Z",
    });

    const records = await client.listTestRecords();
    expect(records).toEqual([
      {
        id: "record-alpha",
        label: "alpha",
        createdAt: "2026-05-19T00:00:00.000Z",
      },
    ]);
  });

  it("exposes the frozen MVP table set and keeps migrations idempotent across repeated initialization", async () => {
    const endpoint = createInProcessDbWorkerEndpoint(
      createDbWorkerRuntime({
        storage: "memory",
      }),
    );
    const client = new DbWorkerClient(endpoint);

    const firstInit = await client.initialize();
    expect(firstInit.schemaVersion).toBe(1);
    expect(firstInit.availableTables).toEqual([
      "variable_def",
      "variable_value",
      "variable_change_log",
      "item_def",
      "enemy_def",
      "skill_def",
      "world_info",
      "chat_history",
      "event_log",
      "checkpoint_snapshot",
      "save_meta",
      "save_slot",
      "runtime_snapshot",
      "test_record",
    ]);

    const secondInit = await client.initialize();
    expect(secondInit.appliedMigrations).toEqual([]);
    expect(secondInit.availableTables).toEqual(firstInit.availableTables);
    expect(secondInit.sqliteCapabilities).toEqual({
      sqliteSyncAvailable: expect.any(Boolean),
      sqliteVectorAvailable: expect.any(Boolean),
      sqliteMemoryAvailable: expect.any(Boolean),
      storageMode: "memory",
      filename: ":memory:",
      opfsAvailable: expect.any(Boolean),
    });
  });

  it("initializes persistent storage with OPFS preference by default", async () => {
    const endpoint = createInProcessDbWorkerEndpoint(createDbWorkerRuntime());
    const client = new DbWorkerClient(endpoint);

    const initResult = await client.initialize();

    expect(initResult.sqliteCapabilities).toMatchObject({
      storageMode: expect.stringMatching(/^(opfs|memory)$/),
      filename: expect.any(String),
      opfsAvailable: expect.any(Boolean),
    });
  });

  it("keeps sqlite recovery records readable across repeated initialization", async () => {
    const endpoint = createInProcessDbWorkerEndpoint(createDbWorkerRuntime());
    const client = new DbWorkerClient(endpoint);

    await client.initialize();
    await client.saveCheckpointSnapshot({
      id: "checkpoint-repeat-init",
      kind: "idle_checkpoint",
      snapshotVersion: 1,
      createdAt: "2026-05-24T00:00:00.000Z",
      reason: "before request",
      sessionSnapshot: {
        sessionState: "IDLE",
        pipelineState: null,
        activeRequestId: null,
      },
      variableValue: null,
      chatMessages: [],
    });

    await client.initialize();

    expect(await client.listCheckpointSnapshots()).toEqual([
      {
        id: "checkpoint-repeat-init",
        kind: "idle_checkpoint",
        snapshotVersion: 1,
        createdAt: "2026-05-24T00:00:00.000Z",
        reason: "before request",
        sessionSnapshot: {
          sessionState: "IDLE",
          pipelineState: null,
          activeRequestId: null,
        },
        variableValue: null,
        chatMessages: [],
      },
    ]);
  });

  it("surfaces worker protocol errors when a write is attempted before initialization", async () => {
    const endpoint = createInProcessDbWorkerEndpoint(createDbWorkerRuntime());
    const client = new DbWorkerClient(endpoint);

    await expect(
      client.insertTestRecord({
        id: "record-before-init",
        label: "blocked",
        createdAt: "2026-05-19T00:00:00.000Z",
      }),
    ).rejects.toThrow(
      "[DB_WORKER_NOT_READY] Database worker must be initialized before writes.",
    );
  });
});
