/* eslint-disable no-unused-vars */

import type { DbWorkerClient } from "@/persistence/dbClient";
import { deepClone } from "@/utils/deepClone";

export interface WorldInfoEntry {
  id: string;
  keywords: string[];
  content: string;
  priority: number;
  enabled: boolean;
  isConstant: boolean;
}

export interface WorldInfoRepository {
  save(entry: WorldInfoEntry): Promise<void>;
  list(): Promise<WorldInfoEntry[]>;
}

export class InMemoryWorldInfoRepository implements WorldInfoRepository {
  private readonly entries = new Map<string, WorldInfoEntry>();

  public async save(entry: WorldInfoEntry): Promise<void> {
    this.entries.set(entry.id, deepClone(entry));
  }

  public async list(): Promise<WorldInfoEntry[]> {
    return [...this.entries.values()].map((entry) => deepClone(entry));
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
