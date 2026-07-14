import type { RuntimeSnapshotRepository } from "@/persistence/repositories/runtimeSnapshotRepository";
import type { BattleSnapshot, PendingBattleSnapshot } from "@/types/battle";
import type { RuntimeSnapshotRecord } from "@/types/runtimeSnapshot";
import type { SessionSnapshot } from "@/engine/sessionManager";
import { hasBossProfile } from "@/engine/battle/boss/bossRegistry";
import { MAX_BOSS_DECISION_STEPS } from "@/engine/battle/boss/bossOrchestrator";

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

function isPureJsonValue(
  value: unknown,
  seen: Set<object> = new Set(),
): boolean {
  if (
    value == null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return true;
  }
  if (typeof value === "number") {
    return Number.isFinite(value);
  }
  if (typeof value !== "object" || seen.has(value)) {
    return false;
  }
  seen.add(value);

  if (Array.isArray(value)) {
    return value.every((entry) => isPureJsonValue(entry, seen));
  }
  if (Object.getPrototypeOf(value) !== Object.prototype) {
    return false;
  }
  return Object.values(value as Record<string, unknown>).every((entry) =>
    isPureJsonValue(entry, seen),
  );
}

export function validateBossRuntimeSnapshot(
  snapshot: BattleSnapshot,
): boolean {
  const runtime = snapshot.bossRuntime;
  if (runtime == null) {
    return true;
  }
  if (!isPureJsonValue(runtime)) {
    return false;
  }
  if (
    !Number.isInteger(runtime.decisionSteps) ||
    runtime.decisionSteps < 0 ||
    runtime.decisionSteps > MAX_BOSS_DECISION_STEPS
  ) {
    return false;
  }

  const participantIds = new Set(
    snapshot.participants.map((participant) => participant.id),
  );
  const actorIdRecords = [
    runtime.profileIds,
    runtime.phaseByActorId,
    runtime.queuedCounters,
  ];
  if (
    actorIdRecords.some((record) =>
      Object.keys(record).some((actorId) => !participantIds.has(actorId)),
    )
  ) {
    return false;
  }
  if (
    Object.values(runtime.profileIds).some(
      (profileId) => !hasBossProfile(profileId),
    )
  ) {
    return false;
  }
  if (
    Object.values(runtime.cooldowns).some(
      (turns) => !Number.isFinite(turns) || turns < 0,
    ) ||
    Object.values(runtime.counters).some(
      (value) => !Number.isFinite(value),
    )
  ) {
    return false;
  }

  return true;
}

export function sanitizeRuntimeSnapshot(
  input: SaveRuntimeSnapshotInput,
): SaveRuntimeSnapshotInput {
  if (
    isTrainingSource(input.pendingBattle) ||
    isTrainingSource(input.activeBattle)
  ) {
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

  if (
    input.activeBattle != null &&
    !validateBossRuntimeSnapshot(input.activeBattle)
  ) {
    throw new Error("[BOSS_RUNTIME_INVALID] Runtime snapshot is corrupt.");
  }

  return input;
}

function toJsonData<T>(value: T): T {
  if (value == null) {
    return value;
  }

  return JSON.parse(JSON.stringify(value)) as T;
}
