import {
  createPersistentSqliteDatabase,
  createSqliteDatabase,
  createTransientSqliteDatabase,
  type RawSqliteDatabase,
} from "@/persistence/sqlite/sqliteWasm";
import { describe, expect, it } from "vitest";

describe("sqlite wasm runtime", () => {
  it("opens a transient sqlite wasm database and executes basic SQL", async () => {
    const database = await createTransientSqliteDatabase();

    await database.exec(
      "CREATE TABLE smoke_test (id TEXT PRIMARY KEY, label TEXT NOT NULL)",
    );
    await database.exec(
      "INSERT INTO smoke_test (id, label) VALUES (?, ?)",
      ["row-1", "ok"],
    );

    expect(
      await database.selectAll<{ id: string; label: string }>(
        "SELECT id, label FROM smoke_test",
      ),
    ).toEqual([
      {
        id: "row-1",
        label: "ok",
      },
    ]);
    expect(database.capabilities).toEqual({
      sqliteSyncAvailable: expect.any(Boolean),
      sqliteVectorAvailable: expect.any(Boolean),
      sqliteMemoryAvailable: expect.any(Boolean),
      storageMode: "memory",
      filename: ":memory:",
      opfsAvailable: expect.any(Boolean),
    });
  });

  it("opens an OPFS database when OPFS is available", async () => {
    const opened: string[] = [];

    const database = await createSqliteDatabase({
      storage: "opfs-preferred",
      filename: "/magicalgirl-test.sqlite3",
      sqlite3Factory: async () => ({
        oo1: {
          DB: class implements RawSqliteDatabase {
            public constructor(filename: string) {
              opened.push(`memory:${filename}`);
            }

            public exec(): void {
              return undefined;
            }

            public selectObjects(): Record<string, unknown>[] {
              return [];
            }

            public selectValue(): string | number | bigint | null | undefined {
              return null;
            }

            public close(): void {
              return undefined;
            }
          },
          OpfsDb: class implements RawSqliteDatabase {
            public constructor(filename: string) {
              opened.push(`opfs:${filename}`);
            }

            public exec(): void {
              return undefined;
            }

            public selectObjects(): Record<string, unknown>[] {
              return [];
            }

            public selectValue(): string | number | bigint | null | undefined {
              return null;
            }

            public close(): void {
              return undefined;
            }
          },
        },
      }),
    });

    expect(opened).toEqual(["opfs:/magicalgirl-test.sqlite3"]);
    expect(database.capabilities.storageMode).toBe("opfs");
    expect(database.capabilities.filename).toBe("/magicalgirl-test.sqlite3");
    database.close();
  });

  it("falls back to memory when OPFS is unavailable", async () => {
    const opened: string[] = [];

    const database = await createPersistentSqliteDatabase({
      filename: "/magicalgirl-test.sqlite3",
      sqlite3Factory: async () => ({
        oo1: {
          DB: class implements RawSqliteDatabase {
            public constructor(filename: string) {
              opened.push(`memory:${filename}`);
            }

            public exec(): void {
              return undefined;
            }

            public selectObjects(): Record<string, unknown>[] {
              return [];
            }

            public selectValue(): string | number | bigint | null | undefined {
              return null;
            }

            public close(): void {
              return undefined;
            }
          },
          OpfsDb: class implements RawSqliteDatabase {
            public constructor() {
              opened.push("opfs:failed");
              throw new Error("OPFS unavailable");
            }

            public exec(): void {
              return undefined;
            }

            public selectObjects(): Record<string, unknown>[] {
              return [];
            }

            public selectValue(): string | number | bigint | null | undefined {
              return null;
            }

            public close(): void {
              return undefined;
            }
          },
        },
      }),
    });

    expect(opened).toEqual(["opfs:failed", "memory::memory:"]);
    expect(database.capabilities.storageMode).toBe("memory");
    expect(database.capabilities.filename).toBe(":memory:");
    database.close();
  });
});
