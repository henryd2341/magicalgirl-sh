/* eslint-disable no-unused-vars */

import type { DbWorkerClient } from "@/persistence/dbClient";
import type { RuntimeSnapshotRecord } from "@/types/runtimeSnapshot";
import { deepClone } from "@/utils/deepClone";

export interface RuntimeSnapshotRepository {
  saveCurrent(record: RuntimeSnapshotRecord): Promise<void>;
  getCurrent(): Promise<RuntimeSnapshotRecord | null>;
  clearCurrent(): Promise<void>;
}

export class InMemoryRuntimeSnapshotRepository
  implements RuntimeSnapshotRepository
{
  private current: RuntimeSnapshotRecord | null = null;

  public async saveCurrent(record: RuntimeSnapshotRecord): Promise<void> {
    this.current = deepClone(record);
  }

  public async getCurrent(): Promise<RuntimeSnapshotRecord | null> {
    return this.current ? deepClone(this.current) : null;
  }

  public async clearCurrent(): Promise<void> {
    this.current = null;
  }
}

export class DbRuntimeSnapshotRepository
  implements RuntimeSnapshotRepository
{
  private readonly client: DbWorkerClient;

  public constructor(client: DbWorkerClient) {
    this.client = client;
  }

  public saveCurrent(record: RuntimeSnapshotRecord): Promise<void> {
    return this.client.saveRuntimeSnapshot(record);
  }

  public getCurrent(): Promise<RuntimeSnapshotRecord | null> {
    return this.client.getRuntimeSnapshot();
  }

  public clearCurrent(): Promise<void> {
    return this.client.clearRuntimeSnapshot();
  }
}
