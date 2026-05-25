export const DB_SCHEMA_VERSION = 1;

export const MVP_PERSISTENT_TABLES = [
  'variable_def',
  'variable_value',
  'variable_change_log',
  'item_def',
  'enemy_def',
  'skill_def',
  'world_info',
  'chat_history',
  'event_log',
  'checkpoint_snapshot',
  'save_meta',
  'save_slot',
] as const;

export const DEV_RUNTIME_TABLES = ['test_record'] as const;

export const ALL_DB_TABLES = [...MVP_PERSISTENT_TABLES, ...DEV_RUNTIME_TABLES] as const;

export const DB_SCHEMA_MIGRATIONS = ['001_init'] as const;
export type DbSchemaMigrationId = (typeof DB_SCHEMA_MIGRATIONS)[number];
export type DbTableName = (typeof ALL_DB_TABLES)[number];
