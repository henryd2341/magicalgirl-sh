import {
  syncRawWorldInfoEntries,
} from "@/content/rawWorldInfoLoader";
import { syncPlayerGenderWorldInfoActivation } from "@/content/worldInfoActivation";
import {
  configureChatPersistenceClient,
  getChatPersistenceClient,
} from "@/persistence/chatRuntime";
import {
  DbWorkerClient,
  createBrowserDbWorkerEndpoint,
  type BrowserDbWorkerLike,
} from "@/persistence/dbClient";
import { ensureVariableState } from "@/engine/variableStateBootstrap";
import type { DbInitResult, DbWorkerEndpoint } from "@/persistence/dbProtocol";
import { DbVariableRepository } from "@/persistence/repositories/variableRepository";
import { DbWorldInfoRepository } from "@/persistence/repositories/worldInfoRepository";

export interface InitializePersistentChatRuntimeInput {
  endpoint?: DbWorkerEndpoint;
  workerFactory?: () => BrowserDbWorkerLike;
  now?: () => string;
}

export interface InitializePersistentChatRuntimeResult {
  client: DbWorkerClient;
  initResult: DbInitResult;
}

function createDefaultBrowserWorker(): BrowserDbWorkerLike {
  return new Worker(new URL("../workers/db.worker.ts", import.meta.url), {
    type: "module",
  });
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

  await ensureVariableState(new DbVariableRepository(client), {
    now: input.now,
  });
  const variableRepository = new DbVariableRepository(client);
  const worldInfoRepository = new DbWorldInfoRepository(client);
  await syncRawWorldInfoEntries(worldInfoRepository);
  await syncPlayerGenderWorldInfoActivation({
    variableRepository,
    worldInfoRepository,
  });
  configureChatPersistenceClient(client);

  return {
    client,
    initResult,
  };
}

export function hasPersistentChatRuntime(): boolean {
  return getChatPersistenceClient() !== null;
}
