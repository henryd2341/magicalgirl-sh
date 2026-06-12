/* eslint-disable no-unused-vars */

import systemPrompt from "@/content/systemPrompt.md?raw";
import { createDefaultContextBudget } from "@/orchestrator/promptBuilder";
import { deepClone } from "@/utils/deepClone";

const STORAGE_KEY = "magicalgirl-sh.prompt-preset.v1";

export interface ChainOfThoughtConfig {
  enabled: boolean;
  template: string;
  style: "prefix" | "suffix";
  placement: "system_message" | "replace_user_input";
  prefillText: string;
  beautifyTagName: string;
}

const DEFAULT_COT_TEMPLATE_PREFIX = [
  '**输出准则：**',
  '- 首先在在 <thinking></thinking> 块中完成创作前的检查',
  '- 你必须检查以下关键内容：',
  ' 1. 当前处于何种场景？',
  ' 2. 场景中存在哪些人物？',
  ' 3. 从玩家输入中能得到哪些信息？{{user}}是否有行动？',
  ' 4. 其他已经存在的人物将会做出何种行动？',
  ' 5. 是否有必要引入新的主要人物？新人物只作为提及还是会正式加入场景并做出行动？',
  ' 6. 当前场景是否命中了某个skill的description？',
  ' 7. 会有哪些变量发生变化？合理的新值是什么？',
  '- 检查完之后结束思考，开始输出正文和调用相关工具',
  '- 至少调用一次update_variables工具',
  '- 战斗场景下，必须调用trigger_battle工具，选择合适的enemy_id和count',
  '- 你输出的正文必须由 <content></content> 标签包裹',
  '',
  '下面是本轮叙事中的玩家输入',
  '<UserInput>',
  '{{userInput}}',
  '</UserInput>',
].join('\n');

const DEFAULT_COT_TEMPLATE_SUFFIX = [
  "<UserInput>",
  "{{userInput}}",
  "</UserInput>",
  "",
  "上面是本轮叙事中的玩家输入",
  "",
  "**输出准则：**",
  "- 首先在 <thinking></thinking> 块中完成创作前的检查",
  "- 你必须检查以下关键内容：",
  " 1. 当前处于何种场景？",
  " 2. 场景中存在哪些人物？",
  " 3. 从玩家输入中能得到哪些信息？{{user}}是否有行动？",
  " 4. 其他已经存在的人物将会做出何种行动？",
  " 5. 是否有必要引入新的主要人物？新人物只作为提及还是会正式加入场景并做出行动？",
  " 6. 当前场景是否命中了某个skill的description？",
  " 7. 会有哪些变量发生变化？合理的新值是什么？",
  "- 检查完之后结束思考，开始输出正文和调用相关工具",
  "- 至少调用一次update_variables工具",
  "- 战斗场景下，必须调用trigger_battle工具，选择合适的enemy_id和count",
  "- 你输出的正文必须由 <content></content> 标签包裹",
  "",
].join("\n");

export const DEFAULT_CHAIN_OF_THOUGHT_CONFIG: ChainOfThoughtConfig = {
  enabled: false,
  template: DEFAULT_COT_TEMPLATE_PREFIX,
  style: "prefix",
  placement: "system_message",
  prefillText: "Parsley明白了，先思考：<thinking>",
  beautifyTagName: "thinking",
};

export const COT_TEMPLATE_PRESETS: Record<
  ChainOfThoughtConfig["style"],
  string
> = {
  prefix: DEFAULT_COT_TEMPLATE_PREFIX,
  suffix: DEFAULT_COT_TEMPLATE_SUFFIX,
};

export interface PromptPresetConfig {
  systemPrompt: string;
  maxTotalTokens: number;
  previewMustacheVariables: boolean;
  updatedAt: string;
  customChainOfThought: ChainOfThoughtConfig;
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
    customChainOfThought: { ...DEFAULT_CHAIN_OF_THOUGHT_CONFIG },
  };
}

function normalizeConfig(
  config: PromptPresetInput,
  updatedAt: string,
): PromptPresetConfig {
  const maxTotalTokens =
    "budget" in config ? config.budget.maxTotalTokens : config.maxTotalTokens;

  return {
    systemPrompt: config.systemPrompt,
    maxTotalTokens: Number(maxTotalTokens),
    previewMustacheVariables: config.previewMustacheVariables ?? false,
    updatedAt,
    customChainOfThought:
      "customChainOfThought" in config
        ? config.customChainOfThought
        : { ...DEFAULT_CHAIN_OF_THOUGHT_CONFIG },
  };
}

export class InMemoryPromptPresetRepository implements PromptPresetRepository {
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

export class LocalStoragePromptPresetRepository implements PromptPresetRepository {
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
