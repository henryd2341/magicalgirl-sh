import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { generateText, streamText, tool, type ModelMessage } from "ai";

import type {
  BuiltProviderRequest,
  ProviderToolCallCandidate,
} from "@/orchestrator/harnessContextTypes";
import type {
  ProviderClient,
  ProviderStreamCallbacks,
  ProviderStreamResult,
} from "@/orchestrator/providerClient";
import {
  triggerBattleToolInputSchema,
  updateVariablesToolInputSchema,
} from "@/orchestrator/toolSchemas";

export interface AiSdkProviderClientConfig {
  providerName: string;
  baseURL: string;
  model: string;
  apiKey?: string;
  temperature?: number;
  maxOutputTokens?: number;
  streamingEnabled?: boolean;
}

function normalizeFinishReason(
  finishReason: string | undefined,
  toolCalls: ProviderToolCallCandidate[],
): ProviderStreamResult["finishReason"] {
  if (finishReason === "tool-calls" || toolCalls.length > 0) {
    return "tool_calls";
  }

  return "stop";
}

function toModelMessages(request: BuiltProviderRequest): ModelMessage[] {
  return request.messages.map((message) => ({
    role: message.role,
    content: message.content,
  }));
}

function toToolName(toolName: string): ProviderToolCallCandidate["tool_name"] {
  if (toolName === "update_variables" || toolName === "trigger_battle") {
    return toolName;
  }

  throw new Error(
    `[AI_SDK_PROVIDER_TOOL_UNSUPPORTED] Unsupported tool call: ${toolName}.`,
  );
}

function createHarnessTools() {
  return {
    update_variables: tool({
      description:
        "Apply one or more variable patches after the story state changes.",
      inputSchema: updateVariablesToolInputSchema,
    }),
    trigger_battle: tool({
      description:
        "Request a pending battle encounter using the frozen trigger_battle contract.",
      inputSchema: triggerBattleToolInputSchema,
    }),
  };
}

function toToolCallCandidate(toolCall: {
  toolName?: string;
  toolCallId?: string;
  input?: unknown;
}): ProviderToolCallCandidate {
  return {
    tool_name: toToolName(toolCall.toolName ?? ""),
    tool_call_id: toolCall.toolCallId ?? "",
    input: toolCall.input,
  };
}

export class AiSdkProviderClient implements ProviderClient {
  private readonly config: AiSdkProviderClientConfig;

  public constructor(config: AiSdkProviderClientConfig) {
    this.config = config;
  }

  public async stream(
    request: BuiltProviderRequest,
    callbacks: ProviderStreamCallbacks,
  ): Promise<ProviderStreamResult> {
    const provider = createOpenAICompatible({
      name: this.config.providerName,
      baseURL: this.config.baseURL,
      apiKey:
        this.config.apiKey && this.config.apiKey.trim().length > 0
          ? this.config.apiKey
          : undefined,
    });
    const modelOptions = {
      model: provider(this.config.model),
      messages: toModelMessages(request),
      tools: createHarnessTools(),
      temperature: this.config.temperature,
      maxOutputTokens: this.config.maxOutputTokens,
    };

    if (this.config.streamingEnabled === false) {
      const result = (await generateText(modelOptions)) as {
        text?: string;
        finishReason?: string;
        toolCalls?: Array<{
          toolName?: string;
          toolCallId?: string;
          input?: unknown;
        }>;
      };
      const toolCalls = (result.toolCalls ?? []).map(toToolCallCandidate);

      if (result.text && result.text.length > 0) {
        await callbacks.onTextChunk(result.text);
      }

      return {
        finishReason: normalizeFinishReason(result.finishReason, toolCalls),
        toolCalls,
      };
    }

    const result = streamText(modelOptions);
    const toolCalls: ProviderToolCallCandidate[] = [];
    let finishReason: string | undefined;

    for await (const part of result.fullStream) {
      const streamPart = part as {
        type: string;
        text?: string;
        toolName?: string;
        toolCallId?: string;
        input?: unknown;
        finishReason?: string;
      };

      if (streamPart.type === "text-delta" && streamPart.text !== undefined) {
        await callbacks.onTextChunk(streamPart.text);
      }

      if (streamPart.type === "text" && streamPart.text !== undefined) {
        await callbacks.onTextChunk(streamPart.text);
      }

      if (streamPart.type === "tool-call") {
        toolCalls.push(toToolCallCandidate(streamPart));
      }

      if (streamPart.type === "finish") {
        finishReason = streamPart.finishReason;
      }

      if (streamPart.type === "error") {
        const error = (streamPart as { error?: unknown }).error;
        throw error instanceof Error ? error : new Error(String(error));
      }
    }

    return {
      finishReason: normalizeFinishReason(finishReason, toolCalls),
      toolCalls,
    };
  }
}
