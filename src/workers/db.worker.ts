import type {
  DbInitResult,
  DbWorkerEndpoint,
  DbWorkerErrorPayload,
  DbWorkerRequest,
  DbWorkerResponse,
  DbWorkerStateSnapshot,
} from "@/persistence/dbProtocol";
import type { FullSaveExportV1 } from "@/persistence/exportSave";
import type { SaveSlotRecord } from "@/persistence/saveSlotTypes";
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

interface SaveSlotRow extends Record<string, unknown> {
  id: string;
  source_file_name: string;
  imported_at: string;
  exported_at: string;
  export_id: string;
  created_checkpoint_id: string;
  save_meta_id: string;
  label: string;
  payload_json: string;
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
    saveSlots: new Map(),
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

function saveSlotFromRow(row: SaveSlotRow): SaveSlotRecord {
  return {
    id: row.id,
    sourceFileName: row.source_file_name,
    importedAt: row.imported_at,
    exportedAt: row.exported_at,
    exportId: row.export_id,
    createdCheckpointId: row.created_checkpoint_id,
    saveMetaId: row.save_meta_id,
    label: row.label,
    payload: parseJson<FullSaveExportV1>(row.payload_json),
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

    CREATE TABLE IF NOT EXISTS save_slot (
      id TEXT PRIMARY KEY,
      source_file_name TEXT NOT NULL,
      imported_at TEXT NOT NULL,
      exported_at TEXT NOT NULL,
      export_id TEXT NOT NULL,
      created_checkpoint_id TEXT NOT NULL,
      save_meta_id TEXT NOT NULL,
      label TEXT NOT NULL,
      payload_json TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_save_slot_imported_at
      ON save_slot (imported_at);
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

async function saveCheckpointSnapshotRow(
  database: SqliteDatabase,
  record: CheckpointSnapshotRecord,
): Promise<void> {
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
      record.id,
      record.kind,
      record.createdAt,
      record.reason,
      serializeJson(record),
      serializeJson(record.sessionSnapshot),
      serializeNullableJson(record.pendingBattle),
      serializeNullableJson(record.activeBattle),
      serializeNullableJson(record.metadata),
    ],
  );
}

async function saveEventLogRow(
  database: SqliteDatabase,
  record: EventLogRecord,
): Promise<void> {
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
      record.id,
      record.type,
      record.createdAt,
      record.source,
      serializeJson(record.payload),
    ],
  );
}

async function saveSaveMetaRow(
  database: SqliteDatabase,
  record: SaveMetaRecord,
): Promise<void> {
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
      record.id,
      record.label,
      record.createdAt,
      record.updatedAt,
      record.checkpointId,
    ],
  );
}

async function saveSaveSlotRow(
  database: SqliteDatabase,
  record: SaveSlotRecord,
): Promise<void> {
  await database.exec(
    `
      INSERT INTO save_slot (
        id,
        source_file_name,
        imported_at,
        exported_at,
        export_id,
        created_checkpoint_id,
        save_meta_id,
        label,
        payload_json
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        source_file_name = excluded.source_file_name,
        imported_at = excluded.imported_at,
        exported_at = excluded.exported_at,
        export_id = excluded.export_id,
        created_checkpoint_id = excluded.created_checkpoint_id,
        save_meta_id = excluded.save_meta_id,
        label = excluded.label,
        payload_json = excluded.payload_json
    `,
    [
      record.id,
      record.sourceFileName,
      record.importedAt,
      record.exportedAt,
      record.exportId,
      record.createdCheckpointId,
      record.saveMetaId,
      record.label,
      serializeJson(record.payload),
    ],
  );
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

        case "save_save_slot": {
          const database = await ensureSqliteDatabase(state);
          const record = deepClone(request.payload);
          state.saveSlots.set(record.id, record);
          await saveSaveSlotRow(database, record);
          return {
            type: "save_save_slot_result",
            payload: {
              savedId: record.id,
            },
          };
        }

        case "list_save_slots": {
          const database = await ensureSqliteDatabase(state);
          const rows = await database.selectAll<SaveSlotRow>(
            `
              SELECT
                id,
                source_file_name,
                imported_at,
                exported_at,
                export_id,
                created_checkpoint_id,
                save_meta_id,
                label,
                payload_json
              FROM save_slot
              ORDER BY imported_at ASC
            `,
          );
          return {
            type: "list_save_slots_result",
            payload: rows.map(saveSlotFromRow).map((record) =>
              deepClone(record),
            ),
          };
        }

        case "get_save_slot_by_id": {
          const database = await ensureSqliteDatabase(state);
          const rows = await database.selectAll<SaveSlotRow>(
            `
              SELECT
                id,
                source_file_name,
                imported_at,
                exported_at,
                export_id,
                created_checkpoint_id,
                save_meta_id,
                label,
                payload_json
              FROM save_slot
              WHERE id = ?
              LIMIT 1
            `,
            [request.payload.id],
          );
          return {
            type: "get_save_slot_by_id_result",
            payload: rows[0] ? deepClone(saveSlotFromRow(rows[0])) : null,
          };
        }

        case "replace_full_save_data": {
          const database = await ensureSqliteDatabase(state);

          await database.exec("DELETE FROM checkpoint_snapshot");
          await database.exec("DELETE FROM event_log");
          await database.exec("DELETE FROM save_meta");

          for (const checkpoint of request.payload.checkpointSnapshots) {
            await saveCheckpointSnapshotRow(database, checkpoint);
          }

          for (const event of request.payload.eventLog) {
            await saveEventLogRow(database, event);
          }

          for (const saveMeta of request.payload.saveMeta) {
            await saveSaveMetaRow(database, saveMeta);
          }

          state.chatHistory.clear();
          for (const message of request.payload.chatMessages) {
            state.chatHistory.set(message.id, { ...message });
          }

          state.variableValue = request.payload.variableValue
            ? deepClone(request.payload.variableValue)
            : null;

          state.variableChangeLog.clear();
          for (const record of request.payload.variableChangeLog) {
            state.variableChangeLog.set(record.id, deepClone(record));
          }

          state.worldInfo.clear();
          for (const entry of request.payload.worldInfo) {
            state.worldInfo.set(entry.id, deepClone(entry));
          }

          return {
            type: "replace_full_save_data_result",
            payload: {
              checkpointCount: request.payload.checkpointSnapshots.length,
              chatMessageCount: request.payload.chatMessages.length,
            },
          };
        }
      }
    },
    getState() {
      return state;
    },
  };
}
