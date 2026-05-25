/* eslint-disable no-unused-vars */

import type { SessionSnapshot } from "@/engine/sessionManager";
import type { ChatHistoryRepository } from "@/persistence/repositories/chatHistoryRepository";
import type { CheckpointRepository } from "@/persistence/repositories/checkpointRepository";
import type { EventLogRepository } from "@/persistence/repositories/eventLogRepository";
import type { VariableRepository } from "@/persistence/repositories/variableRepository";
import type { BattleSnapshot, PendingBattleSnapshot } from "@/types/battle";
import type {
  CheckpointKind,
  CheckpointSnapshotRecord,
  RecoveryJsonObject,
} from "@/types/recovery";

export interface CreateCheckpointInput {
  kind: CheckpointKind;
  reason: string;
  contextVersion?: number;
  stateHash?: string;
  metadata?: RecoveryJsonObject;
}

export interface CheckpointManager {
  createCheckpoint(
    input: CreateCheckpointInput,
  ): Promise<CheckpointSnapshotRecord>;
  markIdleCheckpoint(): Promise<CheckpointSnapshotRecord>;
}

export interface CheckpointManagerIdFactory {
  checkpointId: () => string;
  eventId: () => string;
}

export interface CheckpointManagerDependencies {
  checkpointRepository: CheckpointRepository;
  eventLogRepository: EventLogRepository;
  chatRepository: ChatHistoryRepository;
  variableRepository: VariableRepository;
  getSessionSnapshot: () => SessionSnapshot;
  getPendingBattle: () => PendingBattleSnapshot | null;
  getActiveBattle: () => BattleSnapshot | null;
  idFactory?: CheckpointManagerIdFactory;
  now?: () => string;
}

function defaultId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}`;
}

export function createCheckpointManager(
  dependencies: CheckpointManagerDependencies,
): CheckpointManager {
  const idFactory =
    dependencies.idFactory ??
    ({
      checkpointId: () => defaultId("checkpoint"),
      eventId: () => defaultId("event"),
    } satisfies CheckpointManagerIdFactory);
  const now = dependencies.now ?? (() => new Date().toISOString());

  async function createCheckpoint(
    input: CreateCheckpointInput,
  ): Promise<CheckpointSnapshotRecord> {
    const createdAt = now();
    const pendingBattle = dependencies.getPendingBattle();
    const activeBattle = dependencies.getActiveBattle();
    const checkpoint: CheckpointSnapshotRecord = {
      id: idFactory.checkpointId(),
      kind: input.kind,
      snapshotVersion: 1,
      createdAt,
      reason: input.reason,
      contextVersion: input.contextVersion,
      stateHash: input.stateHash,
      sessionSnapshot: dependencies.getSessionSnapshot(),
      variableValue: await dependencies.variableRepository.getCurrent(),
      chatMessages: await dependencies.chatRepository.list(),
      pendingBattle: pendingBattle ?? undefined,
      activeBattle: activeBattle ?? undefined,
      metadata: input.metadata,
    };

    await dependencies.checkpointRepository.save(checkpoint);
    await dependencies.eventLogRepository.append({
      id: idFactory.eventId(),
      type: "CheckpointCreated",
      createdAt,
      source: "checkpoint_manager",
      payload: {
        checkpointId: checkpoint.id,
        kind: checkpoint.kind,
        reason: checkpoint.reason,
        contextVersion: checkpoint.contextVersion,
        stateHash: checkpoint.stateHash,
      },
    });

    return checkpoint;
  }

  return {
    createCheckpoint,
    markIdleCheckpoint() {
      return createCheckpoint({
        kind: "idle_checkpoint",
        reason: "before_ai_request",
      });
    },
  };
}
