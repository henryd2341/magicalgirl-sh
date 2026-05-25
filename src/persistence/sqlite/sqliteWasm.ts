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
  storageMode: "opfs" | "memory";
  filename: string;
  opfsAvailable: boolean;
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

export interface RawSqliteDatabase {
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

export type SqliteStoragePreference = "opfs-preferred" | "memory";

export interface Sqlite3Module {
  oo1: {
    DB: new (filename: string, flags?: string) => RawSqliteDatabase;
    OpfsDb?: new (filename: string, flags?: string) => RawSqliteDatabase;
  };
}

export interface CreateSqliteDatabaseOptions {
  storage?: SqliteStoragePreference;
  filename?: string;
  sqlite3Factory?: () => Promise<Sqlite3Module>;
}

function hasFunction(db: RawSqliteDatabase, name: string): boolean {
  const found = db.selectValue(
    "SELECT name FROM pragma_function_list WHERE name = ? LIMIT 1",
    [name],
  );

  return found === name;
}

function detectExtensionCapabilities(db: RawSqliteDatabase) {
  return {
    sqliteSyncAvailable: hasFunction(db, "cloudsync_version"),
    sqliteVectorAvailable: hasFunction(db, "vector_version"),
    sqliteMemoryAvailable: hasFunction(db, "memory_version"),
  };
}

async function defaultSqlite3Factory(): Promise<Sqlite3Module> {
  return sqlite3InitModule({
    print: () => undefined,
    printErr: () => undefined,
  }) as Promise<Sqlite3Module>;
}

function wrapDatabase(input: {
  db: RawSqliteDatabase;
  storageMode: "opfs" | "memory";
  filename: string;
  opfsAvailable: boolean;
}): SqliteDatabase {
  const capabilities: SqliteWasmCapabilities = {
    ...detectExtensionCapabilities(input.db),
    storageMode: input.storageMode,
    filename: input.filename,
    opfsAvailable: input.opfsAvailable,
  };

  return {
    capabilities,
    async exec(sql: string, bind?: readonly SqliteBindValue[]) {
      if (bind) {
        input.db.exec({ sql, bind });
        return;
      }

      input.db.exec(sql);
    },
    async selectAll<T extends Record<string, unknown>>(
      sql: string,
      bind?: readonly SqliteBindValue[],
    ) {
      return input.db.selectObjects(sql, bind) as T[];
    },
    close() {
      input.db.close();
    },
  };
}

export async function createSqliteDatabase(
  options: CreateSqliteDatabaseOptions = {},
): Promise<SqliteDatabase> {
  const storage = options.storage ?? "opfs-preferred";
  const persistentFilename = options.filename ?? "/magicalgirl-sh.sqlite3";
  const sqlite3 = await (options.sqlite3Factory ?? defaultSqlite3Factory)();
  const opfsAvailable = typeof sqlite3.oo1.OpfsDb === "function";

  if (storage === "opfs-preferred" && sqlite3.oo1.OpfsDb) {
    try {
      return wrapDatabase({
        db: new sqlite3.oo1.OpfsDb(persistentFilename, "c"),
        storageMode: "opfs",
        filename: persistentFilename,
        opfsAvailable,
      });
    } catch {
      // Fall through to the in-memory database when the browser lacks OPFS
      // requirements such as Worker support or SharedArrayBuffer.
    }
  }

  return wrapDatabase({
    db: new sqlite3.oo1.DB(":memory:", "c"),
    storageMode: "memory",
    filename: ":memory:",
    opfsAvailable,
  });
}

export function createPersistentSqliteDatabase(
  options: Omit<CreateSqliteDatabaseOptions, "storage"> = {},
): Promise<SqliteDatabase> {
  return createSqliteDatabase({
    ...options,
    storage: "opfs-preferred",
  });
}

export function createTransientSqliteDatabase(
  options: Omit<CreateSqliteDatabaseOptions, "storage" | "filename"> = {},
): Promise<SqliteDatabase> {
  return createSqliteDatabase({
    ...options,
    storage: "memory",
    filename: ":memory:",
  });
}
