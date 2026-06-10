/* eslint-disable no-unused-vars */

import type {
  BuiltProviderRequest,
} from "@/orchestrator/harnessContextTypes";

export interface ProviderStreamCallbacks {
  onTextChunk: (chunk: string) => Promise<void> | void;
  onReasoningChunk?: (chunk: string) => Promise<void> | void;
}

export interface ProviderStreamResult {
  finishReason: "stop" | "tool_calls";
  toolResults: Array<{
    tool_name: string;
    tool_call_id: string;
    ok: boolean;
    output?: unknown;
    error?: string;
  }>;
}

export interface ProviderClient {
  stream(
    request: BuiltProviderRequest,
    callbacks: ProviderStreamCallbacks,
  ): Promise<ProviderStreamResult>;
}

export interface FakeToolCall {
  tool_name: string;
  input: unknown;
}

export const DEFAULT_FAKE_TOOL_CALLS: FakeToolCall[] = [
  {
    tool_name: "update_variables",
    input: {
      patches: [{ path: "player.money", value: 49900 }],
    },
  },
  {
    tool_name: "trigger_battle",
    input: {
      encounter_id: "enc-mock-default",
      enemies: [{ enemy_id: "1", count: 1 }],
      narrative_reason: "测试用默认战斗",
    },
  },
];

export interface FakeStreamingProviderClientInput {
  textChunks?: string[];
  toolCalls?: FakeToolCall[];
  toolResults?: ProviderStreamResult["toolResults"];
  onExecuteTools?: (
    calls: FakeToolCall[],
  ) => Promise<ProviderStreamResult["toolResults"]>;
  error?: Error;
}

export class FakeStreamingProviderClient implements ProviderClient {
  private readonly textChunks: string[];
  private readonly toolCalls: FakeToolCall[];
  private readonly toolResults: ProviderStreamResult["toolResults"];
  private readonly onExecuteTools: ((
    calls: FakeToolCall[],
  ) => Promise<ProviderStreamResult["toolResults"]>) | null;
  private readonly error: Error | null;

  public constructor(input: FakeStreamingProviderClientInput) {
    this.textChunks = input.textChunks ?? [
      "四周的空气突然变得凝重...",
      "暗影中有什么正在靠近。",
      "\n\n你迅速环顾四周，摆出战斗姿态——一场恶战在所难免！",
    ];
    this.toolCalls = input.toolCalls ?? DEFAULT_FAKE_TOOL_CALLS;
    this.toolResults = input.toolResults ?? [];
    this.onExecuteTools = input.onExecuteTools ?? null;
    this.error = input.error ?? null;
  }

  public async stream(
    _request: BuiltProviderRequest,
    callbacks: ProviderStreamCallbacks,
  ): Promise<ProviderStreamResult> {
    for (const chunk of this.textChunks) {
      await callbacks.onTextChunk(chunk);
    }

    if (this.error) {
      throw this.error;
    }

    const finalResults: ProviderStreamResult["toolResults"] =
      this.onExecuteTools && this.toolCalls.length > 0
        ? await this.onExecuteTools(this.toolCalls)
        : this.toolResults.map((tr) => ({ ...tr }));

    return {
      finishReason: finalResults.length > 0 ? "tool_calls" : "stop",
      toolResults: finalResults,
    };
  }
}
