import type { BuiltProviderRequest } from "@/orchestrator/harnessContextTypes";
import { AiSdkProviderClient } from "@/orchestrator/aiSdkProviderClient";
import { beforeEach, describe, expect, it, vi } from "vitest";

const aiSdkMocks = vi.hoisted(() => ({
  generateText: vi.fn(),
  streamText: vi.fn(),
  tool: vi.fn((definition: unknown) => definition),
  createOpenAICompatible: vi.fn(),
}));

vi.mock("ai", () => ({
  generateText: aiSdkMocks.generateText,
  streamText: aiSdkMocks.streamText,
  tool: aiSdkMocks.tool,
}));

vi.mock("@ai-sdk/openai-compatible", () => ({
  createOpenAICompatible: aiSdkMocks.createOpenAICompatible,
}));

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
    aiSdkMocks.tool.mockClear();
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
    });

    const result = await client.stream(createRequest(), {
      onTextChunk: (chunk) => {
        chunks.push(chunk);
      },
    });

    expect(chunks).toEqual(["旧校舍的门", "轻轻打开。"]);
    expect(result).toEqual({
      finishReason: "stop",
      toolCalls: [],
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
          update_variables: expect.any(Object),
          trigger_battle: expect.any(Object),
        }),
      }),
    );
  });

  it("maps AI SDK tool calls into Harness provider candidates", async () => {
    aiSdkMocks.streamText.mockReturnValue({
      fullStream: streamParts([
        {
          type: "tool-call",
          toolCallId: "tool-trigger-001",
          toolName: "trigger_battle",
          input: {
            encounter_id: "enc-ai-sdk",
            enemies: [{ enemy_id: "shadow", count: 1 }],
            narrative_reason: "真实模型触发测试。",
          },
        },
        { type: "finish", finishReason: "tool-calls" },
      ]),
    });

    const client = new AiSdkProviderClient({
      providerName: "gateway",
      baseURL: "https://example.test/v1",
      model: "story-model",
      apiKey: "secret-key",
    });

    const result = await client.stream(createRequest(), {
      onTextChunk: vi.fn(),
    });

    expect(result.finishReason).toBe("tool_calls");
    expect(result.toolCalls).toEqual([
      {
        tool_name: "trigger_battle",
        tool_call_id: "tool-trigger-001",
        input: {
          encounter_id: "enc-ai-sdk",
          enemies: [{ enemy_id: "shadow", count: 1 }],
          narrative_reason: "真实模型触发测试。",
        },
      },
    ]);
    expect(aiSdkMocks.createOpenAICompatible).toHaveBeenCalledWith({
      name: "gateway",
      baseURL: "https://example.test/v1",
      apiKey: "secret-key",
    });
  });

  it("throws when the AI SDK reports an unknown Harness tool name", async () => {
    aiSdkMocks.streamText.mockReturnValue({
      fullStream: streamParts([
        {
          type: "tool-call",
          toolCallId: "tool-unknown",
          toolName: "unknown_tool",
          input: {},
        },
      ]),
    });

    const client = new AiSdkProviderClient({
      providerName: "gateway",
      baseURL: "https://example.test/v1",
      model: "story-model",
      apiKey: "secret-key",
    });

    await expect(
      client.stream(createRequest(), { onTextChunk: vi.fn() }),
    ).rejects.toThrow("[AI_SDK_PROVIDER_TOOL_UNSUPPORTED]");
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
    });

    await expect(
      client.stream(createRequest(), { onTextChunk: vi.fn() }),
    ).rejects.toThrow("Failed to fetch");
  });

  it("uses generateText and writes one complete chunk when streaming is disabled", async () => {
    aiSdkMocks.generateText.mockResolvedValue({
      text: "旧校舍的门轻轻打开。",
      finishReason: "stop",
      toolCalls: [],
    });
    const chunks: string[] = [];

    const client = new AiSdkProviderClient({
      providerName: "gateway",
      baseURL: "https://api.example.test/v1",
      model: "story-model",
      apiKey: "secret-key",
      streamingEnabled: false,
    });

    const result = await client.stream(createRequest(), {
      onTextChunk: (chunk) => {
        chunks.push(chunk);
      },
    });

    expect(chunks).toEqual(["旧校舍的门轻轻打开。"]);
    expect(result).toEqual({
      finishReason: "stop",
      toolCalls: [],
    });
    expect(aiSdkMocks.streamText).not.toHaveBeenCalled();
    expect(aiSdkMocks.generateText).toHaveBeenCalledWith(
      expect.objectContaining({
        model: { provider: "compatible", modelId: "story-model" },
        messages: createRequest().messages,
      }),
    );
  });

  it("maps generateText tool calls when streaming is disabled", async () => {
    aiSdkMocks.generateText.mockResolvedValue({
      text: "",
      finishReason: "tool-calls",
      toolCalls: [
        {
          type: "tool-call",
          toolCallId: "tool-update-001",
          toolName: "update_variables",
          input: {
            patches: [{ path: "player.money", value: 10 }],
          },
        },
      ],
    });

    const client = new AiSdkProviderClient({
      providerName: "gateway",
      baseURL: "https://api.example.test/v1",
      model: "story-model",
      apiKey: "secret-key",
      streamingEnabled: false,
    });

    await expect(
      client.stream(createRequest(), { onTextChunk: vi.fn() }),
    ).resolves.toEqual({
      finishReason: "tool_calls",
      toolCalls: [
        {
          tool_name: "update_variables",
          tool_call_id: "tool-update-001",
          input: {
            patches: [{ path: "player.money", value: 10 }],
          },
        },
      ],
    });
  });

  it("passes enhanced tool descriptions with writable/read-only/hidden paths to the AI SDK", async () => {
    aiSdkMocks.streamText.mockReturnValue({
      fullStream: streamParts([
        { type: "text", text: "ok" },
        { type: "finish", finishReason: "stop" },
      ]),
    });

    const client = new AiSdkProviderClient({
      providerName: "gateway",
      baseURL: "https://api.example.test/v1",
      model: "story-model",
      apiKey: "secret-key",
    });

    await client.stream(createRequest(), { onTextChunk: vi.fn() });

    const streamTextCall = aiSdkMocks.streamText.mock.calls[0][0];
    const tools = streamTextCall.tools as Record<string, { description: string }>;

    expect(tools).toBeDefined();

    const updateDesc = tools.update_variables.description;
    expect(updateDesc).toContain("Writable paths");
    expect(updateDesc).toContain("Read-only");
    expect(updateDesc).toContain("Hidden");
    expect(updateDesc).toContain("combat.level");
    expect(updateDesc).toContain("player.money");
    expect(updateDesc).toContain("player.relationships");
    expect(updateDesc).toContain("inventory.items");
    expect(updateDesc).toContain("equipment");
    expect(updateDesc).toContain("characters");

    const battleDesc = tools.trigger_battle.description;
    expect(battleDesc).toContain("encounter_id");
    expect(battleDesc).toContain("enemies");
    expect(battleDesc).toContain("modifiers");
    expect(battleDesc).toContain("narrative_reason");
    expect(battleDesc).toContain("first_battle");
  });
});
