import {
  configureChatPersistenceClient,
  getChatPersistenceClient,
} from "@/persistence/chatRuntime";
import {
  DbWorkerClient,
  createBrowserDbWorkerEndpoint,
  type BrowserDbWorkerLike,
} from "@/persistence/dbClient";
import type { DbInitResult, DbWorkerEndpoint } from "@/persistence/dbProtocol";

export interface InitializePersistentChatRuntimeInput {
  endpoint?: DbWorkerEndpoint;
  workerFactory?: () => BrowserDbWorkerLike;
}

export interface InitializePersistentChatRuntimeResult {
  client: DbWorkerClient;
  initResult: DbInitResult;
}

function createDefaultBrowserWorker(): BrowserDbWorkerLike {
  return new window.Worker(
    new window.URL("../workers/db.worker.ts", import.meta.url),
    {
      type: "module",
    },
  );
}

export async function initializePersistentChatRuntime(
  input: InitializePersistentChatRuntimeInput = {},
): Promise<InitializePersistentChatRuntimeResult> {
  const endpoint =
    input.endpoint ??
    createBrowserDbWorkerEndpoint(
      (input.workerFactory ?? createDefaultBrowserWorker)(),
    );
  const client = new DbWorkerClient(endpoint);
  const initResult = await client.initialize();

  configureChatPersistenceClient(client);

  return {
    client,
    initResult,
  };
}

export function hasPersistentChatRuntime(): boolean {
  return getChatPersistenceClient() !== null;
}
