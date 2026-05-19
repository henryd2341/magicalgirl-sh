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
  };
}

function createErrorResponse(payload: DbWorkerErrorPayload): DbWorkerResponse {
  return {
    type: "error",
    payload,
  };
}

function ensureInitialized(
  state: DbWorkerStateSnapshot,
): DbWorkerResponse | null {
  if (state.initialized) {
    return null;
  }

  return createErrorResponse({
    code: "DB_WORKER_NOT_READY",
    message: "Database worker must be initialized before writes.",
  });
}

export function createDbWorkerRuntime(): DbWorkerRuntime {
  const state = createInitialState();

  return {
    async post(request: DbWorkerRequest): Promise<DbWorkerResponse> {
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
          const maybeError = ensureInitialized(state);
          if (maybeError) {
            return maybeError;
          }

          state.testRecords.set(request.payload.id, request.payload);
          return {
            type: "insert_test_record_result",
            payload: {
              insertedId: request.payload.id,
            },
          };
        }

        case "list_test_records": {
          const maybeError = ensureInitialized(state);
          if (maybeError) {
            return maybeError;
          }

          return {
            type: "list_test_records_result",
            payload: [...state.testRecords.values()],
          };
        }

        case "save_chat_message": {
          const maybeError = ensureInitialized(state);
          if (maybeError) {
            return maybeError;
          }

          state.chatHistory.set(request.payload.id, { ...request.payload });
          return {
            type: "save_chat_message_result",
            payload: {
              savedId: request.payload.id,
            },
          };
        }

        case "get_chat_message_by_id": {
          const maybeError = ensureInitialized(state);
          if (maybeError) {
            return maybeError;
          }

          const message = state.chatHistory.get(request.payload.id);
          return {
            type: "get_chat_message_by_id_result",
            payload: message ? { ...message } : null,
          };
        }

        case "list_chat_messages": {
          const maybeError = ensureInitialized(state);
          if (maybeError) {
            return maybeError;
          }

          return {
            type: "list_chat_messages_result",
            payload: [...state.chatHistory.values()].map((message) => ({
              ...message,
            })),
          };
        }
      }
    },
    getState() {
      return state;
    },
  };
}
