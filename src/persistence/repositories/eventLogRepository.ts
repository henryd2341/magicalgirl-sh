/* eslint-disable no-unused-vars */

import type { DbWorkerClient } from "@/persistence/dbClient";
import type { EventLogRecord } from "@/types/recovery";
import { deepClone } from "@/utils/deepClone";

export interface EventLogRepository {
  append(record: EventLogRecord): Promise<void>;
  list(): Promise<EventLogRecord[]>;
}

export class InMemoryEventLogRepository implements EventLogRepository {
  private readonly records = new Map<string, EventLogRecord>();

  public async append(record: EventLogRecord): Promise<void> {
    this.records.set(record.id, deepClone(record));
  }

  public async list(): Promise<EventLogRecord[]> {
    return [...this.records.values()]
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
      .map((record) => deepClone(record));
  }
}

export class DbEventLogRepository implements EventLogRepository {
  private readonly client: DbWorkerClient;

  public constructor(client: DbWorkerClient) {
    this.client = client;
  }

  public append(record: EventLogRecord): Promise<void> {
    return this.client.appendEventLog(record);
  }

  public list(): Promise<EventLogRecord[]> {
    return this.client.listEventLogs();
  }
}
