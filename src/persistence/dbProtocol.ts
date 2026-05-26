/* eslint-disable no-unused-vars */

import type { ChatMessage } from "@/types/chat";
import type {
  VariableChangeLogRecord,
  VariableValueRecord,
} from "@/types/variables";
import type { WorldInfoEntry } from "@/persistence/repositories/worldInfoRepository";
import type { SqliteWasmCapabilities } from "@/persistence/sqlite/sqliteWasm";
import type { FullSaveExportV1 } from "@/persistence/exportSave";
import type { SaveSlotRecord } from "@/persistence/saveSlotTypes";
import type { RuntimeSnapshotRecord } from "@/types/runtimeSnapshot";
import type {
  CheckpointKind,
  CheckpointSnapshotRecord,
  EventLogRecord,
  SaveMetaRecord,
} from "@/types/recovery";

export interface TestRecordRow {
  id: string;
  label: string;
  createdAt: string;
}

export interface DbInitResult {
  ready: true;
  schemaVersion: number;
  availableTables: string[];
  appliedMigrations: string[];
  sqliteCapabilities?: SqliteWasmCapabilities;
}

export interface DbWorkerErrorPayload {
  code: "DB_WORKER_NOT_READY" | "DB_WORKER_UNKNOWN_REQUEST";
  message: string;
}

export interface DbWorkerStateSnapshot {
  migrations: Set<string>;
  tables: Set<string>;
  initialized: boolean;
  testRecords: Map<string, TestRecordRow>;
  chatHistory: Map<string, ChatMessage>;
  variableValue: VariableValueRecord | null;
  variableChangeLog: Map<string, VariableChangeLogRecord>;
  worldInfo: Map<string, WorldInfoEntry>;
  checkpointSnapshots: Map<string, CheckpointSnapshotRecord>;
  eventLog: Map<string, EventLogRecord>;
  saveMeta: Map<string, SaveMetaRecord>;
  saveSlots: Map<string, SaveSlotRecord>;
  runtimeSnapshot: RuntimeSnapshotRecord | null;
}

export type DbWorkerRequest =
  | {
      type: "initialize";
    }
  | {
      type: "insert_test_record";
      payload: TestRecordRow;
    }
  | {
      type: "list_test_records";
    }
  | {
      type: "save_chat_message";
      payload: ChatMessage;
    }
  | {
      type: "get_chat_message_by_id";
      payload: {
        id: string;
      };
    }
  | {
      type: "list_chat_messages";
    }
  | {
      type: "replace_chat_messages";
      payload: ChatMessage[];
    }
  | {
      type: "save_current_variable_value";
      payload: VariableValueRecord;
    }
  | {
      type: "get_current_variable_value";
    }
  | {
      type: "append_variable_change_log";
      payload: VariableChangeLogRecord;
    }
  | {
      type: "list_variable_change_logs";
    }
  | {
      type: "save_world_info_entry";
      payload: WorldInfoEntry;
    }
  | {
      type: "list_world_info_entries";
    }
  | {
      type: "save_checkpoint_snapshot";
      payload: CheckpointSnapshotRecord;
    }
  | {
      type: "list_checkpoint_snapshots";
    }
  | {
      type: "get_latest_checkpoint_snapshot_by_kind";
      payload: {
        kind: CheckpointKind;
      };
    }
  | {
      type: "append_event_log";
      payload: EventLogRecord;
    }
  | {
      type: "list_event_logs";
    }
  | {
      type: "save_save_meta";
      payload: SaveMetaRecord;
    }
  | {
      type: "list_save_meta";
    }
  | {
      type: "save_save_slot";
      payload: SaveSlotRecord;
    }
  | {
      type: "list_save_slots";
    }
  | {
      type: "get_save_slot_by_id";
      payload: {
        id: string;
      };
    }
  | {
      type: "delete_save_slot";
      payload: {
        id: string;
      };
    }
  | {
      type: "replace_full_save_data";
      payload: FullSaveExportV1["data"];
    }
  | {
      type: "save_runtime_snapshot";
      payload: RuntimeSnapshotRecord;
    }
  | {
      type: "get_runtime_snapshot";
    }
  | {
      type: "clear_runtime_snapshot";
    };

export type DbWorkerSuccessResponse =
  | {
      type: "initialize_result";
      payload: DbInitResult;
    }
  | {
      type: "insert_test_record_result";
      payload: {
        insertedId: string;
      };
    }
  | {
      type: "list_test_records_result";
      payload: TestRecordRow[];
    }
  | {
      type: "save_chat_message_result";
      payload: {
        savedId: string;
      };
    }
  | {
      type: "get_chat_message_by_id_result";
      payload: ChatMessage | null;
    }
  | {
      type: "list_chat_messages_result";
      payload: ChatMessage[];
    }
  | {
      type: "replace_chat_messages_result";
      payload: {
        replacedCount: number;
      };
    }
  | {
      type: "save_current_variable_value_result";
      payload: {
        savedRootId: string;
      };
    }
  | {
      type: "get_current_variable_value_result";
      payload: VariableValueRecord | null;
    }
  | {
      type: "append_variable_change_log_result";
      payload: {
        savedChangeId: string;
      };
    }
  | {
      type: "list_variable_change_logs_result";
      payload: VariableChangeLogRecord[];
    }
  | {
      type: "save_world_info_entry_result";
      payload: {
        savedId: string;
      };
    }
  | {
      type: "list_world_info_entries_result";
      payload: WorldInfoEntry[];
    }
  | {
      type: "save_checkpoint_snapshot_result";
      payload: {
        savedId: string;
      };
    }
  | {
      type: "list_checkpoint_snapshots_result";
      payload: CheckpointSnapshotRecord[];
    }
  | {
      type: "get_latest_checkpoint_snapshot_by_kind_result";
      payload: CheckpointSnapshotRecord | null;
    }
  | {
      type: "append_event_log_result";
      payload: {
        savedId: string;
      };
    }
  | {
      type: "list_event_logs_result";
      payload: EventLogRecord[];
    }
  | {
      type: "save_save_meta_result";
      payload: {
        savedId: string;
      };
    }
  | {
      type: "list_save_meta_result";
      payload: SaveMetaRecord[];
    }
  | {
      type: "save_save_slot_result";
      payload: {
        savedId: string;
      };
    }
  | {
      type: "list_save_slots_result";
      payload: SaveSlotRecord[];
    }
  | {
      type: "get_save_slot_by_id_result";
      payload: SaveSlotRecord | null;
    }
  | {
      type: "delete_save_slot_result";
      payload: {
        deletedId: string;
      };
    }
  | {
      type: "replace_full_save_data_result";
      payload: {
        checkpointCount: number;
        chatMessageCount: number;
      };
    }
  | {
      type: "save_runtime_snapshot_result";
      payload: {
        savedId: RuntimeSnapshotRecord["id"];
      };
    }
  | {
      type: "get_runtime_snapshot_result";
      payload: RuntimeSnapshotRecord | null;
    }
  | {
      type: "clear_runtime_snapshot_result";
    };

export type DbWorkerErrorResponse = {
  type: "error";
  payload: DbWorkerErrorPayload;
};

export type DbWorkerResponse = DbWorkerSuccessResponse | DbWorkerErrorResponse;

export interface DbWorkerEndpoint {
  post: (request: DbWorkerRequest) => Promise<DbWorkerResponse>;
}
