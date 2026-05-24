/* eslint-disable no-unused-vars */

import type { DbWorkerClient } from "@/persistence/dbClient";
import type { SaveMetaRecord } from "@/types/recovery";
import { deepClone } from "@/utils/deepClone";

export interface SaveMetaRepository {
  save(record: SaveMetaRecord): Promise<void>;
  list(): Promise<SaveMetaRecord[]>;
}

export class InMemorySaveMetaRepository implements SaveMetaRepository {
  private readonly records = new Map<string, SaveMetaRecord>();

  public async save(record: SaveMetaRecord): Promise<void> {
    this.records.set(record.id, deepClone(record));
  }

  public async list(): Promise<SaveMetaRecord[]> {
    return [...this.records.values()]
      .sort((left, right) => left.updatedAt.localeCompare(right.updatedAt))
      .map((record) => deepClone(record));
  }
}

export class DbSaveMetaRepository implements SaveMetaRepository {
  private readonly client: DbWorkerClient;

  public constructor(client: DbWorkerClient) {
    this.client = client;
  }

  public save(record: SaveMetaRecord): Promise<void> {
    return this.client.saveSaveMeta(record);
  }

  public list(): Promise<SaveMetaRecord[]> {
    return this.client.listSaveMeta();
  }
}
