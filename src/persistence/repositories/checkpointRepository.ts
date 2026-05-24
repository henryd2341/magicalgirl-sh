/* eslint-disable no-unused-vars */

import type { DbWorkerClient } from "@/persistence/dbClient";
import { deepClone } from "@/utils/deepClone";
import type {
  CheckpointKind,
  CheckpointSnapshotRecord,
} from "@/types/recovery";

export interface CheckpointRepository {
  initialize(): Promise<void>;
  save(record: CheckpointSnapshotRecord): Promise<void>;
  list(): Promise<CheckpointSnapshotRecord[]>;
  getLatestByKind(
    kind: CheckpointKind,
  ): Promise<CheckpointSnapshotRecord | null>;
}

export class InMemoryCheckpointRepository implements CheckpointRepository {
  private readonly records = new Map<string, CheckpointSnapshotRecord>();

  public async initialize(): Promise<void> {
    return Promise.resolve();
  }

  public async save(record: CheckpointSnapshotRecord): Promise<void> {
    this.records.set(record.id, deepClone(record));
  }

  public async list(): Promise<CheckpointSnapshotRecord[]> {
    return [...this.records.values()]
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
      .map((record) => deepClone(record));
  }

  public async getLatestByKind(
    kind: CheckpointKind,
  ): Promise<CheckpointSnapshotRecord | null> {
    const records = (await this.list()).filter((record) => record.kind === kind);
    return records.at(-1) ?? null;
  }
}

export class DbCheckpointRepository implements CheckpointRepository {
  private readonly client: DbWorkerClient;

  public constructor(client: DbWorkerClient) {
    this.client = client;
  }

  public async initialize(): Promise<void> {
    await this.client.initialize();
  }

  public save(record: CheckpointSnapshotRecord): Promise<void> {
    return this.client.saveCheckpointSnapshot(record);
  }

  public list(): Promise<CheckpointSnapshotRecord[]> {
    return this.client.listCheckpointSnapshots();
  }

  public getLatestByKind(
    kind: CheckpointKind,
  ): Promise<CheckpointSnapshotRecord | null> {
    return this.client.getLatestCheckpointSnapshotByKind(kind);
  }
}
