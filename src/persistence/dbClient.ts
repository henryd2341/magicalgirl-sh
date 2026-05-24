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

  private async dispatch(request: DbWorkerRequest): Promise<DbWorkerResponse> {
    const response = await this.endpoint.post(request);

    if (response.type === "error") {
      throw new Error(`[${response.payload.code}] ${response.payload.message}`);
    }

    return response;
  }
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
