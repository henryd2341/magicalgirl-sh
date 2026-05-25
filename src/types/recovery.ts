import type { SessionSnapshot } from "@/engine/sessionManager";
import type { BattleSnapshot, PendingBattleSnapshot } from "@/types/battle";
import type { ChatMessage } from "@/types/chat";
import type { VariableValueRecord } from "@/types/variables";

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
  snapshotVersion: 1;
  createdAt: string;
  reason: string;
  contextVersion?: number;
  stateHash?: string;
  sessionSnapshot: SessionSnapshot;
  variableValue: VariableValueRecord | null;
  chatMessages: ChatMessage[];
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
