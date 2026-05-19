import type { DbWorkerStateSnapshot } from "@/persistence/dbProtocol";
import {
  migration001Init,
  type DbMigration,
} from "@/persistence/migrations/001_init";

const MIGRATIONS: DbMigration[] = [migration001Init];

export function runMigrations(state: DbWorkerStateSnapshot): string[] {
  const appliedMigrations: string[] = [];

  for (const migration of MIGRATIONS) {
    if (state.migrations.has(migration.id)) {
      continue;
    }

    migration.apply(state);
    state.migrations.add(migration.id);
    appliedMigrations.push(migration.id);
  }

  return appliedMigrations;
}
