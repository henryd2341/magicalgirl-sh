import type { BuiltProviderRequest } from "@/orchestrator/harnessContextTypes";
import { AiSdkProviderClient } from "@/orchestrator/aiSdkProviderClient";
import { beforeEach, describe, expect, it, vi } from "vitest";

const aiSdkMocks = vi.hoisted(() => ({
  generateText: vi.fn(),
  streamText: vi.fn(),
  createOpenAICompatible: vi.fn(),
  createDeepSeek: vi.fn(),
  createOpenAI: vi.fn(),
  createAnthropic: vi.fn(),
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

vi.mock("@ai-sdk/deepseek", () => ({
  createDeepSeek: aiSdkMocks.createDeepSeek,
}));

vi.mock("@ai-sdk/openai", () => ({
  createOpenAI: aiSdkMocks.createOpenAI,
}));

vi.mock("@ai-sdk/anthropic", () => ({
  createAnthropic: aiSdkMocks.createAnthropic,
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
      },
      {
        name: "trigger_battle",
        description: "Trigger battle.",
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
    aiSdkMocks.createDeepSeek.mockReset();
    aiSdkMocks.createOpenAI.mockReset();
    aiSdkMocks.createAnthropic.mockReset();
    aiSdkMocks.createOpenAICompatible.mockReturnValue((modelId: string) => ({
      provider: "compatible",
      modelId,
    }));
    aiSdkMocks.createDeepSeek.mockReturnValue((modelId: string) => ({
      provider: "deepseek",
      modelId,
    }));
    aiSdkMocks.createOpenAI.mockReturnValue({
      responses: vi.fn((modelId: string) => ({
        provider: "openai.responses",
        modelId,
      })),
    });
    aiSdkMocks.createAnthropic.mockReturnValue((modelId: string) => ({
      provider: "anthropic",
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
  it("routes OpenAI profiles through the Responses model factory", async () => {
    aiSdkMocks.streamText.mockReturnValue({
      fullStream: streamParts([{ type: "finish", finishReason: "stop" }]),
    });
    const responses = vi.fn((modelId: string) => ({
      provider: "openai.responses",
      modelId,
    }));
    aiSdkMocks.createOpenAI.mockReturnValue({ responses });

    const client = new AiSdkProviderClient({
      providerKind: "openai-responses",
      providerName: "OpenAI",
      baseURL: "",
      model: "gpt-test",
      apiKey: "openai-secret",
      reasoningEffort: "high",
      harnessDeps: createHarnessDeps(),
    });

    await client.stream(createRequest(), { onTextChunk: vi.fn() });

    expect(aiSdkMocks.createOpenAI).toHaveBeenCalledWith({
      baseURL: undefined,
      apiKey: "openai-secret",
    });
    expect(responses).toHaveBeenCalledWith("gpt-test");
    expect(aiSdkMocks.streamText).toHaveBeenCalledWith(
      expect.objectContaining({
        model: { provider: "openai.responses", modelId: "gpt-test" },
        providerOptions: { openai: { reasoningEffort: "high" } },
      }),
    );
  });

  it("routes non-streaming Anthropic profiles through the Messages provider", async () => {
    aiSdkMocks.generateText.mockResolvedValue({
      text: "Claude response",
      finishReason: "stop",
    });
    const anthropic = vi.fn((modelId: string) => ({
      provider: "anthropic",
      modelId,
    }));
    aiSdkMocks.createAnthropic.mockReturnValue(anthropic);

    const client = new AiSdkProviderClient({
      providerKind: "anthropic",
      providerName: "Anthropic",
      baseURL: "https://proxy.example.test/v1",
      model: "claude-test",
      apiKey: "anthropic-secret",
      streamingEnabled: false,
      harnessDeps: createHarnessDeps(),
    });

    await client.stream(createRequest(), { onTextChunk: vi.fn() });

    expect(aiSdkMocks.createAnthropic).toHaveBeenCalledWith({
      baseURL: "https://proxy.example.test/v1",
      apiKey: "anthropic-secret",
    });
    expect(anthropic).toHaveBeenCalledWith("claude-test");
    expect(aiSdkMocks.generateText).toHaveBeenCalledWith(
      expect.objectContaining({
        model: { provider: "anthropic", modelId: "claude-test" },
      }),
    );
    expect(aiSdkMocks.generateText.mock.calls[0]?.[0])
      .not.toHaveProperty("providerOptions");
  });

  it("uses native provider routing for an independent tool profile", async () => {
    aiSdkMocks.streamText.mockReturnValue({
      fullStream: streamParts([{ type: "finish", finishReason: "stop" }]),
    });
    aiSdkMocks.generateText.mockResolvedValue({
      text: JSON.stringify({
        patches: [{ path: "player.money", value: 25 }],
      }),
    });
    const anthropic = vi.fn((modelId: string) => ({
      provider: "anthropic",
      modelId,
    }));
    aiSdkMocks.createAnthropic.mockReturnValue(anthropic);
    const dispatchCommand = vi.fn().mockResolvedValue({
      next: {},
      nextHash: "next-hash",
      previousValues: {},
    });

    const client = new AiSdkProviderClient({
      providerName: "main-compatible",
      baseURL: "https://main.example.test/v1",
      model: "main-model",
      harnessDeps: {
        dispatchCommand,
        getToolProfile: vi.fn().mockResolvedValue({
          id: "tool-anthropic",
          name: "Tool Anthropic",
          kind: "anthropic",
          baseURL: "",
          model: "claude-tool",
          apiKey: "tool-secret",
          temperature: 0.2,
          maxOutputTokens: 1024,
          streamingEnabled: false,
          builtIn: false,
          updatedAt: "2026-07-22T00:00:00.000Z",
        }),
      },
    });

    await client.stream(createRequest(), { onTextChunk: vi.fn() });
    const streamOptions = aiSdkMocks.streamText.mock.calls[0]?.[0] as {
      tools: {
        update_variables: {
          execute: (
            input: { patches: Array<{ path: string; value: unknown }> },
            options: { toolCallId: string },
          ) => Promise<unknown>;
        };
      };
    };
    await streamOptions.tools.update_variables.execute(
      { patches: [{ path: "player.money", value: 10 }] },
      { toolCallId: "tool-call-1" },
    );

    expect(aiSdkMocks.createAnthropic).toHaveBeenCalledWith({
      baseURL: undefined,
      apiKey: "tool-secret",
    });
    expect(anthropic).toHaveBeenCalledWith("claude-tool");
    expect(aiSdkMocks.generateText).toHaveBeenCalledWith(
      expect.objectContaining({
        model: { provider: "anthropic", modelId: "claude-tool" },
      }),
    );
    expect(dispatchCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "APPLY_VARIABLE_PATCH",
      }),
    );
  });
});
