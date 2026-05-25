/* eslint-disable no-unused-vars */

import type { DbWorkerClient } from "@/persistence/dbClient";
import type { ChatMessage } from "@/types/chat";

export interface ChatHistoryRepository {
  save(message: ChatMessage): Promise<void>;
  getById(id: string): Promise<ChatMessage | null>;
  list(): Promise<ChatMessage[]>;
  replaceAll(messages: ChatMessage[]): Promise<void>;
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

  public async replaceAll(messages: ChatMessage[]): Promise<void> {
    this.records.clear();
    for (const message of messages) {
      this.records.set(message.id, { ...message });
    }
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

  public async replaceAll(messages: ChatMessage[]): Promise<void> {
    await this.client.replaceChatMessages(messages);
  }
}
