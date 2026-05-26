/* eslint-disable no-unused-vars */

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
  createPersistentSqliteDatabase,
  createTransientSqliteDatabase,
  type CreateSqliteDatabaseOptions,
  type SqliteDatabase,
} from "@/persistence/sqlite/sqliteWasm";
import type { ChatMessage } from "@/types/chat";
import { DB_SCHEMA_VERSION } from "@/persistence/schema";
import { VariableEngine } from "@/engine/variableEngine";
import type {
  CheckpointKind,
  CheckpointSnapshotRecord,
  EventLogRecord,
  SaveMetaRecord,
} from "@/types/recovery";
import type { RuntimeSnapshotRecord } from "@/types/runtimeSnapshot";
import type {
  VariableChangeLogRecord,
  VariableValueRecord,
} from "@/types/variables";
import { deepClone } from "@/utils/deepClone";

export interface DbWorkerRuntime extends DbWorkerEndpoint {
  getState(): Readonly<DbWorkerStateSnapshot>;
}

export interface DbWorkerRuntimeOptions {
  storage?: CreateSqliteDatabaseOptions["storage"];
  filename?: string;
  sqlite3Factory?: CreateSqliteDatabaseOptions["sqlite3Factory"];
}

interface DbWorkerRuntimeState extends DbWorkerStateSnapshot {
  sqliteDatabase: SqliteDatabase | null;
  sqliteOptions: DbWorkerRuntimeOptions;
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

interface ChatHistoryRow extends Record<string, unknown> {
  id: string;
  created_at: string;
  message_json: string;
}

interface VariableValueRow extends Record<string, unknown> {
  id: "current";
  updated_at: string;
  value_json: string;
}

interface VariableChangeLogRow extends Record<string, unknown> {
  id: string;
  created_at: string;
  log_json: string;
}

interface RuntimeSnapshotRow extends Record<string, unknown> {
  id: "current";
  updated_at: string;
  snapshot_json: string;
  session_snapshot_json: string;
  pending_battle_json: string | null;
  active_battle_json: string | null;
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
    runtimeSnapshot: null,
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

function chatMessageFromRow(row: ChatHistoryRow): ChatMessage {
  return parseJson<ChatMessage>(row.message_json);
}

function variableValueFromRow(row: VariableValueRow): VariableValueRecord {
  return parseJson<VariableValueRecord>(row.value_json);
}

function variableChangeLogFromRow(
  row: VariableChangeLogRow,
): VariableChangeLogRecord {
  return parseJson<VariableChangeLogRecord>(row.log_json);
}

function runtimeSnapshotFromRow(
  row: RuntimeSnapshotRow,
): RuntimeSnapshotRecord {
  return parseJson<RuntimeSnapshotRecord>(row.snapshot_json);
}

function createInitialVariableValue(now: string): VariableValueRecord {
  return {
    ...new VariableEngine().createInitialState(),
    updatedAt: now,
  };
}

function createIdleRuntimeSnapshot(now: string): RuntimeSnapshotRecord {
  return {
    id: "current",
    updatedAt: now,
    sessionSnapshot: {
      sessionState: "IDLE",
      pipelineState: null,
      activeRequestId: null,
    },
    pendingBattle: null,
    activeBattle: null,
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

    CREATE TABLE IF NOT EXISTS chat_history (
      id TEXT PRIMARY KEY,
      created_at TEXT NOT NULL,
      message_json TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_chat_history_created_at
      ON chat_history (created_at);

    CREATE TABLE IF NOT EXISTS variable_value (
      id TEXT PRIMARY KEY,
      updated_at TEXT NOT NULL,
      value_json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS variable_change_log (
      id TEXT PRIMARY KEY,
      created_at TEXT NOT NULL,
      log_json TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_variable_change_log_created_at
      ON variable_change_log (created_at);

    CREATE TABLE IF NOT EXISTS runtime_snapshot (
      id TEXT PRIMARY KEY,
      updated_at TEXT NOT NULL,
      snapshot_json TEXT NOT NULL,
      session_snapshot_json TEXT NOT NULL,
      pending_battle_json TEXT,
      active_battle_json TEXT
    );
  `);
}

async function ensureSqliteDatabase(
  state: DbWorkerRuntimeState,
): Promise<SqliteDatabase> {
  if (!state.sqliteDatabase) {
    state.sqliteDatabase =
      state.sqliteOptions.storage === "memory"
        ? await createTransientSqliteDatabase({
            sqlite3Factory: state.sqliteOptions.sqlite3Factory,
          })
        : await createPersistentSqliteDatabase({
            filename: state.sqliteOptions.filename,
            sqlite3Factory: state.sqliteOptions.sqlite3Factory,
          });
    await initializeRecoverySchema(state.sqliteDatabase);
  }

  return state.sqliteDatabase;
}

async function saveChatMessageRow(
  database: SqliteDatabase,
  message: ChatMessage,
): Promise<void> {
  await database.exec(
    `
      INSERT INTO chat_history (
        id,
        created_at,
        message_json
      )
      VALUES (?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        created_at = excluded.created_at,
        message_json = excluded.message_json
    `,
    [message.id, message.created_at, serializeJson(message)],
  );
}

async function saveVariableValueRow(
  database: SqliteDatabase,
  record: VariableValueRecord,
): Promise<void> {
  await database.exec(
    `
      INSERT INTO variable_value (
        id,
        updated_at,
        value_json
      )
      VALUES (?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        updated_at = excluded.updated_at,
        value_json = excluded.value_json
    `,
    ["current", record.updatedAt, serializeJson(record)],
  );
}

async function saveVariableChangeLogRow(
  database: SqliteDatabase,
  record: VariableChangeLogRecord,
): Promise<void> {
  await database.exec(
    `
      INSERT INTO variable_change_log (
        id,
        created_at,
        log_json
      )
      VALUES (?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        created_at = excluded.created_at,
        log_json = excluded.log_json
    `,
    [record.id, record.createdAt, serializeJson(record)],
  );
}

async function saveRuntimeSnapshotRow(
  database: SqliteDatabase,
  record: RuntimeSnapshotRecord,
): Promise<void> {
  await database.exec(
    `
      INSERT INTO runtime_snapshot (
        id,
        updated_at,
        snapshot_json,
        session_snapshot_json,
        pending_battle_json,
        active_battle_json
      )
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        updated_at = excluded.updated_at,
        snapshot_json = excluded.snapshot_json,
        session_snapshot_json = excluded.session_snapshot_json,
        pending_battle_json = excluded.pending_battle_json,
        active_battle_json = excluded.active_battle_json
    `,
    [
      record.id,
      record.updatedAt,
      serializeJson(record),
      serializeJson(record.sessionSnapshot),
      serializeNullableJson(record.pendingBattle),
      serializeNullableJson(record.activeBattle),
    ],
  );
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

export function createDbWorkerRuntime(
  options: DbWorkerRuntimeOptions = {},
): DbWorkerRuntime {
  const state: DbWorkerRuntimeState = {
    ...createInitialState(),
    sqliteDatabase: null,
    sqliteOptions: options,
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
          const database = await ensureSqliteDatabase(state);
          await saveChatMessageRow(database, request.payload);
          return {
            type: "save_chat_message_result",
            payload: {
              savedId: request.payload.id,
            },
          };
        }

        case "get_chat_message_by_id": {
          const database = await ensureSqliteDatabase(state);
          const rows = await database.selectAll<ChatHistoryRow>(
            `
              SELECT id, created_at, message_json
              FROM chat_history
              WHERE id = ?
              LIMIT 1
            `,
            [request.payload.id],
          );
          return {
            type: "get_chat_message_by_id_result",
            payload: rows[0] ? deepClone(chatMessageFromRow(rows[0])) : null,
          };
        }

        case "list_chat_messages": {
          const database = await ensureSqliteDatabase(state);
          const rows = await database.selectAll<ChatHistoryRow>(
            `
              SELECT id, created_at, message_json
              FROM chat_history
              ORDER BY created_at ASC
            `,
          );
          return {
            type: "list_chat_messages_result",
            payload: rows.map(chatMessageFromRow).map((message) =>
              deepClone(message),
            ),
          };
        }

        case "replace_chat_messages": {
          const database = await ensureSqliteDatabase(state);
          await database.exec("DELETE FROM chat_history");
          for (const message of request.payload) {
            await saveChatMessageRow(database, message);
          }
          return {
            type: "replace_chat_messages_result",
            payload: {
              replacedCount: request.payload.length,
            },
          };
        }

        case "save_current_variable_value": {
          const database = await ensureSqliteDatabase(state);
          await saveVariableValueRow(database, request.payload);
          return {
            type: "save_current_variable_value_result",
            payload: {
              savedRootId: request.payload.rootId,
            },
          };
        }

        case "get_current_variable_value": {
          const database = await ensureSqliteDatabase(state);
          const rows = await database.selectAll<VariableValueRow>(
            `
              SELECT id, updated_at, value_json
              FROM variable_value
              WHERE id = ?
              LIMIT 1
            `,
            ["current"],
          );
          return {
            type: "get_current_variable_value_result",
            payload: rows[0] ? deepClone(variableValueFromRow(rows[0])) : null,
          };
        }

        case "append_variable_change_log": {
          const database = await ensureSqliteDatabase(state);
          await saveVariableChangeLogRow(database, request.payload);
          return {
            type: "append_variable_change_log_result",
            payload: {
              savedChangeId: request.payload.id,
            },
          };
        }

        case "list_variable_change_logs": {
          const database = await ensureSqliteDatabase(state);
          const rows = await database.selectAll<VariableChangeLogRow>(
            `
              SELECT id, created_at, log_json
              FROM variable_change_log
              ORDER BY created_at ASC
            `,
          );
          return {
            type: "list_variable_change_logs_result",
            payload: rows.map(variableChangeLogFromRow).map((record) =>
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

        case "delete_save_slot": {
          const database = await ensureSqliteDatabase(state);
          state.saveSlots.delete(request.payload.id);
          await database.exec("DELETE FROM save_slot WHERE id = ?", [
            request.payload.id,
          ]);
          return {
            type: "delete_save_slot_result",
            payload: {
              deletedId: request.payload.id,
            },
          };
        }

        case "replace_full_save_data": {
          const database = await ensureSqliteDatabase(state);

          await database.exec("DELETE FROM checkpoint_snapshot");
          await database.exec("DELETE FROM event_log");
          await database.exec("DELETE FROM save_meta");
          await database.exec("DELETE FROM chat_history");
          await database.exec("DELETE FROM variable_value");
          await database.exec("DELETE FROM variable_change_log");
          await database.exec("DELETE FROM runtime_snapshot");

          for (const checkpoint of request.payload.checkpointSnapshots) {
            await saveCheckpointSnapshotRow(database, checkpoint);
          }

          for (const event of request.payload.eventLog) {
            await saveEventLogRow(database, event);
          }

          for (const saveMeta of request.payload.saveMeta) {
            await saveSaveMetaRow(database, saveMeta);
          }

          for (const message of request.payload.chatMessages) {
            await saveChatMessageRow(database, message);
          }

          if (request.payload.variableValue) {
            await saveVariableValueRow(database, request.payload.variableValue);
          }

          for (const record of request.payload.variableChangeLog) {
            await saveVariableChangeLogRow(database, record);
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

        case "save_runtime_snapshot": {
          const database = await ensureSqliteDatabase(state);
          await saveRuntimeSnapshotRow(database, request.payload);
          state.runtimeSnapshot = deepClone(request.payload);
          return {
            type: "save_runtime_snapshot_result",
            payload: {
              savedId: request.payload.id,
            },
          };
        }

        case "get_runtime_snapshot": {
          const database = await ensureSqliteDatabase(state);
          const rows = await database.selectAll<RuntimeSnapshotRow>(
            `
              SELECT
                id,
                updated_at,
                snapshot_json,
                session_snapshot_json,
                pending_battle_json,
                active_battle_json
              FROM runtime_snapshot
              WHERE id = ?
              LIMIT 1
            `,
            ["current"],
          );
          return {
            type: "get_runtime_snapshot_result",
            payload: rows[0]
              ? deepClone(runtimeSnapshotFromRow(rows[0]))
              : null,
          };
        }

        case "clear_runtime_snapshot": {
          const database = await ensureSqliteDatabase(state);
          await database.exec("DELETE FROM runtime_snapshot");
          state.runtimeSnapshot = null;
          return {
            type: "clear_runtime_snapshot_result",
          };
        }

        case "reset_current_game_data": {
          const database = await ensureSqliteDatabase(state);
          const now = request.payload.now ?? new Date().toISOString();
          const initialVariableValue = createInitialVariableValue(now);
          const idleRuntimeSnapshot = createIdleRuntimeSnapshot(now);

          await database.exec("DELETE FROM checkpoint_snapshot");
          await database.exec("DELETE FROM event_log");
          await database.exec("DELETE FROM save_meta");
          await database.exec("DELETE FROM chat_history");
          await database.exec("DELETE FROM variable_value");
          await database.exec("DELETE FROM variable_change_log");
          await database.exec("DELETE FROM runtime_snapshot");

          await saveVariableValueRow(database, initialVariableValue);
          await saveRuntimeSnapshotRow(database, idleRuntimeSnapshot);
          state.worldInfo.clear();
          state.runtimeSnapshot = deepClone(idleRuntimeSnapshot);

          return {
            type: "reset_current_game_data_result",
            payload: {
              variableRootId: initialVariableValue.rootId,
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

interface DbWorkerEnvelopeRequest {
  id: string;
  request: DbWorkerRequest;
}

interface WorkerScopeLike {
  document?: unknown;
  postMessage?: (message: unknown) => void;
  addEventListener?: (
    type: "message",
    listener: (event: { data: unknown }) => void,
  ) => void;
}

function isDbWorkerEnvelopeRequest(
  value: unknown,
): value is DbWorkerEnvelopeRequest {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    "request" in value &&
    typeof (value as { id: unknown }).id === "string"
  );
}

const workerScope = globalThis as WorkerScopeLike;

if (
  typeof workerScope.addEventListener === "function" &&
  typeof workerScope.postMessage === "function" &&
  workerScope.document === undefined
) {
  const runtime = createDbWorkerRuntime();

  workerScope.addEventListener("message", async (event) => {
    if (!isDbWorkerEnvelopeRequest(event.data)) {
      return;
    }

    const response = await runtime.post(event.data.request);
    workerScope.postMessage?.({
      id: event.data.id,
      response,
    });
  });
}
