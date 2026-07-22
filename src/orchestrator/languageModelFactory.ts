import { createAnthropic } from "@ai-sdk/anthropic";
import { createDeepSeek } from "@ai-sdk/deepseek";
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { LanguageModel } from "ai";

import type { ProviderProfileKind } from "@/orchestrator/providerSettings";

export interface LanguageModelConfig {
  providerKind: ProviderProfileKind;
  providerName: string;
  baseURL: string;
  model: string;
  apiKey?: string;
}

function optionalSetting(value: string | undefined): string | undefined {
  return value?.trim() ? value : undefined;
}

export function createLanguageModel(config: LanguageModelConfig): LanguageModel {
  switch (config.providerKind) {
    case "openai-compatible":
      return createOpenAICompatible({
        name: config.providerName,
        baseURL: config.baseURL,
        apiKey: optionalSetting(config.apiKey),
      })(config.model);
    case "deepseek":
      return createDeepSeek({
        baseURL: optionalSetting(config.baseURL),
        apiKey: optionalSetting(config.apiKey),
      })(config.model);
    case "openai-responses":
      return createOpenAI({
        baseURL: optionalSetting(config.baseURL),
        apiKey: optionalSetting(config.apiKey),
      }).responses(config.model);
    case "anthropic":
      return createAnthropic({
        baseURL: optionalSetting(config.baseURL),
        apiKey: optionalSetting(config.apiKey),
      })(config.model);
    case "fake":
      throw new Error(
        "[PROVIDER_SETTINGS_INVALID] Fake provider must use FakeStreamingProviderClient.",
      );
  }
}
