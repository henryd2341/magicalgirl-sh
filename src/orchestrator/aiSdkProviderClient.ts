import { createDeepSeek } from "@ai-sdk/deepseek";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { generateText, stepCountIs, streamText, type ModelMessage } from "ai";

import type { BuiltProviderRequest } from "@/orchestrator/harnessContextTypes";
import {
  createHarnessToolsWithExecute,
  type HarnessToolExecutorDeps,
} from "@/orchestrator/harnessTools";
import type {
  ProviderClient,
  ProviderStreamCallbacks,
  ProviderStreamResult,
} from "@/orchestrator/providerClient";
import type { ProviderProfileKind } from "@/orchestrator/providerSettings";

export interface AiSdkProviderClientConfig {
  providerKind?: ProviderProfileKind;
  providerName: string;
  baseURL: string;
  model: string;
  apiKey?: string;
  temperature?: number;
  maxOutputTokens?: number;
  streamingEnabled?: boolean;
  reasoningEffort?: "none" | "low" | "medium" | "high" | "xhigh" | "max";
  thinkingEnabled?: boolean;
  showReasoning?: boolean;
  toolChoice?: "auto" | "required" | "none";
  harnessDeps: HarnessToolExecutorDeps;
}

function normalizeFinishReason(
  finishReason: string | undefined,
): ProviderStreamResult["finishReason"] {
  return finishReason === "tool-calls" ? "tool_calls" : "stop";
}

function toModelMessages(request: BuiltProviderRequest): ModelMessage[] {
  return request.messages.map((message) => ({
    role: message.role,
    content: message.content,
  }));
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
    const isDeepSeek = this.config.providerKind === "deepseek";

    const provider = isDeepSeek
      ? createDeepSeek({
          baseURL:
            this.config.baseURL && this.config.baseURL.trim().length > 0
              ? this.config.baseURL
              : undefined,
          apiKey:
            this.config.apiKey && this.config.apiKey.trim().length > 0
              ? this.config.apiKey
              : undefined,
        })
      : createOpenAICompatible({
          name: this.config.providerName,
          baseURL: this.config.baseURL,
          apiKey:
            this.config.apiKey && this.config.apiKey.trim().length > 0
              ? this.config.apiKey
              : undefined,
        });

    const toolsWithExecute = createHarnessToolsWithExecute(
      this.config.harnessDeps,
      {
        requestId: request.metadata.request_id,
        contextVersion: request.metadata.context_version,
        stateHash: request.metadata.state_hash,
      },
    );

    const eff = this.config.reasoningEffort;
    const thinkingType =
      this.config.thinkingEnabled !== undefined
        ? this.config.thinkingEnabled
          ? "enabled"
          : "disabled"
        : eff === "none"
          ? "disabled"
          : undefined;

    const hasThinking = thinkingType !== undefined;
    const hasEffort = eff !== undefined && eff !== "none";

    const providerOptionsKey = isDeepSeek
      ? "deepseek"
      : this.config.providerName;

    const modelOptions = {
      model: provider(this.config.model),
      messages: toModelMessages(request),
      tools: toolsWithExecute,
      ...(this.config.toolChoice !== undefined
        ? { toolChoice: this.config.toolChoice }
        : {}),
      stopWhen: stepCountIs(8),
      temperature: this.config.temperature,
      maxOutputTokens: this.config.maxOutputTokens,
      ...(hasEffort || hasThinking
        ? {
            providerOptions: {
              [providerOptionsKey]: {
                ...(hasEffort ? ({ reasoningEffort: eff } as const) : {}),
                ...(hasThinking
                  ? ({ thinking: { type: thinkingType } } as const)
                  : {}),
              },
            },
          }
        : {}),
    };

    const toolResults: ProviderStreamResult["toolResults"] = [];

    if (this.config.streamingEnabled === false) {
      const result = (await generateText({
        ...modelOptions,
        onStepFinish: (event) => {
          for (const tc of event.toolCalls) {
            const tr = event.toolResults.find(
              (r) => r.toolCallId === tc.toolCallId,
            );
            toolResults.push({
              tool_name: tc.toolName,
              tool_call_id: tc.toolCallId,
              ok: !("error" in (tr ?? {})),
              output: tr && "output" in tr ? tr.output : undefined,
              error: tr && "error" in tr ? String(tr.error) : undefined,
            });
          }
        },
      })) as {
        text?: string;
        finishReason?: string;
        toolCalls?: Array<{
          toolName?: string;
          toolCallId?: string;
          input?: unknown;
        }>;
      };

      if (result.text && result.text.length > 0) {
        await callbacks.onTextChunk(result.text);
      }

      return {
        finishReason: normalizeFinishReason(result.finishReason),
        toolResults,
      };
    }

    const result = streamText({
      ...modelOptions,
      onStepFinish: (event) => {
        for (const tc of event.toolCalls) {
          const tr = event.toolResults.find(
            (r) => r.toolCallId === tc.toolCallId,
          );
          toolResults.push({
            tool_name: tc.toolName,
            tool_call_id: tc.toolCallId,
            ok: !("error" in (tr ?? {})),
            output: tr && "output" in tr ? tr.output : undefined,
            error: tr && "error" in tr ? String(tr.error) : undefined,
          });
        }
      },
    });

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

      if (
        streamPart.type === "reasoning" &&
        streamPart.text !== undefined &&
        this.config.showReasoning !== false
      ) {
        await callbacks.onReasoningChunk?.(streamPart.text);
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
      finishReason: normalizeFinishReason(finishReason),
      toolResults,
    };
  }
}
