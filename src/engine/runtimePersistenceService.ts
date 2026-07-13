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
    const sanitized = sanitizeRuntimeSnapshot(input);
    const record: RuntimeSnapshotRecord = {
      id: "current",
      updatedAt: this.now(),
      sessionSnapshot: sanitized.sessionSnapshot,
      pendingBattle: toJsonData(sanitized.pendingBattle),
      activeBattle: toJsonData(sanitized.activeBattle),
    };

    return this.repository.saveCurrent(record);
  }
}

function isTrainingSource(
  battle: PendingBattleSnapshot | BattleSnapshot | null,
): boolean {
  return (
    battle?.source === "training/free" ||
    battle?.source === "training/challenge"
  );
}

export function sanitizeRuntimeSnapshot(
  input: SaveRuntimeSnapshotInput,
): SaveRuntimeSnapshotInput {
  if (
    !isTrainingSource(input.pendingBattle) &&
    !isTrainingSource(input.activeBattle)
  ) {
    return input;
  }

  return {
    sessionSnapshot: {
      sessionState: "IDLE",
      pipelineState: null,
      activeRequestId: null,
    },
    pendingBattle: null,
    activeBattle: null,
  };
}

function toJsonData<T>(value: T): T {
  if (value == null) {
    return value;
  }

  return JSON.parse(JSON.stringify(value)) as T;
}
