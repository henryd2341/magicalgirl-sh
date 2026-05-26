/* eslint-disable no-unused-vars */

import systemPrompt from "@/content/systemPrompt.md?raw";
import { createDefaultContextBudget } from "@/orchestrator/promptBuilder";
import type { ContextBudget } from "@/orchestrator/harnessContextTypes";
import { deepClone } from "@/utils/deepClone";

const STORAGE_KEY = "magicalgirl-sh.prompt-preset.v1";

export interface PromptPresetConfig {
  systemPrompt: string;
  budget: ContextBudget;
  updatedAt: string;
}

export interface PromptPresetRepository {
  getCurrent(): Promise<PromptPresetConfig>;
  saveCurrent(config: PromptPresetConfig): Promise<void>;
  resetToDefault(): Promise<PromptPresetConfig>;
}

export interface PromptPresetRepositoryOptions {
  now?: () => string;
}

function defaultNow(): string {
  return new Date().toISOString();
}

export function createDefaultPromptPresetConfig(
  now: string = defaultNow(),
): PromptPresetConfig {
  return {
    systemPrompt,
    budget: createDefaultContextBudget(),
    updatedAt: now,
  };
}

function normalizeConfig(
  config: PromptPresetConfig,
  updatedAt: string,
): PromptPresetConfig {
  return {
    systemPrompt: config.systemPrompt,
    budget: {
      maxTotalTokens: Number(config.budget.maxTotalTokens),
      maxWorldInfoEntries: Number(config.budget.maxWorldInfoEntries),
      maxHistoryMessages: Number(config.budget.maxHistoryMessages),
    },
    updatedAt,
  };
}

export class InMemoryPromptPresetRepository
  implements PromptPresetRepository
{
  private current: PromptPresetConfig | null = null;

  private readonly now: () => string;

  public constructor(options: PromptPresetRepositoryOptions = {}) {
    this.now = options.now ?? defaultNow;
  }

  public async getCurrent(): Promise<PromptPresetConfig> {
    return deepClone(
      this.current ?? createDefaultPromptPresetConfig(this.now()),
    );
  }

  public async saveCurrent(config: PromptPresetConfig): Promise<void> {
    this.current = normalizeConfig(config, this.now());
  }

  public async resetToDefault(): Promise<PromptPresetConfig> {
    this.current = createDefaultPromptPresetConfig(this.now());
    return deepClone(this.current);
  }
}

export class LocalStoragePromptPresetRepository
  implements PromptPresetRepository
{
  private readonly now: () => string;

  public constructor(options: PromptPresetRepositoryOptions = {}) {
    this.now = options.now ?? defaultNow;
  }

  public async getCurrent(): Promise<PromptPresetConfig> {
    const stored = globalThis.localStorage?.getItem(STORAGE_KEY);

    if (!stored) {
      return createDefaultPromptPresetConfig(this.now());
    }

    const parsed = JSON.parse(stored) as PromptPresetConfig;
    return normalizeConfig(parsed, parsed.updatedAt);
  }

  public async saveCurrent(config: PromptPresetConfig): Promise<void> {
    const normalized = normalizeConfig(config, this.now());
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(normalized));
  }

  public async resetToDefault(): Promise<PromptPresetConfig> {
    const next = createDefaultPromptPresetConfig(this.now());
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(next));
    return next;
  }
}

const promptPresetRepository = new LocalStoragePromptPresetRepository();

export function getPromptPresetRepository(): PromptPresetRepository {
  return promptPresetRepository;
}
