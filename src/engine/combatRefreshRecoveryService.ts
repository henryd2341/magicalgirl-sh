/* eslint-disable no-unused-vars */

import type { SessionSnapshot } from "@/engine/sessionManager";
import type { ChatHistoryRepository } from "@/persistence/repositories/chatHistoryRepository";
import type { CheckpointRepository } from "@/persistence/repositories/checkpointRepository";
import type { EventLogRepository } from "@/persistence/repositories/eventLogRepository";
import type { VariableRepository } from "@/persistence/repositories/variableRepository";
import type { BattleSnapshot, PendingBattleSnapshot } from "@/types/battle";
import type { CheckpointSnapshotRecord } from "@/types/recovery";

const RECOVERY_REASON = "combat_refresh_safe_rollback";
const RECOVERY_MESSAGE = "检测到战斗中刷新，已回滚到战斗前安全状态。";

export type CombatRefreshRecoveryMode = "rolled_back" | "safe_reset" | "noop";

export interface CombatRefreshRecoveryResult {
  recovered: boolean;
  mode: CombatRefreshRecoveryMode;
  checkpointId?: string;
}

export interface CombatRefreshRecoveryIdFactory {
  eventId: () => string;
}

export interface CombatRefreshRecoveryDependencies {
  checkpointRepository: CheckpointRepository;
  eventLogRepository: EventLogRepository;
  chatRepository: ChatHistoryRepository;
  variableRepository: VariableRepository;
  restoreSessionSnapshot: (snapshot: SessionSnapshot) => void;
  resetSessionToIdle: () => void;
  restoreBattleSnapshot: (input: {
    pendingBattle?: PendingBattleSnapshot;
    activeBattle?: BattleSnapshot;
  }) => void;
  idFactory?: CombatRefreshRecoveryIdFactory;
  now?: () => string;
}

function defaultId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}`;
}

function isInterruptedCombatCheckpoint(
  checkpoint: CheckpointSnapshotRecord,
): boolean {
  if (
    checkpoint.sessionSnapshot.sessionState !== "COMBAT_PENDING" &&
    checkpoint.sessionSnapshot.sessionState !== "IN_COMBAT"
  ) {
    return false;
  }

  if (
    checkpoint.metadata?.refreshRecoveryResolved === true ||
    checkpoint.metadata?.resolved === true ||
    checkpoint.metadata?.finished === true
  ) {
    return false;
  }

  return checkpoint.activeBattle?.lifecycleState !== "RESOLVED";
}

export class CombatRefreshRecoveryService {
  private readonly checkpointRepository: CheckpointRepository;

  private readonly eventLogRepository: EventLogRepository;

  private readonly chatRepository: ChatHistoryRepository;

  private readonly variableRepository: VariableRepository;

  private readonly restoreSessionSnapshot: (snapshot: SessionSnapshot) => void;

  private readonly resetSessionToIdle: () => void;

  private readonly restoreBattleSnapshot: (input: {
    pendingBattle?: PendingBattleSnapshot;
    activeBattle?: BattleSnapshot;
  }) => void;

  private readonly idFactory: CombatRefreshRecoveryIdFactory;

  private readonly now: () => string;

  public constructor(dependencies: CombatRefreshRecoveryDependencies) {
    this.checkpointRepository = dependencies.checkpointRepository;
    this.eventLogRepository = dependencies.eventLogRepository;
    this.chatRepository = dependencies.chatRepository;
    this.variableRepository = dependencies.variableRepository;
    this.restoreSessionSnapshot = dependencies.restoreSessionSnapshot;
    this.resetSessionToIdle = dependencies.resetSessionToIdle;
    this.restoreBattleSnapshot = dependencies.restoreBattleSnapshot;
    this.idFactory =
      dependencies.idFactory ??
      ({
        eventId: () => defaultId("event"),
      } satisfies CombatRefreshRecoveryIdFactory);
    this.now = dependencies.now ?? (() => new Date().toISOString());
  }

  public async recoverFromInterruptedCombat(): Promise<CombatRefreshRecoveryResult> {
    const combatCheckpoint =
      await this.checkpointRepository.getLatestByKind("combat_checkpoint");

    if (
      combatCheckpoint === null ||
      !isInterruptedCombatCheckpoint(combatCheckpoint)
    ) {
      return {
        recovered: false,
        mode: "noop",
      };
    }

    const idleCheckpoint =
      await this.checkpointRepository.getLatestByKind("idle_checkpoint");

    if (idleCheckpoint) {
      await this.rollbackToIdleCheckpoint(combatCheckpoint, idleCheckpoint);
      return {
        recovered: true,
        mode: "rolled_back",
        checkpointId: combatCheckpoint.id,
      };
    }

    await this.safeReset(combatCheckpoint);
    return {
      recovered: true,
      mode: "safe_reset",
      checkpointId: combatCheckpoint.id,
    };
  }

  private async rollbackToIdleCheckpoint(
    combatCheckpoint: CheckpointSnapshotRecord,
    idleCheckpoint: CheckpointSnapshotRecord,
  ): Promise<void> {
    if (idleCheckpoint.variableValue !== null) {
      await this.variableRepository.saveCurrent(idleCheckpoint.variableValue);
    }

    await this.chatRepository.replaceAll(idleCheckpoint.chatMessages);
    this.resetSessionToIdle();
    this.restoreBattleSnapshot({
      pendingBattle: idleCheckpoint.pendingBattle,
      activeBattle: idleCheckpoint.activeBattle,
    });
    window.alert(RECOVERY_MESSAGE);
    await this.appendRollbackEvent({
      combatCheckpoint,
      rollbackCheckpoint: idleCheckpoint,
      mode: "rolled_back",
    });
    await this.markCombatCheckpointResolved(combatCheckpoint, "rolled_back");
  }

  private async safeReset(
    combatCheckpoint: CheckpointSnapshotRecord,
  ): Promise<void> {
    this.resetSessionToIdle();
    this.restoreBattleSnapshot({
      pendingBattle: undefined,
      activeBattle: undefined,
    });
    window.alert(RECOVERY_MESSAGE);
    await this.appendRollbackEvent({
      combatCheckpoint,
      rollbackCheckpoint: null,
      mode: "safe_reset",
    });
    await this.markCombatCheckpointResolved(combatCheckpoint, "safe_reset");
  }

  private async appendRollbackEvent(input: {
    combatCheckpoint: CheckpointSnapshotRecord;
    rollbackCheckpoint: CheckpointSnapshotRecord | null;
    mode: "rolled_back" | "safe_reset";
  }): Promise<void> {
    await this.eventLogRepository.append({
      id: this.idFactory.eventId(),
      type: "RollbackCompleted",
      createdAt: this.now(),
      source: "combat_refresh_recovery_service",
      payload: {
        checkpointId: input.rollbackCheckpoint?.id ?? input.combatCheckpoint.id,
        kind: input.rollbackCheckpoint?.kind ?? input.combatCheckpoint.kind,
        combatCheckpointId: input.combatCheckpoint.id,
        reason: RECOVERY_REASON,
        mode: input.mode,
      },
    });
  }

  private async markCombatCheckpointResolved(
    combatCheckpoint: CheckpointSnapshotRecord,
    mode: "rolled_back" | "safe_reset",
  ): Promise<void> {
    await this.checkpointRepository.save({
      ...combatCheckpoint,
      metadata: {
        ...combatCheckpoint.metadata,
        refreshRecoveryResolved: true,
        refreshRecoveryMode: mode,
        refreshRecoveryResolvedAt: this.now(),
      },
    });
  }
}
