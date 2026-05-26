import type { WorldInfoRepository } from "@/persistence/repositories/worldInfoRepository";
import type { WorldInfoEntry } from "@/persistence/repositories/worldInfoRepository";

const rawEntryModules = import.meta.glob<string>("../../raw_entries/*.txt", {
  eager: true,
  import: "default",
  query: "?raw",
});

export const RAW_WORLD_INFO_CONSTANT_IDS = [
  "raw_entries/世界观基础",
  "raw_entries/M.A.S.C.O.T",
] as const;

const constantPriorityById = new Map<string, number>([
  ["raw_entries/世界观基础", 1000],
  ["raw_entries/M.A.S.C.O.T", 990],
]);

function normalizePath(path: string): string {
  return path.replace(/\\/g, "/");
}

function basenameWithoutExtension(path: string): string {
  const normalized = normalizePath(path);
  const fileName = normalized.split("/").at(-1) ?? normalized;
  return fileName.replace(/\.txt$/i, "");
}

function extractFirstTopLevelTag(content: string): string | null {
  const match = content.match(/^\s*<([^>\n]+)>/m);
  return match?.[1]?.trim() || null;
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.length > 0))];
}

function keywordsForRawEntry(baseName: string, content: string): string[] {
  return unique([baseName, extractFirstTopLevelTag(content) ?? ""]);
}

function priorityForEntry(id: string): number {
  return constantPriorityById.get(id) ?? 500;
}

function isConstantEntry(id: string): boolean {
  return constantPriorityById.has(id);
}

export function buildRawWorldInfoEntries(
  modules: Record<string, string>,
): WorldInfoEntry[] {
  return Object.entries(modules)
    .map(([path, content]) => {
      const baseName = basenameWithoutExtension(path);
      const id = `raw_entries/${baseName}`;
      return {
        id,
        keywords: keywordsForRawEntry(baseName, content),
        content,
        priority: priorityForEntry(id),
        enabled: true,
        isConstant: isConstantEntry(id),
      };
    })
    .sort((left, right) => {
      const priorityDelta = right.priority - left.priority;
      return priorityDelta === 0
        ? left.id.localeCompare(right.id)
        : priorityDelta;
    });
}

export function getRawWorldInfoEntries(): WorldInfoEntry[] {
  return buildRawWorldInfoEntries(rawEntryModules);
}

export async function seedRawWorldInfoEntries(
  repository: WorldInfoRepository,
): Promise<WorldInfoEntry[]> {
  const entries = getRawWorldInfoEntries();

  for (const entry of entries) {
    await repository.save(entry);
  }

  return entries;
}

export async function syncRawWorldInfoEntries(
  repository: WorldInfoRepository,
  modules: Record<string, string> = rawEntryModules,
): Promise<WorldInfoEntry[]> {
  const rawEntries = buildRawWorldInfoEntries(modules);
  const existingById = new Map(
    (await repository.list()).map((entry) => [entry.id, entry]),
  );
  const syncedEntries = rawEntries.map((rawEntry) => {
    const existing = existingById.get(rawEntry.id);
    if (!existing) {
      return rawEntry;
    }

    return {
      ...rawEntry,
      keywords: existing.keywords,
      priority: existing.priority,
      enabled: existing.enabled,
      isConstant: existing.isConstant,
    };
  });

  for (const entry of syncedEntries) {
    await repository.save(entry);
  }

  return syncedEntries.sort((left, right) => {
    const priorityDelta = right.priority - left.priority;
    return priorityDelta === 0
      ? left.id.localeCompare(right.id)
      : priorityDelta;
  });
}
