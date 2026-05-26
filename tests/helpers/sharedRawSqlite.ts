import type {
  RawSqliteDatabase,
  SqliteBindValue,
  Sqlite3Module,
} from "@/persistence/sqlite/sqliteWasm";

type Row = Record<string, unknown>;

class SharedRawSqliteDatabase implements RawSqliteDatabase {
  private readonly tables: Map<string, Row[]>;

  public constructor(tables: Map<string, Row[]>) {
    this.tables = tables;
  }

  public exec(input: string | { sql: string; bind?: readonly SqliteBindValue[] }) {
    const sql = typeof input === "string" ? input : input.sql;
    const bind = typeof input === "string" ? [] : (input.bind ?? []);
    const normalized = sql.replace(/\s+/g, " ").trim().toLowerCase();

    if (normalized.startsWith("create table") || normalized.startsWith("create index")) {
      return;
    }

    if (normalized.startsWith("delete from chat_history")) {
      this.tables.set("chat_history", []);
      return;
    }

    if (normalized.startsWith("delete from variable_change_log")) {
      this.tables.set("variable_change_log", []);
      return;
    }

    if (normalized.startsWith("delete from variable_value")) {
      this.tables.set("variable_value", []);
      return;
    }

    if (normalized.startsWith("delete from runtime_snapshot")) {
      this.tables.set("runtime_snapshot", []);
      return;
    }

    if (normalized.startsWith("delete from world_info")) {
      this.tables.set("world_info", []);
      return;
    }

    if (normalized.startsWith("insert into chat_history")) {
      this.upsert("chat_history", {
        id: bind[0],
        created_at: bind[1],
        message_json: bind[2],
      });
      return;
    }

    if (normalized.startsWith("insert into variable_value")) {
      this.upsert("variable_value", {
        id: bind[0],
        updated_at: bind[1],
        value_json: bind[2],
      });
      return;
    }

    if (normalized.startsWith("insert into variable_change_log")) {
      this.upsert("variable_change_log", {
        id: bind[0],
        created_at: bind[1],
        log_json: bind[2],
      });
      return;
    }

    if (normalized.startsWith("insert into runtime_snapshot")) {
      this.upsert("runtime_snapshot", {
        id: bind[0],
        updated_at: bind[1],
        snapshot_json: bind[2],
        session_snapshot_json: bind[3],
        pending_battle_json: bind[4],
        active_battle_json: bind[5],
      });
      return;
    }

    if (normalized.startsWith("insert into world_info")) {
      this.upsert("world_info", {
        id: bind[0],
        keywords_json: bind[1],
        content: bind[2],
        priority: bind[3],
        enabled: bind[4],
        is_constant: bind[5],
      });
      return;
    }

    throw new Error(`Unsupported shared raw sqlite exec: ${sql}`);
  }

  public selectObjects(
    sql: string,
    bind?: readonly SqliteBindValue[],
  ): Row[] {
    const normalized = sql.replace(/\s+/g, " ").trim().toLowerCase();

    if (normalized.includes("from chat_history where id = ?")) {
      return this.rows("chat_history").filter((row) => row.id === bind?.[0]);
    }

    if (normalized.includes("from chat_history")) {
      return this.rows("chat_history").sort((left, right) =>
        String(left.created_at).localeCompare(String(right.created_at)),
      );
    }

    if (normalized.includes("from variable_value")) {
      return this.rows("variable_value").filter((row) => row.id === "current");
    }

    if (normalized.includes("from variable_change_log")) {
      return this.rows("variable_change_log").sort((left, right) =>
        String(left.created_at).localeCompare(String(right.created_at)),
      );
    }

    if (normalized.includes("from runtime_snapshot")) {
      return this.rows("runtime_snapshot").filter((row) => row.id === "current");
    }

    if (normalized.includes("from world_info")) {
      return this.rows("world_info").sort((left, right) => {
        const priorityDelta = Number(right.priority) - Number(left.priority);
        return priorityDelta === 0
          ? String(left.id).localeCompare(String(right.id))
          : priorityDelta;
      });
    }

    return [];
  }

  public selectValue(): string | number | bigint | null | undefined {
    return null;
  }

  public close() {
    return undefined;
  }

  private rows(table: string): Row[] {
    return [...(this.tables.get(table) ?? [])];
  }

  private upsert(table: string, row: Row): void {
    const rows = this.rows(table).filter((candidate) => candidate.id !== row.id);
    rows.push(row);
    this.tables.set(table, rows);
  }
}

export function createSharedRawSqliteFactory(): () => Promise<Sqlite3Module> {
  const tables = new Map<string, Row[]>();

  return async () => ({
    oo1: {
      DB: class extends SharedRawSqliteDatabase {
        public constructor() {
          super(tables);
        }
      },
    },
  });
}
