/* eslint-disable no-unused-vars */

import sqlite3InitModule from "@sqliteai/sqlite-wasm";

export type SqliteBindValue =
  | string
  | number
  | null
  | bigint
  | boolean
  | undefined
  | Uint8Array
  | Int8Array
  | ArrayBuffer;

export interface SqliteWasmCapabilities {
  sqliteSyncAvailable: boolean;
  sqliteVectorAvailable: boolean;
  sqliteMemoryAvailable: boolean;
}

export interface SqliteDatabase {
  readonly capabilities: SqliteWasmCapabilities;
  exec(sql: string, bind?: readonly SqliteBindValue[]): Promise<void>;
  selectAll<T extends Record<string, unknown>>(
    sql: string,
    bind?: readonly SqliteBindValue[],
  ): Promise<T[]>;
  close(): void;
}

interface RawSqliteDatabase {
  exec(input: string | { sql: string; bind?: readonly SqliteBindValue[] }): void;
  selectObjects(
    sql: string,
    bind?: readonly SqliteBindValue[],
  ): Record<string, unknown>[];
  selectValue(
    sql: string,
    bind?: readonly SqliteBindValue[],
  ): string | number | bigint | null | undefined;
  close(): void;
}

function hasFunction(db: RawSqliteDatabase, name: string): boolean {
  const found = db.selectValue(
    "SELECT name FROM pragma_function_list WHERE name = ? LIMIT 1",
    [name],
  );

  return found === name;
}

function detectCapabilities(db: RawSqliteDatabase): SqliteWasmCapabilities {
  return {
    sqliteSyncAvailable: hasFunction(db, "cloudsync_version"),
    sqliteVectorAvailable: hasFunction(db, "vector_version"),
    sqliteMemoryAvailable: hasFunction(db, "memory_version"),
  };
}

export async function createTransientSqliteDatabase(): Promise<SqliteDatabase> {
  const sqlite3 = await sqlite3InitModule({
    print: () => undefined,
    printErr: () => undefined,
  });
  const db = new sqlite3.oo1.DB(":memory:", "c") as RawSqliteDatabase;
  const capabilities = detectCapabilities(db);

  return {
    capabilities,
    async exec(sql: string, bind?: readonly SqliteBindValue[]) {
      if (bind) {
        db.exec({ sql, bind });
        return;
      }

      db.exec(sql);
    },
    async selectAll<T extends Record<string, unknown>>(
      sql: string,
      bind?: readonly SqliteBindValue[],
    ) {
      return db.selectObjects(sql, bind) as T[];
    },
    close() {
      db.close();
    },
  };
}
