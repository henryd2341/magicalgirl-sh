import type {
  DbInitResult,
  DbWorkerEndpoint,
  DbWorkerErrorPayload,
  DbWorkerRequest,
  DbWorkerResponse,
  DbWorkerStateSnapshot,
} from "@/persistence/dbProtocol";
import { runMigrations } from "@/persistence/migrationRunner";
import { DB_SCHEMA_VERSION } from "@/persistence/schema";
import { deepClone } from "@/utils/deepClone";

export interface DbWorkerRuntime extends DbWorkerEndpoint {
  getState(): Readonly<DbWorkerStateSnapshot>;
}

function createInitialState(): DbWorkerStateSnapshot {
  return {
    migrations: new Set(),
    tables: new Set(),
    initialized: false,
    testRecords: new Map(),
    chatHistory: new Map(),
    variableValue: null,
    variableChangeLog: new Map(),
    worldInfo: new Map(),
  };
}

function createErrorResponse(payload: DbWorkerErrorPayload): DbWorkerResponse {
  return {
    type: "error",
    payload,
  };
}

export function createDbWorkerRuntime(): DbWorkerRuntime {
  const state = createInitialState();

  return {
    async post(request: DbWorkerRequest): Promise<DbWorkerResponse> {
      if (request.type !== "initialize" && !state.initialized) {
        return createErrorResponse({
          code: "DB_WORKER_NOT_READY",
          message: "Database worker must be initialized before writes.",
        });
      }

      switch (request.type) {
        case "initialize": {
          const appliedMigrations = runMigrations(state);
          state.initialized = true;

          const payload: DbInitResult = {
            ready: true,
            schemaVersion: DB_SCHEMA_VERSION,
            availableTables: [...state.tables.values()],
            appliedMigrations,
          };

          return {
            type: "initialize_result",
            payload,
          };
        }

        case "insert_test_record": {
          state.testRecords.set(request.payload.id, request.payload);
          return {
            type: "insert_test_record_result",
            payload: {
              insertedId: request.payload.id,
            },
          };
        }

        case "list_test_records": {
          return {
            type: "list_test_records_result",
            payload: [...state.testRecords.values()],
          };
        }

        case "save_chat_message": {
          state.chatHistory.set(request.payload.id, { ...request.payload });
          return {
            type: "save_chat_message_result",
            payload: {
              savedId: request.payload.id,
            },
          };
        }

        case "get_chat_message_by_id": {
          const message = state.chatHistory.get(request.payload.id);
          return {
            type: "get_chat_message_by_id_result",
            payload: message ? { ...message } : null,
          };
        }

        case "list_chat_messages": {
          return {
            type: "list_chat_messages_result",
            payload: [...state.chatHistory.values()].map((message) => ({
              ...message,
            })),
          };
        }

        case "save_current_variable_value": {
          state.variableValue = deepClone(request.payload);
          return {
            type: "save_current_variable_value_result",
            payload: {
              savedRootId: request.payload.rootId,
            },
          };
        }

        case "get_current_variable_value": {
          return {
            type: "get_current_variable_value_result",
            payload: state.variableValue
              ? deepClone(state.variableValue)
              : null,
          };
        }

        case "append_variable_change_log": {
          state.variableChangeLog.set(
            request.payload.id,
            deepClone(request.payload),
          );
          return {
            type: "append_variable_change_log_result",
            payload: {
              savedChangeId: request.payload.id,
            },
          };
        }

        case "list_variable_change_logs": {
          return {
            type: "list_variable_change_logs_result",
            payload: [...state.variableChangeLog.values()].map((record) =>
              deepClone(record),
            ),
          };
        }

        case "save_world_info_entry": {
          state.worldInfo.set(request.payload.id, deepClone(request.payload));
          return {
            type: "save_world_info_entry_result",
            payload: {
              savedId: request.payload.id,
            },
          };
        }

        case "list_world_info_entries": {
          return {
            type: "list_world_info_entries_result",
            payload: [...state.worldInfo.values()].map((entry) =>
              deepClone(entry),
            ),
          };
        }
      }
    },
    getState() {
      return state;
    },
  };
}
