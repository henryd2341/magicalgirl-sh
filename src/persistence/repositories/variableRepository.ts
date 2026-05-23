/* eslint-disable no-unused-vars */

import type { DbWorkerClient } from "@/persistence/dbClient";
import { deepClone } from "@/utils/deepClone";
import type {
  VariableChangeLogRecord,
  VariableValueRecord,
} from "@/types/variables";

export interface VariableRepository {
  getCurrent(): Promise<VariableValueRecord | null>;
  saveCurrent(record: VariableValueRecord): Promise<void>;
}

export interface VariableChangeLogRepository {
  append(record: VariableChangeLogRecord): Promise<void>;
  list(): Promise<VariableChangeLogRecord[]>;
}

export class InMemoryVariableRepository implements VariableRepository {
  private record: VariableValueRecord | null = null;

  public async getCurrent(): Promise<VariableValueRecord | null> {
    return this.record ? deepClone(this.record) : null;
  }

  public async saveCurrent(record: VariableValueRecord): Promise<void> {
    this.record = deepClone(record);
  }
}

export class InMemoryVariableChangeLogRepository implements VariableChangeLogRepository {
  private readonly records = new Map<string, VariableChangeLogRecord>();

  public async append(record: VariableChangeLogRecord): Promise<void> {
    this.records.set(record.id, deepClone(record));
  }

  public async list(): Promise<VariableChangeLogRecord[]> {
    return [...this.records.values()].map((record) => deepClone(record));
  }
}

export class DbVariableRepository implements VariableRepository {
  private readonly client: DbWorkerClient;

  public constructor(client: DbWorkerClient) {
    this.client = client;
  }

  public getCurrent(): Promise<VariableValueRecord | null> {
    return this.client.getCurrentVariableValue();
  }

  public saveCurrent(record: VariableValueRecord): Promise<void> {
    return this.client.saveCurrentVariableValue(record);
  }
}

export class DbVariableChangeLogRepository implements VariableChangeLogRepository {
  private readonly client: DbWorkerClient;

  public constructor(client: DbWorkerClient) {
    this.client = client;
  }

  public append(record: VariableChangeLogRecord): Promise<void> {
    return this.client.appendVariableChangeLog(record);
  }

  public list(): Promise<VariableChangeLogRecord[]> {
    return this.client.listVariableChangeLogs();
  }
}
