import type { SessionSnapshot } from "@/engine/sessionManager";
import type { BattleSnapshot, PendingBattleSnapshot } from "@/types/battle";

export type CheckpointKind =
  | "idle_checkpoint"
  | "combat_checkpoint"
  | "save_checkpoint";

export type EventLogType =
  | "RequestStarted"
  | "AssistantMessageFinalized"
  | "ToolCallValidated"
  | "VariablesUpdated"
  | "BattleTriggered"
  | "BattleResolved"
  | "CheckpointCreated"
  | "RollbackCompleted";

export type RecoveryJsonObject = Record<string, unknown>;

export interface CheckpointSnapshotRecord {
  id: string;
  kind: CheckpointKind;
  createdAt: string;
  reason: string;
  sessionSnapshot: SessionSnapshot;
  pendingBattle?: PendingBattleSnapshot;
  activeBattle?: BattleSnapshot;
  metadata?: RecoveryJsonObject;
}

export interface EventLogRecord {
  id: string;
  type: EventLogType;
  createdAt: string;
  source: string;
  payload: RecoveryJsonObject;
}

export interface SaveMetaRecord {
  id: string;
  label: string;
  createdAt: string;
  updatedAt: string;
  checkpointId: string;
}
