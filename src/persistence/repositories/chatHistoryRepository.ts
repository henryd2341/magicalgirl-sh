/* eslint-disable no-unused-vars */

import type { DbWorkerClient } from "@/persistence/dbClient";
import type { ChatMessage } from "@/types/chat";

export interface ChatHistoryRepository {
  save(message: ChatMessage): Promise<void>;
  getById(id: string): Promise<ChatMessage | null>;
  list(): Promise<ChatMessage[]>;
}

export class InMemoryChatHistoryRepository implements ChatHistoryRepository {
  private readonly records = new Map<string, ChatMessage>();

  public async save(message: ChatMessage): Promise<void> {
    this.records.set(message.id, { ...message });
  }

  public async getById(id: string): Promise<ChatMessage | null> {
    const message = this.records.get(id);
    return message ? { ...message } : null;
  }

  public async list(): Promise<ChatMessage[]> {
    return [...this.records.values()].map((message) => ({ ...message }));
  }

  public clear(): void {
    this.records.clear();
  }
}

export class DbChatHistoryRepository implements ChatHistoryRepository {
  private readonly client: DbWorkerClient;

  public constructor(client: DbWorkerClient) {
    this.client = client;
  }

  public async save(message: ChatMessage): Promise<void> {
    await this.client.saveChatMessage(message);
  }

  public async getById(id: string): Promise<ChatMessage | null> {
    return this.client.getChatMessageById(id);
  }

  public async list(): Promise<ChatMessage[]> {
    return this.client.listChatMessages();
  }
}
