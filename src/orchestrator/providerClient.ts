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

export interface FakeStreamingProviderClientInput {
  textChunks?: string[];
  toolResults?: ProviderStreamResult["toolResults"];
  error?: Error;
}

export class FakeStreamingProviderClient implements ProviderClient {
  private readonly textChunks: string[];

  private readonly toolResults: ProviderStreamResult["toolResults"];

  private readonly error: Error | null;

  public constructor(input: FakeStreamingProviderClientInput) {
    this.textChunks =
      input.textChunks ?? [
        "战斗后的空气慢慢安静下来，新的选择浮现在你面前。",
      ];
    this.toolResults = input.toolResults ?? [];
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

    return {
      finishReason: this.toolResults.length > 0 ? "tool_calls" : "stop",
      toolResults: this.toolResults.map((tr) => ({ ...tr })),
    };
  }
}
