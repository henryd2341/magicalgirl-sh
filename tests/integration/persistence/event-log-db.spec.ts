import {
  DbWorkerClient,
  createInProcessDbWorkerEndpoint,
} from "@/persistence/dbClient";
import { DbEventLogRepository } from "@/persistence/repositories/eventLogRepository";
import { createDbWorkerRuntime } from "@/workers/db.worker";
import { describe, expect, it } from "vitest";

describe("event_log sqlite persistence", () => {
  it("appends committed domain events and lists them by creation time", async () => {
    const client = new DbWorkerClient(
      createInProcessDbWorkerEndpoint(createDbWorkerRuntime()),
    );
    await client.initialize();
    const repository = new DbEventLogRepository(client);

    await repository.append({
      id: "event-finalized",
      type: "AssistantMessageFinalized",
      createdAt: "2026-05-24T00:02:00.000Z",
      source: "orchestrator",
      payload: {
        messageId: "assistant-1",
      },
    });
    await repository.append({
      id: "event-started",
      type: "RequestStarted",
      createdAt: "2026-05-24T00:01:00.000Z",
      source: "orchestrator",
      payload: {
        requestId: "request-1",
      },
    });
    await repository.append({
      id: "event-checkpoint",
      type: "CheckpointCreated",
      createdAt: "2026-05-24T00:03:00.000Z",
      source: "recovery",
      payload: {
        checkpointId: "checkpoint-1",
      },
    });

    expect(await repository.list()).toEqual([
      {
        id: "event-started",
        type: "RequestStarted",
        createdAt: "2026-05-24T00:01:00.000Z",
        source: "orchestrator",
        payload: {
          requestId: "request-1",
        },
      },
      {
        id: "event-finalized",
        type: "AssistantMessageFinalized",
        createdAt: "2026-05-24T00:02:00.000Z",
        source: "orchestrator",
        payload: {
          messageId: "assistant-1",
        },
      },
      {
        id: "event-checkpoint",
        type: "CheckpointCreated",
        createdAt: "2026-05-24T00:03:00.000Z",
        source: "recovery",
        payload: {
          checkpointId: "checkpoint-1",
        },
      },
    ]);
  });

  it("returns cloned event payloads so callers cannot mutate repository state", async () => {
    const client = new DbWorkerClient(
      createInProcessDbWorkerEndpoint(createDbWorkerRuntime()),
    );
    await client.initialize();
    const repository = new DbEventLogRepository(client);

    await repository.append({
      id: "event-clone",
      type: "VariablesUpdated",
      createdAt: "2026-05-24T00:00:00.000Z",
      source: "variables",
      payload: {
        path: ["player", "hp"],
      },
    });

    const [firstRead] = await repository.list();
    firstRead.payload = {
      path: ["mutated"],
    };

    const [secondRead] = await repository.list();
    expect(secondRead.payload).toEqual({
      path: ["player", "hp"],
    });
  });
});
