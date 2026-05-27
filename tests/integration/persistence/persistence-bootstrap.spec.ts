import {
  getChatPersistenceClient,
  resetChatPersistenceClient,
} from "@/persistence/chatRuntime";
import {
  DbWorkerClient,
  createInProcessDbWorkerEndpoint,
} from "@/persistence/dbClient";
import { initializePersistentChatRuntime } from "@/persistence/persistenceBootstrap";
import { DbVariableRepository } from "@/persistence/repositories/variableRepository";
import { DbWorldInfoRepository } from "@/persistence/repositories/worldInfoRepository";
import { VariableEngine } from "@/engine/variableEngine";
import { createDbWorkerRuntime } from "@/workers/db.worker";
import { afterEach, describe, expect, it } from "vitest";

describe("persistence bootstrap", () => {
  afterEach(() => {
    resetChatPersistenceClient();
  });

  it("initializes a DB client and registers it as the active chat persistence client", async () => {
    const endpoint = createInProcessDbWorkerEndpoint(createDbWorkerRuntime());

    const result = await initializePersistentChatRuntime({ endpoint });

    expect(getChatPersistenceClient()).toBe(result.client);
  });

  it("initializes the DB variable state when persistence starts", async () => {
    const endpoint = createInProcessDbWorkerEndpoint(createDbWorkerRuntime());

    const result = await initializePersistentChatRuntime({
      endpoint,
      now: () => "2026-05-25T13:01:00.000Z",
    });

    await expect(
      new DbVariableRepository(result.client).getCurrent(),
    ).resolves.toMatchObject({
      rootId: "game_variables_root",
      stateHash: "initial",
      updatedAt: "2026-05-25T13:01:00.000Z",
    });
  });

  it("does not overwrite an existing DB variable state during persistence startup", async () => {
    const endpoint = createInProcessDbWorkerEndpoint(createDbWorkerRuntime());
    const client = new DbWorkerClient(endpoint);
    await client.initialize();
    const variableRepository = new DbVariableRepository(client);
    await variableRepository.saveCurrent({
      ...new VariableEngine().createInitialState(),
      rootId: "existing-db-root",
      stateHash: "existing-db-hash",
      updatedAt: "2026-05-25T12:59:00.000Z",
    });

    const result = await initializePersistentChatRuntime({
      endpoint,
      now: () => "2026-05-25T13:01:00.000Z",
    });

    await expect(
      new DbVariableRepository(result.client).getCurrent(),
    ).resolves.toMatchObject({
      rootId: "existing-db-root",
      stateHash: "existing-db-hash",
      updatedAt: "2026-05-25T12:59:00.000Z",
    });
  });

  it("syncs bundled raw world info entries during persistence startup", async () => {
    const endpoint = createInProcessDbWorkerEndpoint(createDbWorkerRuntime());

    const result = await initializePersistentChatRuntime({ endpoint });

    await expect(
      new DbWorldInfoRepository(result.client).list(),
    ).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "raw_entries/世界观基础",
          enabled: true,
        }),
      ]),
    );
  });

  it("applies gender-specific raw world info activation during persistence startup", async () => {
    const endpoint = createInProcessDbWorkerEndpoint(createDbWorkerRuntime());
    const client = new DbWorkerClient(endpoint);
    await client.initialize();
    const variableState = new VariableEngine().createInitialState();
    variableState.root.player.profile.gender = "男";
    await new DbVariableRepository(client).saveCurrent(variableState);

    const result = await initializePersistentChatRuntime({ endpoint });

    await expect(
      new DbWorldInfoRepository(result.client).list(),
    ).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "raw_entries/男user",
          enabled: true,
        }),
        expect.objectContaining({
          id: "raw_entries/女user",
          enabled: false,
        }),
      ]),
    );
  });
});
