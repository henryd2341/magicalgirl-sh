/* eslint-disable no-unused-vars */

import systemPrompt from "@/content/systemPrompt.md?raw";
import { createDefaultContextBudget } from "@/orchestrator/promptBuilder";
import { deepClone } from "@/utils/deepClone";

const STORAGE_KEY = "magicalgirl-sh.prompt-preset.v1";

export interface PromptPresetConfig {
  systemPrompt: string;
  maxTotalTokens: number;
  previewMustacheVariables: boolean;
  updatedAt: string;
}

interface LegacyPromptPresetConfig {
  systemPrompt: string;
  budget: {
    maxTotalTokens: number;
    maxWorldInfoEntries?: number;
    maxHistoryMessages?: number;
  };
  previewMustacheVariables?: boolean;
  updatedAt: string;
}

type PromptPresetInput = PromptPresetConfig | LegacyPromptPresetConfig;

export interface PromptPresetRepository {
  getCurrent(): Promise<PromptPresetConfig>;
  saveCurrent(config: PromptPresetInput): Promise<void>;
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
    maxTotalTokens: createDefaultContextBudget().maxTotalTokens,
    previewMustacheVariables: false,
    updatedAt: now,
  };
}

function normalizeConfig(
  config: PromptPresetInput,
  updatedAt: string,
): PromptPresetConfig {
  const maxTotalTokens =
    "budget" in config
      ? config.budget.maxTotalTokens
      : config.maxTotalTokens;

  return {
    systemPrompt: config.systemPrompt,
    maxTotalTokens: Number(maxTotalTokens),
    previewMustacheVariables: config.previewMustacheVariables ?? false,
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

  public async saveCurrent(config: PromptPresetInput): Promise<void> {
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

    const parsed = JSON.parse(stored) as PromptPresetInput;
    return normalizeConfig(parsed, parsed.updatedAt);
  }

  public async saveCurrent(config: PromptPresetInput): Promise<void> {
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
