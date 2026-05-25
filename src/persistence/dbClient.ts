/* eslint-disable no-unused-vars */

import type {
  DbInitResult,
  DbWorkerEndpoint,
  DbWorkerRequest,
  DbWorkerResponse,
  TestRecordRow,
} from "@/persistence/dbProtocol";
import type { ChatMessage } from "@/types/chat";
import type {
  VariableChangeLogRecord,
  VariableValueRecord,
} from "@/types/variables";
import type { WorldInfoEntry } from "@/persistence/repositories/worldInfoRepository";
import type { FullSaveExportV1 } from "@/persistence/exportSave";
import type { SaveSlotRecord } from "@/persistence/saveSlotTypes";
import type {
  CheckpointKind,
  CheckpointSnapshotRecord,
  EventLogRecord,
  SaveMetaRecord,
} from "@/types/recovery";

export class DbWorkerClient {
  private readonly endpoint: DbWorkerEndpoint;

  public constructor(endpoint: DbWorkerEndpoint) {
    this.endpoint = endpoint;
  }

  public async initialize(): Promise<DbInitResult> {
    const response = await this.dispatch({ type: "initialize" });

    if (response.type !== "initialize_result") {
      throw new Error(
        `Unexpected response type for initialize: ${response.type}`,
      );
    }

    return response.payload;
  }

  public async insertTestRecord(record: TestRecordRow): Promise<void> {
    const response = await this.dispatch({
      type: "insert_test_record",
      payload: record,
    });

    if (response.type !== "insert_test_record_result") {
      throw new Error(`Unexpected response type for insert: ${response.type}`);
    }
  }

  public async listTestRecords(): Promise<TestRecordRow[]> {
    const response = await this.dispatch({ type: "list_test_records" });

    if (response.type !== "list_test_records_result") {
      throw new Error(`Unexpected response type for list: ${response.type}`);
    }

    return response.payload;
  }

  public async saveChatMessage(message: ChatMessage): Promise<void> {
    const response = await this.dispatch({
      type: "save_chat_message",
      payload: message,
    });

    if (response.type !== "save_chat_message_result") {
      throw new Error(
        `Unexpected response type for saveChatMessage: ${response.type}`,
      );
    }
  }

  public async getChatMessageById(id: string): Promise<ChatMessage | null> {
    const response = await this.dispatch({
      type: "get_chat_message_by_id",
      payload: { id },
    });

    if (response.type !== "get_chat_message_by_id_result") {
      throw new Error(
        `Unexpected response type for getChatMessageById: ${response.type}`,
      );
    }

    return response.payload;
  }

  public async listChatMessages(): Promise<ChatMessage[]> {
    const response = await this.dispatch({ type: "list_chat_messages" });

    if (response.type !== "list_chat_messages_result") {
      throw new Error(
        `Unexpected response type for listChatMessages: ${response.type}`,
      );
    }

    return response.payload;
  }

  public async replaceChatMessages(messages: ChatMessage[]): Promise<void> {
    const response = await this.dispatch({
      type: "replace_chat_messages",
      payload: messages,
    });

    if (response.type !== "replace_chat_messages_result") {
      throw new Error(
        `Unexpected response type for replaceChatMessages: ${response.type}`,
      );
    }
  }

  public async saveCurrentVariableValue(
    record: VariableValueRecord,
  ): Promise<void> {
    const response = await this.dispatch({
      type: "save_current_variable_value",
      payload: record,
    });

    if (response.type !== "save_current_variable_value_result") {
      throw new Error(
        `Unexpected response type for saveCurrentVariableValue: ${response.type}`,
      );
    }
  }

  public async getCurrentVariableValue(): Promise<VariableValueRecord | null> {
    const response = await this.dispatch({
      type: "get_current_variable_value",
    });

    if (response.type !== "get_current_variable_value_result") {
      throw new Error(
        `Unexpected response type for getCurrentVariableValue: ${response.type}`,
      );
    }

    return response.payload;
  }

  public async appendVariableChangeLog(
    record: VariableChangeLogRecord,
  ): Promise<void> {
    const response = await this.dispatch({
      type: "append_variable_change_log",
      payload: record,
    });

    if (response.type !== "append_variable_change_log_result") {
      throw new Error(
        `Unexpected response type for appendVariableChangeLog: ${response.type}`,
      );
    }
  }

  public async listVariableChangeLogs(): Promise<VariableChangeLogRecord[]> {
    const response = await this.dispatch({
      type: "list_variable_change_logs",
    });

    if (response.type !== "list_variable_change_logs_result") {
      throw new Error(
        `Unexpected response type for listVariableChangeLogs: ${response.type}`,
      );
    }

    return response.payload;
  }

  public async saveWorldInfoEntry(entry: WorldInfoEntry): Promise<void> {
    const response = await this.dispatch({
      type: "save_world_info_entry",
      payload: entry,
    });

    if (response.type !== "save_world_info_entry_result") {
      throw new Error(
        `Unexpected response type for saveWorldInfoEntry: ${response.type}`,
      );
    }
  }

  public async listWorldInfoEntries(): Promise<WorldInfoEntry[]> {
    const response = await this.dispatch({
      type: "list_world_info_entries",
    });

    if (response.type !== "list_world_info_entries_result") {
      throw new Error(
        `Unexpected response type for listWorldInfoEntries: ${response.type}`,
      );
    }

    return response.payload;
  }

  public async saveCheckpointSnapshot(
    record: CheckpointSnapshotRecord,
  ): Promise<void> {
    const response = await this.dispatch({
      type: "save_checkpoint_snapshot",
      payload: record,
    });

    if (response.type !== "save_checkpoint_snapshot_result") {
      throw new Error(
        `Unexpected response type for saveCheckpointSnapshot: ${response.type}`,
      );
    }
  }

  public async listCheckpointSnapshots(): Promise<
    CheckpointSnapshotRecord[]
  > {
    const response = await this.dispatch({
      type: "list_checkpoint_snapshots",
    });

    if (response.type !== "list_checkpoint_snapshots_result") {
      throw new Error(
        `Unexpected response type for listCheckpointSnapshots: ${response.type}`,
      );
    }

    return response.payload;
  }

  public async getLatestCheckpointSnapshotByKind(
    kind: CheckpointKind,
  ): Promise<CheckpointSnapshotRecord | null> {
    const response = await this.dispatch({
      type: "get_latest_checkpoint_snapshot_by_kind",
      payload: {
        kind,
      },
    });

    if (response.type !== "get_latest_checkpoint_snapshot_by_kind_result") {
      throw new Error(
        `Unexpected response type for getLatestCheckpointSnapshotByKind: ${response.type}`,
      );
    }

    return response.payload;
  }

  public async appendEventLog(record: EventLogRecord): Promise<void> {
    const response = await this.dispatch({
      type: "append_event_log",
      payload: record,
    });

    if (response.type !== "append_event_log_result") {
      throw new Error(
        `Unexpected response type for appendEventLog: ${response.type}`,
      );
    }
  }

  public async listEventLogs(): Promise<EventLogRecord[]> {
    const response = await this.dispatch({
      type: "list_event_logs",
    });

    if (response.type !== "list_event_logs_result") {
      throw new Error(
        `Unexpected response type for listEventLogs: ${response.type}`,
      );
    }

    return response.payload;
  }

  public async saveSaveMeta(record: SaveMetaRecord): Promise<void> {
    const response = await this.dispatch({
      type: "save_save_meta",
      payload: record,
    });

    if (response.type !== "save_save_meta_result") {
      throw new Error(
        `Unexpected response type for saveSaveMeta: ${response.type}`,
      );
    }
  }

  public async listSaveMeta(): Promise<SaveMetaRecord[]> {
    const response = await this.dispatch({
      type: "list_save_meta",
    });

    if (response.type !== "list_save_meta_result") {
      throw new Error(
        `Unexpected response type for listSaveMeta: ${response.type}`,
      );
    }

    return response.payload;
  }

  public async saveSaveSlot(record: SaveSlotRecord): Promise<void> {
    const response = await this.dispatch({
      type: "save_save_slot",
      payload: record,
    });

    if (response.type !== "save_save_slot_result") {
      throw new Error(
        `Unexpected response type for saveSaveSlot: ${response.type}`,
      );
    }
  }

  public async listSaveSlots(): Promise<SaveSlotRecord[]> {
    const response = await this.dispatch({
      type: "list_save_slots",
    });

    if (response.type !== "list_save_slots_result") {
      throw new Error(
        `Unexpected response type for listSaveSlots: ${response.type}`,
      );
    }

    return response.payload;
  }

  public async getSaveSlotById(id: string): Promise<SaveSlotRecord | null> {
    const response = await this.dispatch({
      type: "get_save_slot_by_id",
      payload: {
        id,
      },
    });

    if (response.type !== "get_save_slot_by_id_result") {
      throw new Error(
        `Unexpected response type for getSaveSlotById: ${response.type}`,
      );
    }

    return response.payload;
  }

  public async deleteSaveSlot(id: string): Promise<void> {
    const response = await this.dispatch({
      type: "delete_save_slot",
      payload: {
        id,
      },
    });

    if (response.type !== "delete_save_slot_result") {
      throw new Error(
        `Unexpected response type for deleteSaveSlot: ${response.type}`,
      );
    }
  }

  public async replaceFullSaveData(
    data: FullSaveExportV1["data"],
  ): Promise<void> {
    const response = await this.dispatch({
      type: "replace_full_save_data",
      payload: data,
    });

    if (response.type !== "replace_full_save_data_result") {
      throw new Error(
        `Unexpected response type for replaceFullSaveData: ${response.type}`,
      );
    }
  }

  private async dispatch(request: DbWorkerRequest): Promise<DbWorkerResponse> {
    const response = await this.endpoint.post(request);

    if (response.type === "error") {
      throw new Error(`[${response.payload.code}] ${response.payload.message}`);
    }

    return response;
  }
}

export interface BrowserDbWorkerLike {
  postMessage(message: unknown): void;
  addEventListener(
    type: "message",
    listener: (event: { data: unknown }) => void,
  ): void;
  removeEventListener(
    type: "message",
    listener: (event: { data: unknown }) => void,
  ): void;
}

interface DbWorkerEnvelopeRequest {
  id: string;
  request: DbWorkerRequest;
}

interface DbWorkerEnvelopeResponse {
  id: string;
  response: DbWorkerResponse;
}

function isDbWorkerEnvelopeResponse(
  value: unknown,
): value is DbWorkerEnvelopeResponse {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    "response" in value &&
    typeof (value as { id: unknown }).id === "string"
  );
}

function createCloneableWorkerRequest(request: DbWorkerRequest): DbWorkerRequest {
  return JSON.parse(JSON.stringify(request)) as DbWorkerRequest;
}

export function createBrowserDbWorkerEndpoint(
  worker: BrowserDbWorkerLike,
): DbWorkerEndpoint {
  let nextId = 0;

  return {
    post(request) {
      const id = `db-worker-request-${nextId.toString(36)}`;
      nextId += 1;

      return new Promise((resolve) => {
        const onMessage = (event: { data: unknown }) => {
          if (
            !isDbWorkerEnvelopeResponse(event.data) ||
            event.data.id !== id
          ) {
            return;
          }

          worker.removeEventListener("message", onMessage);
          resolve(event.data.response);
        };

        worker.addEventListener("message", onMessage);
        worker.postMessage({
          id,
          request: createCloneableWorkerRequest(request),
        } satisfies DbWorkerEnvelopeRequest);
      });
    },
  };
}

export function createInProcessDbWorkerEndpoint(
  endpoint: DbWorkerEndpoint,
): DbWorkerEndpoint {
  return {
    post(request) {
      return endpoint.post(request);
    },
  };
}
