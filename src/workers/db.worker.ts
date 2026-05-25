import type {
  DbInitResult,
  DbWorkerEndpoint,
  DbWorkerErrorPayload,
  DbWorkerRequest,
  DbWorkerResponse,
  DbWorkerStateSnapshot,
} from "@/persistence/dbProtocol";
import { runMigrations } from "@/persistence/migrationRunner";
import {
  createTransientSqliteDatabase,
  type SqliteDatabase,
} from "@/persistence/sqlite/sqliteWasm";
import { DB_SCHEMA_VERSION } from "@/persistence/schema";
import type {
  CheckpointKind,
  CheckpointSnapshotRecord,
  EventLogRecord,
  SaveMetaRecord,
} from "@/types/recovery";
import { deepClone } from "@/utils/deepClone";

export interface DbWorkerRuntime extends DbWorkerEndpoint {
  getState(): Readonly<DbWorkerStateSnapshot>;
}

interface DbWorkerRuntimeState extends DbWorkerStateSnapshot {
  sqliteDatabase: SqliteDatabase | null;
}

interface CheckpointSnapshotRow extends Record<string, unknown> {
  id: string;
  kind: CheckpointKind;
  created_at: string;
  reason: string;
  snapshot_json: string;
  session_snapshot_json: string;
  pending_battle_json: string | null;
  active_battle_json: string | null;
  metadata_json: string | null;
}

interface EventLogRow extends Record<string, unknown> {
  id: string;
  type: EventLogRecord["type"];
  created_at: string;
  source: string;
  payload_json: string;
}

interface SaveMetaRow extends Record<string, unknown> {
  id: string;
  label: string;
  created_at: string;
  updated_at: string;
  checkpoint_id: string;
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
    checkpointSnapshots: new Map(),
    eventLog: new Map(),
    saveMeta: new Map(),
  };
}

function createErrorResponse(payload: DbWorkerErrorPayload): DbWorkerResponse {
  return {
    type: "error",
    payload,
  };
}

function serializeJson(value: unknown): string {
  return JSON.stringify(value);
}

function serializeNullableJson(value: unknown | undefined): string | null {
  return value == null ? null : serializeJson(value);
}

function parseJson<T>(value: string): T {
  return JSON.parse(value) as T;
}

function checkpointFromRow(row: CheckpointSnapshotRow): CheckpointSnapshotRecord {
  return parseJson<CheckpointSnapshotRecord>(row.snapshot_json);
}

function eventLogFromRow(row: EventLogRow): EventLogRecord {
  return {
    id: row.id,
    type: row.type,
    createdAt: row.created_at,
    source: row.source,
    payload: parseJson(row.payload_json),
  };
}

function saveMetaFromRow(row: SaveMetaRow): SaveMetaRecord {
  return {
    id: row.id,
    label: row.label,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    checkpointId: row.checkpoint_id,
  };
}

async function initializeRecoverySchema(database: SqliteDatabase): Promise<void> {
  await database.exec(`
    CREATE TABLE IF NOT EXISTS checkpoint_snapshot (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      created_at TEXT NOT NULL,
      reason TEXT NOT NULL,
      snapshot_json TEXT NOT NULL,
      session_snapshot_json TEXT NOT NULL,
      pending_battle_json TEXT,
      active_battle_json TEXT,
      metadata_json TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_checkpoint_snapshot_kind_created_at
      ON checkpoint_snapshot (kind, created_at);

    CREATE TABLE IF NOT EXISTS event_log (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      created_at TEXT NOT NULL,
      source TEXT NOT NULL,
      payload_json TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_event_log_created_at
      ON event_log (created_at);

    CREATE TABLE IF NOT EXISTS save_meta (
      id TEXT PRIMARY KEY,
      label TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      checkpoint_id TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_save_meta_updated_at
      ON save_meta (updated_at);
  `);
}

async function ensureSqliteDatabase(
  state: DbWorkerRuntimeState,
): Promise<SqliteDatabase> {
  if (!state.sqliteDatabase) {
    state.sqliteDatabase = await createTransientSqliteDatabase();
    await initializeRecoverySchema(state.sqliteDatabase);
  }

  return state.sqliteDatabase;
}

export function createDbWorkerRuntime(): DbWorkerRuntime {
  const state: DbWorkerRuntimeState = {
    ...createInitialState(),
    sqliteDatabase: null,
  };

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
          const sqliteDatabase = await ensureSqliteDatabase(state);
          const appliedMigrations = runMigrations(state);
          state.initialized = true;

          const payload: DbInitResult = {
            ready: true,
            schemaVersion: DB_SCHEMA_VERSION,
            availableTables: [...state.tables.values()],
            appliedMigrations,
            sqliteCapabilities: sqliteDatabase.capabilities,
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

        case "replace_chat_messages": {
          state.chatHistory.clear();
          for (const message of request.payload) {
            state.chatHistory.set(message.id, { ...message });
          }
          return {
            type: "replace_chat_messages_result",
            payload: {
              replacedCount: request.payload.length,
            },
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

        case "save_checkpoint_snapshot": {
          const database = await ensureSqliteDatabase(state);
          await database.exec(
            `
              INSERT INTO checkpoint_snapshot (
                id,
                kind,
                created_at,
                reason,
                snapshot_json,
                session_snapshot_json,
                pending_battle_json,
                active_battle_json,
                metadata_json
              )
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
              ON CONFLICT(id) DO UPDATE SET
                kind = excluded.kind,
                created_at = excluded.created_at,
                reason = excluded.reason,
                snapshot_json = excluded.snapshot_json,
                session_snapshot_json = excluded.session_snapshot_json,
                pending_battle_json = excluded.pending_battle_json,
                active_battle_json = excluded.active_battle_json,
                metadata_json = excluded.metadata_json
            `,
            [
              request.payload.id,
              request.payload.kind,
              request.payload.createdAt,
              request.payload.reason,
              serializeJson(request.payload),
              serializeJson(request.payload.sessionSnapshot),
              serializeNullableJson(request.payload.pendingBattle),
              serializeNullableJson(request.payload.activeBattle),
              serializeNullableJson(request.payload.metadata),
            ],
          );
          return {
            type: "save_checkpoint_snapshot_result",
            payload: {
              savedId: request.payload.id,
            },
          };
        }

        case "list_checkpoint_snapshots": {
          const database = await ensureSqliteDatabase(state);
          const rows = await database.selectAll<CheckpointSnapshotRow>(
            `
              SELECT
                id,
                kind,
                created_at,
                reason,
                snapshot_json,
                session_snapshot_json,
                pending_battle_json,
                active_battle_json,
                metadata_json
              FROM checkpoint_snapshot
              ORDER BY created_at ASC
            `,
          );
          return {
            type: "list_checkpoint_snapshots_result",
            payload: rows.map(checkpointFromRow).map((record) =>
              deepClone(record),
            ),
          };
        }

        case "get_latest_checkpoint_snapshot_by_kind": {
          const database = await ensureSqliteDatabase(state);
          const rows = await database.selectAll<CheckpointSnapshotRow>(
            `
              SELECT
                id,
                kind,
                created_at,
                reason,
                snapshot_json,
                session_snapshot_json,
                pending_battle_json,
                active_battle_json,
                metadata_json
              FROM checkpoint_snapshot
              WHERE kind = ?
              ORDER BY created_at DESC
              LIMIT 1
            `,
            [request.payload.kind],
          );
          return {
            type: "get_latest_checkpoint_snapshot_by_kind_result",
            payload: rows[0] ? deepClone(checkpointFromRow(rows[0])) : null,
          };
        }

        case "append_event_log": {
          const database = await ensureSqliteDatabase(state);
          await database.exec(
            `
              INSERT INTO event_log (
                id,
                type,
                created_at,
                source,
                payload_json
              )
              VALUES (?, ?, ?, ?, ?)
              ON CONFLICT(id) DO UPDATE SET
                type = excluded.type,
                created_at = excluded.created_at,
                source = excluded.source,
                payload_json = excluded.payload_json
            `,
            [
              request.payload.id,
              request.payload.type,
              request.payload.createdAt,
              request.payload.source,
              serializeJson(request.payload.payload),
            ],
          );
          return {
            type: "append_event_log_result",
            payload: {
              savedId: request.payload.id,
            },
          };
        }

        case "list_event_logs": {
          const database = await ensureSqliteDatabase(state);
          const rows = await database.selectAll<EventLogRow>(
            `
              SELECT
                id,
                type,
                created_at,
                source,
                payload_json
              FROM event_log
              ORDER BY created_at ASC
            `,
          );
          return {
            type: "list_event_logs_result",
            payload: rows.map(eventLogFromRow).map((record) =>
              deepClone(record),
            ),
          };
        }

        case "save_save_meta": {
          const database = await ensureSqliteDatabase(state);
          await database.exec(
            `
              INSERT INTO save_meta (
                id,
                label,
                created_at,
                updated_at,
                checkpoint_id
              )
              VALUES (?, ?, ?, ?, ?)
              ON CONFLICT(id) DO UPDATE SET
                label = excluded.label,
                created_at = excluded.created_at,
                updated_at = excluded.updated_at,
                checkpoint_id = excluded.checkpoint_id
            `,
            [
              request.payload.id,
              request.payload.label,
              request.payload.createdAt,
              request.payload.updatedAt,
              request.payload.checkpointId,
            ],
          );
          return {
            type: "save_save_meta_result",
            payload: {
              savedId: request.payload.id,
            },
          };
        }

        case "list_save_meta": {
          const database = await ensureSqliteDatabase(state);
          const rows = await database.selectAll<SaveMetaRow>(
            `
              SELECT
                id,
                label,
                created_at,
                updated_at,
                checkpoint_id
              FROM save_meta
              ORDER BY updated_at ASC
            `,
          );
          return {
            type: "list_save_meta_result",
            payload: rows.map(saveMetaFromRow).map((record) =>
              deepClone(record),
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
