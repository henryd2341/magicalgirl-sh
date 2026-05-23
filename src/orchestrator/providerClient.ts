/* eslint-disable no-unused-vars */

import type {
  BuiltProviderRequest,
  ProviderToolCallCandidate,
} from "@/orchestrator/harnessContextTypes";

export interface ProviderStreamCallbacks {
  onTextChunk: (chunk: string) => Promise<void> | void;
}

export interface ProviderStreamResult {
  finishReason: "stop" | "tool_calls";
  toolCalls: ProviderToolCallCandidate[];
}

export interface ProviderClient {
  stream(
    request: BuiltProviderRequest,
    callbacks: ProviderStreamCallbacks,
  ): Promise<ProviderStreamResult>;
}

export interface FakeStreamingProviderClientInput {
  textChunks: string[];
  toolCalls?: ProviderToolCallCandidate[];
  error?: Error;
}

export class FakeStreamingProviderClient implements ProviderClient {
  private readonly textChunks: string[];

  private readonly toolCalls: ProviderToolCallCandidate[];

  private readonly error: Error | null;

  public constructor(input: FakeStreamingProviderClientInput) {
    this.textChunks = input.textChunks;
    this.toolCalls = input.toolCalls ?? [];
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
      finishReason: this.toolCalls.length > 0 ? "tool_calls" : "stop",
      toolCalls: this.toolCalls.map((toolCall) => ({ ...toolCall })),
    };
  }
}
