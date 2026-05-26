import type { RuntimeSnapshotRepository } from "@/persistence/repositories/runtimeSnapshotRepository";
import type { BattleSnapshot, PendingBattleSnapshot } from "@/types/battle";
import type { RuntimeSnapshotRecord } from "@/types/runtimeSnapshot";
import type { SessionSnapshot } from "@/engine/sessionManager";

export interface RuntimePersistenceServiceDependencies {
  repository: RuntimeSnapshotRepository;
  now?: () => string;
}

export interface SaveRuntimeSnapshotInput {
  sessionSnapshot: SessionSnapshot;
  pendingBattle: PendingBattleSnapshot | null;
  activeBattle: BattleSnapshot | null;
}

export class RuntimePersistenceService {
  private readonly repository: RuntimeSnapshotRepository;
  private readonly now: () => string;

  public constructor(dependencies: RuntimePersistenceServiceDependencies) {
    this.repository = dependencies.repository;
    this.now = dependencies.now ?? (() => new Date().toISOString());
  }

  public saveCurrent(
    input: SaveRuntimeSnapshotInput,
  ): Promise<void> {
    const record: RuntimeSnapshotRecord = {
      id: "current",
      updatedAt: this.now(),
      sessionSnapshot: input.sessionSnapshot,
      pendingBattle: toJsonData(input.pendingBattle),
      activeBattle: toJsonData(input.activeBattle),
    };

    return this.repository.saveCurrent(record);
  }
}

function toJsonData<T>(value: T): T {
  if (value == null) {
    return value;
  }

  return JSON.parse(JSON.stringify(value)) as T;
}
