/* eslint-disable no-unused-vars */

import type { DbWorkerStateSnapshot } from "@/persistence/dbProtocol";
import {
  ALL_DB_TABLES,
  type DbSchemaMigrationId,
  type DbTableName,
} from "@/persistence/schema";

export interface DbMigration {
  id: DbSchemaMigrationId;
  apply: (state: DbWorkerStateSnapshot) => void;
}

function ensureTable(
  state: DbWorkerStateSnapshot,
  tableName: DbTableName,
): void {
  state.tables.add(tableName);
}

export const migration001Init: DbMigration = {
  id: "001_init",
  apply(state) {
    for (const tableName of ALL_DB_TABLES) {
      ensureTable(state, tableName);
    }

    if (!state.testRecords) {
      state.testRecords = new Map();
    }

    if (!state.chatHistory) {
      state.chatHistory = new Map();
    }

    if (!state.variableValue) {
      state.variableValue = null;
    }

    if (!state.variableChangeLog) {
      state.variableChangeLog = new Map();
    }

    if (!state.worldInfo) {
      state.worldInfo = new Map();
    }

    if (!state.checkpointSnapshots) {
      state.checkpointSnapshots = new Map();
    }

    if (!state.eventLog) {
      state.eventLog = new Map();
    }

    if (!state.saveMeta) {
      state.saveMeta = new Map();
    }

    if (!state.saveSlots) {
      state.saveSlots = new Map();
    }
  },
};
