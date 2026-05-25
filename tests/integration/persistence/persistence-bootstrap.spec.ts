import {
  getChatPersistenceClient,
  resetChatPersistenceClient,
} from "@/persistence/chatRuntime";
import { initializePersistentChatRuntime } from "@/persistence/persistenceBootstrap";
import type { DbWorkerEndpoint } from "@/persistence/dbProtocol";
import { afterEach, describe, expect, it } from "vitest";

describe("persistence bootstrap", () => {
  afterEach(() => {
    resetChatPersistenceClient();
  });

  it("initializes a DB client and registers it as the active chat persistence client", async () => {
    const endpoint: DbWorkerEndpoint = {
      async post(request) {
        if (request.type !== "initialize") {
          throw new Error(`Unexpected request: ${request.type}`);
        }

        return {
          type: "initialize_result",
          payload: {
            ready: true,
            schemaVersion: 1,
            availableTables: [],
            appliedMigrations: ["001_init"],
            sqliteCapabilities: {
              sqliteSyncAvailable: false,
              sqliteVectorAvailable: false,
              sqliteMemoryAvailable: false,
              storageMode: "opfs",
              filename: "/magicalgirl-sh.sqlite3",
              opfsAvailable: true,
            },
          },
        };
      },
    };

    const result = await initializePersistentChatRuntime({ endpoint });

    expect(result.initResult.sqliteCapabilities?.storageMode).toBe("opfs");
    expect(getChatPersistenceClient()).toBe(result.client);
  });
});
