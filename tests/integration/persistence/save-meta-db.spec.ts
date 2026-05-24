import {
  DbWorkerClient,
  createInProcessDbWorkerEndpoint,
} from "@/persistence/dbClient";
import { DbSaveMetaRepository } from "@/persistence/repositories/saveMetaRepository";
import { createDbWorkerRuntime } from "@/workers/db.worker";
import { describe, expect, it } from "vitest";

describe("save_meta sqlite persistence", () => {
  it("stores save metadata and updates an existing save slot by id", async () => {
    const client = new DbWorkerClient(
      createInProcessDbWorkerEndpoint(createDbWorkerRuntime()),
    );
    await client.initialize();
    const repository = new DbSaveMetaRepository(client);

    await repository.save({
      id: "save-slot-1",
      label: "Rooftop",
      createdAt: "2026-05-24T00:00:00.000Z",
      updatedAt: "2026-05-24T00:00:00.000Z",
      checkpointId: "checkpoint-old",
    });
    await repository.save({
      id: "save-slot-1",
      label: "After Battle",
      createdAt: "2026-05-24T00:00:00.000Z",
      updatedAt: "2026-05-24T00:05:00.000Z",
      checkpointId: "checkpoint-new",
    });

    expect(await repository.list()).toEqual([
      {
        id: "save-slot-1",
        label: "After Battle",
        createdAt: "2026-05-24T00:00:00.000Z",
        updatedAt: "2026-05-24T00:05:00.000Z",
        checkpointId: "checkpoint-new",
      },
    ]);
  });

  it("lists save metadata by updated time", async () => {
    const client = new DbWorkerClient(
      createInProcessDbWorkerEndpoint(createDbWorkerRuntime()),
    );
    await client.initialize();
    const repository = new DbSaveMetaRepository(client);

    await repository.save({
      id: "save-slot-late",
      label: "Late",
      createdAt: "2026-05-24T00:00:00.000Z",
      updatedAt: "2026-05-24T00:02:00.000Z",
      checkpointId: "checkpoint-late",
    });
    await repository.save({
      id: "save-slot-early",
      label: "Early",
      createdAt: "2026-05-24T00:00:00.000Z",
      updatedAt: "2026-05-24T00:01:00.000Z",
      checkpointId: "checkpoint-early",
    });

    expect((await repository.list()).map((record) => record.id)).toEqual([
      "save-slot-early",
      "save-slot-late",
    ]);
  });
});
