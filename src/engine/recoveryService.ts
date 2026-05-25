/* eslint-disable no-unused-vars */

import type { SessionSnapshot } from "@/engine/sessionManager";
import type { ChatHistoryRepository } from "@/persistence/repositories/chatHistoryRepository";
import type { CheckpointRepository } from "@/persistence/repositories/checkpointRepository";
import type { EventLogRepository } from "@/persistence/repositories/eventLogRepository";
import type { VariableRepository } from "@/persistence/repositories/variableRepository";
import type { BattleSnapshot, PendingBattleSnapshot } from "@/types/battle";
import type { CheckpointKind } from "@/types/recovery";

export interface RecoveryServiceIdFactory {
  eventId: () => string;
}

export interface RestoreBattleSnapshotInput {
  pendingBattle?: PendingBattleSnapshot;
  activeBattle?: BattleSnapshot;
}

export interface RecoveryServiceDependencies {
  checkpointRepository: CheckpointRepository;
  eventLogRepository: EventLogRepository;
  chatRepository: ChatHistoryRepository;
  variableRepository: VariableRepository;
  restoreSessionSnapshot: (snapshot: SessionSnapshot) => void;
  restoreBattleSnapshot?: (input: RestoreBattleSnapshotInput) => void;
  idFactory?: RecoveryServiceIdFactory;
  now?: () => string;
}

export interface RollbackResult {
  ok: true;
  checkpointId: string;
}

function defaultId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}`;
}

export class RecoveryService {
  private readonly checkpointRepository: CheckpointRepository;

  private readonly eventLogRepository: EventLogRepository;

  private readonly chatRepository: ChatHistoryRepository;

  private readonly variableRepository: VariableRepository;

  private readonly restoreSessionSnapshot: (snapshot: SessionSnapshot) => void;

  private readonly restoreBattleSnapshot:
    | ((input: RestoreBattleSnapshotInput) => void)
    | undefined;

  private readonly idFactory: RecoveryServiceIdFactory;

  private readonly now: () => string;

  public constructor(dependencies: RecoveryServiceDependencies) {
    this.checkpointRepository = dependencies.checkpointRepository;
    this.eventLogRepository = dependencies.eventLogRepository;
    this.chatRepository = dependencies.chatRepository;
    this.variableRepository = dependencies.variableRepository;
    this.restoreSessionSnapshot = dependencies.restoreSessionSnapshot;
    this.restoreBattleSnapshot = dependencies.restoreBattleSnapshot;
    this.idFactory =
      dependencies.idFactory ??
      ({
        eventId: () => defaultId("event"),
      } satisfies RecoveryServiceIdFactory);
    this.now = dependencies.now ?? (() => new Date().toISOString());
  }

  public async rollbackToLatest(kind: CheckpointKind): Promise<RollbackResult> {
    const checkpoint = await this.checkpointRepository.getLatestByKind(kind);
    if (checkpoint === null) {
      throw new Error(`[CHECKPOINT_NOT_FOUND] No checkpoint found for kind: ${kind}.`);
    }

    if (checkpoint.variableValue !== null) {
      await this.variableRepository.saveCurrent(checkpoint.variableValue);
    }

    await this.chatRepository.replaceAll(checkpoint.chatMessages);
    this.restoreSessionSnapshot(checkpoint.sessionSnapshot);
    this.restoreBattleSnapshot?.({
      pendingBattle: checkpoint.pendingBattle,
      activeBattle: checkpoint.activeBattle,
    });

    await this.eventLogRepository.append({
      id: this.idFactory.eventId(),
      type: "RollbackCompleted",
      createdAt: this.now(),
      source: "recovery_service",
      payload: {
        checkpointId: checkpoint.id,
        kind: checkpoint.kind,
      },
    });

    return {
      ok: true,
      checkpointId: checkpoint.id,
    };
  }
}
