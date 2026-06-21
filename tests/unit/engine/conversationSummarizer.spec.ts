import { describe, it, expect, vi } from "vitest";
import { ConversationSummarizer } from "@/engine/conversationSummarizer";
import { FakeStreamingProviderClient } from "@/orchestrator/providerClient";
import type { ProviderStreamCallbacks } from "@/orchestrator/providerClient";

function captureRequest() {
  const captured: {
    request?: unknown;
    callbacks?: ProviderStreamCallbacks;
  } = {};
  const spyClient = {
    stream: vi.fn(async (request: unknown, callbacks: ProviderStreamCallbacks) => {
      captured.request = request;
      captured.callbacks = callbacks;
      return { finishReason: "stop" as const, toolResults: [] };
    }),
  };
  return { captured, client: spyClient as unknown as { stream: unknown } };
}

describe("ConversationSummarizer", () => {
  it("passes tools: [] to the provider (AC12)", async () => {
    const { captured, client } = captureRequest();
    const summarizer = new ConversationSummarizer({
      providerClient: client as never,
    });

    await summarizer.summarize({
      messages: [{ role: "user", content: "hello" }],
    });

    expect(captured.request).toBeDefined();
    const req = captured.request as { tools: unknown[] };
    expect(req.tools).toEqual([]);
  });

  it("injects previousSummary as a second system message (AC11)", async () => {
    const { captured, client } = captureRequest();
    const summarizer = new ConversationSummarizer({
      providerClient: client as never,
    });

    await summarizer.summarize({
      messages: [{ role: "user", content: "new events" }],
      previousSummary: "PREV SUMMARY TEXT",
    });

    const req = captured.request as {
      messages: Array<{ role: string; content: string }>;
    };
    const systemMessages = req.messages.filter((m) => m.role === "system");
    expect(systemMessages.length).toBeGreaterThanOrEqual(2);
    const prevSummaryMsg = systemMessages.find((m) =>
      m.content.includes("Previous summary"),
    );
    expect(prevSummaryMsg).toBeDefined();
    expect(prevSummaryMsg!.content).toContain("PREV SUMMARY TEXT");
  });

  it("does not inject previousSummary system message when none is provided", async () => {
    const { captured, client } = captureRequest();
    const summarizer = new ConversationSummarizer({
      providerClient: client as never,
    });

    await summarizer.summarize({
      messages: [{ role: "user", content: "events" }],
    });

    const req = captured.request as {
      messages: Array<{ role: string; content: string }>;
    };
    const systemMessages = req.messages.filter((m) => m.role === "system");
    expect(systemMessages).toHaveLength(1);
    expect(systemMessages[0].content).not.toContain("Previous summary");
  });

  it("accumulates text chunks and returns trimmed result", async () => {
    const fake = new FakeStreamingProviderClient({
      textChunks: ["  Hello ", " world  "],
    });
    const summarizer = new ConversationSummarizer({ providerClient: fake });

    const result = await summarizer.summarize({
      messages: [{ role: "user", content: "events" }],
    });

    expect(result).toBe("Hello  world");
  });

  it("uses crypto.randomUUID for request_id when available (Minor 11)", async () => {
    const { captured, client } = captureRequest();
    const summarizer = new ConversationSummarizer({
      providerClient: client as never,
    });

    await summarizer.summarize({
      messages: [{ role: "user", content: "events" }],
    });

    const req = captured.request as {
      metadata: { request_id: string };
    };
    expect(req.metadata.request_id).toMatch(/^summary-/);
    expect(req.metadata.request_id).not.toBe("summary-undefined");
    expect(req.metadata.request_id.length).toBeGreaterThan("summary-".length + 8);
  });

  it("discards reasoning chunks (Minor 8): onReasoningChunk does not append to summary", async () => {
    const captured: { callbacks?: ProviderStreamCallbacks } = {};
    const fakeClient = {
      stream: vi.fn(async (_req: unknown, callbacks: ProviderStreamCallbacks) => {
        captured.callbacks = callbacks;
        await callbacks.onTextChunk("text ");
        if (callbacks.onReasoningChunk) {
          await callbacks.onReasoningChunk("SHOULD NOT APPEAR IN SUMMARY");
        }
        await callbacks.onTextChunk("result");
        return { finishReason: "stop" as const, toolResults: [] };
      }),
    };
    const summarizer = new ConversationSummarizer({
      providerClient: fakeClient as never,
    });

    const result = await summarizer.summarize({
      messages: [{ role: "user", content: "events" }],
    });

    expect(result).toBe("text result");
    expect(result).not.toContain("SHOULD NOT APPEAR");
  });

  it("provides onReasoningChunk callback to the provider stream", async () => {
    const captured: { callbacks?: ProviderStreamCallbacks } = {};
    const fakeClient = {
      stream: vi.fn(async (_req: unknown, callbacks: ProviderStreamCallbacks) => {
        captured.callbacks = callbacks;
        return { finishReason: "stop" as const, toolResults: [] };
      }),
    };
    const summarizer = new ConversationSummarizer({
      providerClient: fakeClient as never,
    });

    await summarizer.summarize({
      messages: [{ role: "user", content: "events" }],
    });

    expect(captured.callbacks?.onReasoningChunk).toBeDefined();
    expect(typeof captured.callbacks?.onReasoningChunk).toBe("function");
  });

  it("truncates summaries exceeding 280 words at sentence boundary (Minor 9)", async () => {
    const longWordList = Array.from({ length: 400 }, (_, i) => `word${i}`).join(" ");
    const fake = new FakeStreamingProviderClient({
      textChunks: [longWordList],
    });
    const summarizer = new ConversationSummarizer({ providerClient: fake });

    const result = await summarizer.summarize({
      messages: [{ role: "user", content: "events" }],
    });

    const wordCount = result.split(/\s+/).filter(Boolean).length;
    expect(wordCount).toBeLessThanOrEqual(281);
  });
});
