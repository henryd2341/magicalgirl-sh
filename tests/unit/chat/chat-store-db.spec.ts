import {
  DbWorkerClient,
  createInProcessDbWorkerEndpoint,
} from "@/persistence/dbClient";
import { useChatStore } from "@/stores/chatStore";
import { createDbWorkerRuntime } from "@/workers/db.worker";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it } from "vitest";

describe("useChatStore with db-backed repository", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it("reloads persisted messages from the shared db endpoint after store recreation", async () => {
    const endpoint = createInProcessDbWorkerEndpoint(createDbWorkerRuntime());
    const client = new DbWorkerClient(endpoint);
    await client.initialize();

    const firstStore = useChatStore();
    await firstStore.configurePersistence({ client });
    await firstStore.createUserMessage({
      id: "user-db-store-001",
      content: "我沿着旧商场的扶梯缓慢上行。",
      createdAt: "2026-05-21T00:00:02.000Z",
    });

    expect(firstStore.messages).toEqual([
      expect.objectContaining({
        id: "user-db-store-001",
        content: "我沿着旧商场的扶梯缓慢上行。",
      }),
    ]);

    const secondStore = useChatStore();
    await secondStore.configurePersistence({ client });
    await secondStore.refreshMessages();

    expect(secondStore.messages).toEqual([
      expect.objectContaining({
        id: "user-db-store-001",
        content: "我沿着旧商场的扶梯缓慢上行。",
        finalized: true,
      }),
    ]);
  });
});
