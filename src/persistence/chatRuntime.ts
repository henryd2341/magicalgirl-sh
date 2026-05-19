import type { DbWorkerClient } from "@/persistence/dbClient";

let activeChatPersistenceClient: DbWorkerClient | null = null;

export function configureChatPersistenceClient(client: DbWorkerClient): void {
  activeChatPersistenceClient = client;
}

export function getChatPersistenceClient(): DbWorkerClient | null {
  return activeChatPersistenceClient;
}

export function resetChatPersistenceClient(): void {
  activeChatPersistenceClient = null;
}
