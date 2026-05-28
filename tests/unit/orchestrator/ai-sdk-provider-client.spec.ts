import type { BuiltProviderRequest } from "@/orchestrator/harnessContextTypes";
import { AiSdkProviderClient } from "@/orchestrator/aiSdkProviderClient";
import { beforeEach, describe, expect, it, vi } from "vitest";

const aiSdkMocks = vi.hoisted(() => ({
  generateText: vi.fn(),
  streamText: vi.fn(),
  createOpenAICompatible: vi.fn(),
}));

vi.mock("ai", () => ({
  generateText: aiSdkMocks.generateText,
  streamText: aiSdkMocks.streamText,
  stepCountIs: vi.fn((n: number) => ({ type: "stepCountIs", n })),
  tool: vi.fn((definition: unknown) => definition),
}));

vi.mock("@ai-sdk/openai-compatible", () => ({
  createOpenAICompatible: aiSdkMocks.createOpenAICompatible,
}));

function createHarnessDeps() {
  return {
    dispatchCommand: vi.fn().mockResolvedValue({ next: {}, nextHash: "hash" }),
  };
}

function createRequest(): BuiltProviderRequest {
  return {
    metadata: {
      request_id: "req-ai-sdk-provider",
      context_version: 4,
      state_hash: "hash-ai-sdk",
      issued_at: "2026-05-27T12:00:00.000Z",
    },
    segments: [],
    traces: [],
    messages: [
      { role: "system", content: "stable system" },
      { role: "user", content: "推开旧校舍的门。" },
    ],
    tools: [
      {
        name: "update_variables",
        description: "Update variables.",
        envelopeFields: ["tool_name", "tool_call_id", "input"],
      },
      {
        name: "trigger_battle",
        description: "Trigger battle.",
        envelopeFields: ["tool_name", "tool_call_id", "input"],
      },
    ],
    promptText: "stable system\n推开旧校舍的门。",
  };
}

async function* streamParts(
  parts: AsyncIterable<unknown> | unknown[],
): AsyncIterable<unknown> {
  for await (const part of parts) {
    yield part;
  }
}

describe("AiSdkProviderClient", () => {
  beforeEach(() => {
    aiSdkMocks.generateText.mockReset();
    aiSdkMocks.streamText.mockReset();
    aiSdkMocks.createOpenAICompatible.mockReset();
    aiSdkMocks.createOpenAICompatible.mockReturnValue((modelId: string) => ({
      provider: "compatible",
      modelId,
    }));
  });

  it("streams AI SDK text parts into provider callbacks", async () => {
    aiSdkMocks.streamText.mockReturnValue({
      fullStream: streamParts([
        { type: "text", text: "旧校舍的门" },
        { type: "text", text: "轻轻打开。" },
        { type: "finish", finishReason: "stop" },
      ]),
    });
    const chunks: string[] = [];

    const client = new AiSdkProviderClient({
      providerName: "local",
      baseURL: "http://localhost:1234/v1",
      model: "local-model",
      apiKey: "",
      temperature: 0.7,
      maxOutputTokens: 512,
      harnessDeps: createHarnessDeps(),
    });

    const result = await client.stream(createRequest(), {
      onTextChunk: (chunk) => {
        chunks.push(chunk);
      },
    });

    expect(chunks).toEqual(["旧校舍的门", "轻轻打开。"]);
    expect(result).toEqual({
      finishReason: "stop",
      toolResults: [],
    });
    expect(aiSdkMocks.createOpenAICompatible).toHaveBeenCalledWith({
      name: "local",
      baseURL: "http://localhost:1234/v1",
      apiKey: undefined,
    });
    expect(aiSdkMocks.streamText).toHaveBeenCalledWith(
      expect.objectContaining({
        model: { provider: "compatible", modelId: "local-model" },
        messages: createRequest().messages,
        temperature: 0.7,
        maxOutputTokens: 512,
        tools: expect.objectContaining({
          update_variables: expect.objectContaining({ execute: expect.any(Function) }),
          trigger_battle: expect.objectContaining({ execute: expect.any(Function) }),
        }),
      }),
    );
  });

  it("passes stopWhen stepCountIs(5) to streamText", async () => {
    aiSdkMocks.streamText.mockReturnValue({
      fullStream: streamParts([
        { type: "finish", finishReason: "stop" },
      ]),
    });

    const client = new AiSdkProviderClient({
      providerName: "gateway",
      baseURL: "https://example.test/v1",
      model: "story-model",
      apiKey: "secret-key",
      harnessDeps: createHarnessDeps(),
    });

    await client.stream(createRequest(), { onTextChunk: vi.fn() });

    expect(aiSdkMocks.streamText).toHaveBeenCalledWith(
      expect.objectContaining({
        stopWhen: expect.any(Object),
      }),
    );
  });

  it("throws when the AI SDK full stream emits an error part", async () => {
    aiSdkMocks.streamText.mockReturnValue({
      fullStream: streamParts([
        {
          type: "error",
          error: new TypeError("Failed to fetch"),
        },
      ]),
    });

    const client = new AiSdkProviderClient({
      providerName: "gateway",
      baseURL: "https://api.example.test/v1",
      model: "story-model",
      apiKey: "secret-key",
      harnessDeps: createHarnessDeps(),
    });

    await expect(
      client.stream(createRequest(), { onTextChunk: vi.fn() }),
    ).rejects.toThrow("Failed to fetch");
  });

  it("uses generateText and writes one complete chunk when streaming is disabled", async () => {
    aiSdkMocks.generateText.mockResolvedValue({
      text: "旧校舍的门轻轻打开。",
      finishReason: "stop",
    });
    const chunks: string[] = [];

    const client = new AiSdkProviderClient({
      providerName: "gateway",
      baseURL: "https://api.example.test/v1",
      model: "story-model",
      apiKey: "secret-key",
      streamingEnabled: false,
      harnessDeps: createHarnessDeps(),
    });

    const result = await client.stream(createRequest(), {
      onTextChunk: (chunk) => {
        chunks.push(chunk);
      },
    });

    expect(chunks).toEqual(["旧校舍的门轻轻打开。"]);
    expect(result).toEqual({
      finishReason: "stop",
      toolResults: [],
    });
    expect(aiSdkMocks.streamText).not.toHaveBeenCalled();
    expect(aiSdkMocks.generateText).toHaveBeenCalledWith(
      expect.objectContaining({
        model: { provider: "compatible", modelId: "story-model" },
        messages: createRequest().messages,
      }),
    );
  });
});
