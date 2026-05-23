/* eslint-disable no-unused-vars */

import type { DbWorkerClient } from "@/persistence/dbClient";

export interface WorldInfoEntry {
  id: string;
  keywords: string[];
  content: string;
  priority: number;
  enabled: boolean;
}

export interface WorldInfoRepository {
  save(entry: WorldInfoEntry): Promise<void>;
  list(): Promise<WorldInfoEntry[]>;
}

function cloneValue<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export class InMemoryWorldInfoRepository implements WorldInfoRepository {
  private readonly entries = new Map<string, WorldInfoEntry>();

  public async save(entry: WorldInfoEntry): Promise<void> {
    this.entries.set(entry.id, cloneValue(entry));
  }

  public async list(): Promise<WorldInfoEntry[]> {
    return [...this.entries.values()].map((entry) => cloneValue(entry));
  }
}

export class DbWorldInfoRepository implements WorldInfoRepository {
  private readonly client: DbWorkerClient;

  public constructor(client: DbWorkerClient) {
    this.client = client;
  }

  public save(entry: WorldInfoEntry): Promise<void> {
    return this.client.saveWorldInfoEntry(entry);
  }

  public list(): Promise<WorldInfoEntry[]> {
    return this.client.listWorldInfoEntries();
  }
}
