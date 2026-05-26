/* eslint-disable no-unused-vars */

import type { DbWorkerClient } from "@/persistence/dbClient";
import type { ContextInjectionTrace } from "@/orchestrator/harnessContextTypes";
import { deepClone } from "@/utils/deepClone";

export interface WorldInfoEntry {
  id: string;
  keywords: string[];
  content: string;
  priority: number;
  enabled: boolean;
  isConstant: boolean;
}

export interface WorldInfoRepository {
  save(entry: WorldInfoEntry): Promise<void>;
  list(): Promise<WorldInfoEntry[]>;
  search(searchableText: string): Promise<WorldInfoSearchResult>;
}

export interface WorldInfoSearchResult {
  constantEntries: WorldInfoEntry[];
  matchedEntries: WorldInfoEntry[];
  traces: ContextInjectionTrace[];
}

export class InMemoryWorldInfoRepository implements WorldInfoRepository {
  private readonly entries = new Map<string, WorldInfoEntry>();

  public async save(entry: WorldInfoEntry): Promise<void> {
    this.entries.set(entry.id, deepClone(entry));
  }

  public async list(): Promise<WorldInfoEntry[]> {
    return [...this.entries.values()].map((entry) => deepClone(entry));
  }

  public async search(searchableText: string): Promise<WorldInfoSearchResult> {
    return searchWorldInfoEntries(await this.list(), searchableText);
  }
}

export class DbWorldInfoRepository implements WorldInfoRepository {
  private readonly client: DbWorkerClient;

  public constructor(client: DbWorkerClient) {
    this.client = client;
  }

  public save(entry: WorldInfoEntry): Promise<void> {
    return this.client.saveWorldInfoEntry(entry);
  }

  public list(): Promise<WorldInfoEntry[]> {
    return this.client.listWorldInfoEntries();
  }

  public search(searchableText: string): Promise<WorldInfoSearchResult> {
    return this.client.searchWorldInfoEntries(searchableText);
  }
}

function estimateTokens(content: string): number {
  return Math.max(1, Math.ceil(content.length / 4));
}

function normalizeSearchText(text: string): string {
  return text.toLocaleLowerCase();
}

export function extractWorldInfoSearchTerms(searchableText: string): string[] {
  const normalized = normalizeSearchText(searchableText);
  const terms = new Set<string>();

  for (const match of normalized.matchAll(/[a-z0-9_./-]{2,}/g)) {
    terms.add(match[0]);
  }

  for (const match of normalized.matchAll(/[\p{Script=Han}]{2,}/gu)) {
    const run = match[0];
    if (run.length <= 8) {
      terms.add(run);
    }

    for (let index = 0; index < run.length - 1; index += 1) {
      terms.add(run.slice(index, index + 2));
    }
  }

  return [...terms].filter((term) => term.trim().length >= 2);
}

function sortWorldInfoEntries(entries: WorldInfoEntry[]): WorldInfoEntry[] {
  return [...entries].sort((left, right) => {
    const priorityDelta = right.priority - left.priority;
    return priorityDelta === 0
      ? left.id.localeCompare(right.id)
      : priorityDelta;
  });
}

function hasKeywordMatch(entry: WorldInfoEntry, searchableText: string): boolean {
  return entry.keywords.some((keyword) => {
    const normalizedKeyword = normalizeSearchText(keyword).trim();
    return (
      normalizedKeyword.length > 0 &&
      searchableText.includes(normalizedKeyword)
    );
  });
}

function hasTextMatch(
  entry: WorldInfoEntry,
  searchTerms: readonly string[],
  ftsMatchedIds: ReadonlySet<string>,
): boolean {
  if (ftsMatchedIds.has(entry.id)) {
    return true;
  }

  const searchableEntryText = normalizeSearchText(entry.content);
  return searchTerms.some((term) => searchableEntryText.includes(term));
}

function includedWorldInfoTrace(
  entry: WorldInfoEntry,
  reason: string,
): ContextInjectionTrace {
  return {
    sourceId: entry.id,
    kind: "world_info",
    included: true,
    reason,
    priority: entry.priority,
    tokenEstimate: estimateTokens(entry.content),
  };
}

function droppedWorldInfoTrace(
  entry: WorldInfoEntry,
  reason: string,
): ContextInjectionTrace {
  return {
    sourceId: entry.id,
    kind: "world_info",
    included: false,
    reason,
    priority: entry.priority,
  };
}

export function searchWorldInfoEntries(
  entries: readonly WorldInfoEntry[],
  searchableText: string,
  ftsMatchedIds: ReadonlySet<string> = new Set(),
): WorldInfoSearchResult {
  const normalizedSearchableText = normalizeSearchText(searchableText);
  const searchTerms = extractWorldInfoSearchTerms(searchableText);
  const constantEntries: WorldInfoEntry[] = [];
  const matchedEntries: WorldInfoEntry[] = [];
  const traces: ContextInjectionTrace[] = [];

  for (const entry of entries) {
    if (!entry.enabled) {
      traces.push(droppedWorldInfoTrace(entry, "disabled"));
      continue;
    }

    if (entry.isConstant) {
      constantEntries.push(entry);
      continue;
    }

    if (hasKeywordMatch(entry, normalizedSearchableText)) {
      matchedEntries.push(entry);
      traces.push(includedWorldInfoTrace(entry, "keyword_match"));
      continue;
    }

    if (hasTextMatch(entry, searchTerms, ftsMatchedIds)) {
      matchedEntries.push(entry);
      traces.push(includedWorldInfoTrace(entry, "fts_match"));
      continue;
    }

    traces.push(droppedWorldInfoTrace(entry, "fts_miss"));
  }

  const sortedConstants = sortWorldInfoEntries(constantEntries);
  const sortedMatches = sortWorldInfoEntries(matchedEntries);
  const constantIds = new Set(sortedConstants.map((entry) => entry.id));

  return {
    constantEntries: sortedConstants.map((entry) => deepClone(entry)),
    matchedEntries: sortedMatches.map((entry) => deepClone(entry)),
    traces: [
      ...sortedConstants.map((entry) =>
        includedWorldInfoTrace(entry, "constant"),
      ),
      ...traces.filter((trace) => !constantIds.has(trace.sourceId)),
    ],
  };
}
