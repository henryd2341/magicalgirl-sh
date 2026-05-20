/* eslint-disable no-unused-vars */

import type { DbWorkerClient } from "@/persistence/dbClient";
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

function cloneValue<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export class InMemoryVariableRepository implements VariableRepository {
  private record: VariableValueRecord | null = null;

  public async getCurrent(): Promise<VariableValueRecord | null> {
    return this.record ? cloneValue(this.record) : null;
  }

  public async saveCurrent(record: VariableValueRecord): Promise<void> {
    this.record = cloneValue(record);
  }
}

export class InMemoryVariableChangeLogRepository implements VariableChangeLogRepository {
  private readonly records = new Map<string, VariableChangeLogRecord>();

  public async append(record: VariableChangeLogRecord): Promise<void> {
    this.records.set(record.id, cloneValue(record));
  }

  public async list(): Promise<VariableChangeLogRecord[]> {
    return [...this.records.values()].map((record) => cloneValue(record));
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
