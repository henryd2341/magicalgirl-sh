import { createTransientSqliteDatabase } from "@/persistence/sqlite/sqliteWasm";
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
    });
  });
});
