import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  maybeSummarizeHistory,
  __resetSummarizationLock,
} from "@/engine/summary/historySummarizer";
import type { ChatMessage } from "@/types/chat";
import type { ProviderClient, ProviderStreamCallbacks } from "@/orchestrator/providerClient";
import { FakeStreamingProviderClient } from "@/orchestrator/providerClient";
import type { ProviderSettingsState } from "@/orchestrator/providerSettings";

function makeMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: `msg-${Math.random().toString(36).slice(2, 10)}`,
    role: "user",
    kind: "normal",
    content: "test content",
    user_visible: true,
    ai_visible: true,
    provisional: false,
    finalized: true,
    failed: false,
    created_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function makeSettings(overrides: Partial<ProviderSettingsState> = {}): ProviderSettingsState {
  return {
    activeProfileId: "builtin-fake",
    profiles: [],
    summaryProfileId: null,
    summaryEnabled: true,
    summaryTokenThreshold: 100,
    summaryOldRatio: 0.5,
    summaryMinMessages: 6,
    toolProfileIds: {},
    ...overrides,
  };
}

interface MockDeps {
  messages: ChatMessage[];
  settings: ProviderSettingsState;
  providerClient?: ProviderClient;
  createSummaryMessage?: vi.Mock;
}

function makeDeps(deps: MockDeps) {
  const repository = {
    list: vi.fn(async () => deps.messages),
    save: vi.fn(async (msg: ChatMessage) => { /* no-op, void return */ }),
    getById: vi.fn(async (id: string) => deps.messages.find((m) => m.id === id) ?? null),
  };
  const createSummaryMessage =
    deps.createSummaryMessage ??
    vi.fn(async (input: { id: string; content: string; createdAt: string }) =>
      makeMessage({
        id: input.id,
        role: "system",
        kind: "context_summary",
        content: input.content,
        user_visible: false,
        ai_visible: true,
        created_at: input.createdAt,
      }),
    );
  const settingsRepo = {
    getState: vi.fn(async () => deps.settings),
  };
  const providerClient =
    deps.providerClient ??
    new FakeStreamingProviderClient({
      textChunks: ["A concise summary of events."],
    });
  const providerClientFactory = vi.fn(async () => providerClient);

  return {
    chatRepository: repository,
    createSummaryMessage,
    settingsRepo,
    providerClientFactory,
    _repository: repository,
    _createSummaryMessage: createSummaryMessage,
    _providerClientFactory: providerClientFactory,
  };
}

describe("maybeSummarizeHistory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    __resetSummarizationLock();
  });

  it("does nothing when summaryEnabled is false (AC8)", async () => {
    const deps = makeDeps({
      messages: [
        makeMessage({ id: "m1", content: "a".repeat(500) }),
        makeMessage({ id: "m2", content: "b".repeat(500) }),
      ],
      settings: makeSettings({ summaryEnabled: false }),
    });

    await maybeSummarizeHistory(deps);

    expect(deps._createSummaryMessage).not.toHaveBeenCalled();
    expect(deps._repository.save).not.toHaveBeenCalled();
  });

  it("does nothing when estimated tokens are below threshold (AC9)", async () => {
    const deps = makeDeps({
      messages: [
        makeMessage({ id: "m1", content: "short" }),
        makeMessage({ id: "m2", content: "short" }),
      ],
      settings: makeSettings({ summaryTokenThreshold: 10000 }),
    });

    await maybeSummarizeHistory(deps);

    expect(deps._createSummaryMessage).not.toHaveBeenCalled();
    expect(deps._providerClientFactory).not.toHaveBeenCalled();
  });

  it("creates context_summary and invalidates old messages when threshold is exceeded (AC1 happy path)", async () => {
    const longContent = "x".repeat(200);
    const messages = Array.from({ length: 8 }, (_, i) =>
      makeMessage({
        id: `msg-${i}`,
        content: longContent,
        created_at: `2026-01-01T00:0${i}:00.000Z`,
      }),
    );
    const deps = makeDeps({
      messages,
    settings: makeSettings({ summaryTokenThreshold: 50, summaryOldRatio: 0.5, summaryMinMessages: 3 }),
  });

  await maybeSummarizeHistory(deps);

  expect(deps._createSummaryMessage).toHaveBeenCalledTimes(1);
  expect(deps._repository.save).toHaveBeenCalled();
  const savedArgs = deps._repository.save.mock.calls.map((c) => c[0] as ChatMessage);
  const invalidated = savedArgs.filter((m) => m.ai_visible === false);
  expect(invalidated.length).toBeGreaterThan(0);
  expect(deps._createSummaryMessage.mock.calls[0][0].content).toContain("summary");
});

  it("does nothing when oldMessages has fewer than summaryMinMessages (default 6)", async () => {
    const veryLongContent = "x".repeat(1000);
    const messages = Array.from({ length: 10 }, (_, i) =>
      makeMessage({
        id: `m${i}`,
        content: veryLongContent,
        created_at: `2026-01-01T00:0${i}:00.000Z`,
      }),
    );
    const deps = makeDeps({
      messages,
      settings: makeSettings({ summaryTokenThreshold: 50, summaryOldRatio: 0.5, summaryMinMessages: 6 }),
    });

    await maybeSummarizeHistory(deps);

    expect(deps._createSummaryMessage).not.toHaveBeenCalled();
  });

  it("proceeds when oldMessages length meets summaryMinMessages threshold", async () => {
    const longContent = "x".repeat(200);
    const messages = Array.from({ length: 20 }, (_, i) =>
      makeMessage({
        id: `m${i}`,
        content: longContent,
        created_at: `2026-01-01T00:${String(i).padStart(2, "0")}:00.000Z`,
      }),
    );
    const deps = makeDeps({
      messages,
      settings: makeSettings({ summaryTokenThreshold: 50, summaryOldRatio: 0.5, summaryMinMessages: 6 }),
    });

    await maybeSummarizeHistory(deps);

    expect(deps._createSummaryMessage).toHaveBeenCalledTimes(1);
  });

  it("respects custom summaryMinMessages higher than default", async () => {
    const longContent = "x".repeat(200);
    const messages = Array.from({ length: 20 }, (_, i) =>
      makeMessage({
        id: `m${i}`,
        content: longContent,
        created_at: `2026-01-01T00:${String(i).padStart(2, "0")}:00.000Z`,
      }),
    );
    const deps = makeDeps({
      messages,
      settings: makeSettings({ summaryTokenThreshold: 50, summaryOldRatio: 0.5, summaryMinMessages: 15 }),
    });

    await maybeSummarizeHistory(deps);

    expect(deps._createSummaryMessage).not.toHaveBeenCalled();
  });

  it("does nothing when AI returns empty summary (AC7)", async () => {
    const longContent = "x".repeat(200);
    const messages = Array.from({ length: 8 }, (_, i) =>
      makeMessage({
        id: `msg-${i}`,
        content: longContent,
        created_at: `2026-01-01T00:0${i}:00.000Z`,
      }),
    );
    const emptyProvider = new FakeStreamingProviderClient({ textChunks: [""] });
    const deps = makeDeps({
      messages,
      settings: makeSettings({ summaryTokenThreshold: 50, summaryOldRatio: 0.5, summaryMinMessages: 3 }),
      providerClient: emptyProvider,
    });

    await maybeSummarizeHistory(deps);

    expect(deps._createSummaryMessage).not.toHaveBeenCalled();
    const saves = deps._repository.save.mock.calls.map((c) => c[0] as ChatMessage);
    const invalidated = saves.filter((m) => m.ai_visible === false);
    expect(invalidated).toHaveLength(0);
  });

  it("picks the LATEST context_summary as previousSummary, not the first (AC3)", async () => {
    const longContent = "x".repeat(200);
    const messages = [
      ...Array.from({ length: 8 }, (_, i) =>
        makeMessage({
          id: `msg-${i}`,
          content: longContent,
          created_at: `2026-01-01T00:0${i}:00.000Z`,
        }),
      ),
      makeMessage({
        id: "old-summary",
        role: "system",
        kind: "context_summary",
        content: "OLD SUMMARY",
        user_visible: false,
        ai_visible: true,
        created_at: "2026-01-01T00:00:30.000Z",
      }),
      makeMessage({
        id: "latest-summary",
        role: "system",
        kind: "context_summary",
        content: "LATEST SUMMARY",
        user_visible: false,
        ai_visible: true,
        created_at: "2026-01-01T00:05:30.000Z",
      }),
    ];
    const streamSpy = vi.fn(async (_req: unknown, callbacks: ProviderStreamCallbacks) => {
      await callbacks.onTextChunk("New summary.");
      return { finishReason: "stop" as const, toolResults: [] };
    });
    const providerClient: ProviderClient = {
      stream: streamSpy as unknown as ProviderClient["stream"],
    };
    const deps = makeDeps({
      messages,
      settings: makeSettings({ summaryTokenThreshold: 50, summaryOldRatio: 0.5, summaryMinMessages: 3 }),
      providerClient,
    });

    await maybeSummarizeHistory(deps);

    expect(deps._createSummaryMessage).toHaveBeenCalledTimes(1);
    const request = (streamSpy.mock.calls[0] as unknown[])[0] as {
      messages: Array<{ role: string; content: string }>;
    };
    const systemMessages = request.messages.filter((m) => m.role === "system");
    const prevSummaryMsg = systemMessages.find((m) =>
      m.content.includes("Previous summary"),
    );
    expect(prevSummaryMsg).toBeDefined();
    expect(prevSummaryMsg!.content).toContain("LATEST SUMMARY");
    expect(prevSummaryMsg!.content).not.toContain("OLD SUMMARY");
  });

  it("invalidates prior context_summary messages when creating a new one (AC5)", async () => {
    const longContent = "x".repeat(200);
    const messages = [
      ...Array.from({ length: 8 }, (_, i) =>
        makeMessage({
          id: `msg-${i}`,
          content: longContent,
          created_at: `2026-01-01T00:0${i}:00.000Z`,
        }),
      ),
      makeMessage({
        id: "prev-summary",
        role: "system",
        kind: "context_summary",
        content: "PREV",
        user_visible: false,
        ai_visible: true,
        created_at: "2026-01-01T00:03:30.000Z",
      }),
    ];
    const deps = makeDeps({
      messages,
      settings: makeSettings({ summaryTokenThreshold: 50, summaryOldRatio: 0.5, summaryMinMessages: 3 }),
    });

    await maybeSummarizeHistory(deps);

    const saves = deps._repository.save.mock.calls.map((c) => c[0] as ChatMessage);
    const prevSummarySaves = saves.filter((s) => s.id === "prev-summary");
    expect(prevSummarySaves).toHaveLength(1);
    expect(prevSummarySaves[0].ai_visible).toBe(false);
  });

  it("prevents concurrent execution: only one call proceeds, others skip (AC4)", async () => {
    const longContent = "x".repeat(200);
    const messages = Array.from({ length: 8 }, (_, i) =>
      makeMessage({
        id: `msg-${i}`,
        content: longContent,
        created_at: `2026-01-01T00:0${i}:00.000Z`,
      }),
    );

    let resolveStream: () => void = () => {};
    let signalStreamReady: () => void = () => {};
    const streamReadyPromise = new Promise<void>((resolve) => {
      signalStreamReady = resolve;
    });
    const blockedProvider: ProviderClient = {
      stream: vi.fn(
        async (_req: unknown, callbacks: ProviderStreamCallbacks) => {
          await callbacks.onTextChunk("A summary.");
          signalStreamReady();
          return new Promise((resolve) => {
            resolveStream = () =>
              resolve({
                finishReason: "stop" as const,
                toolResults: [],
              });
          });
        },
      ) as unknown as ProviderClient["stream"],
    };

    const deps = makeDeps({
      messages,
      settings: makeSettings({ summaryTokenThreshold: 50, summaryOldRatio: 0.5, summaryMinMessages: 3 }),
      providerClient: blockedProvider,
    });

    const promise1 = maybeSummarizeHistory(deps);
    const promise2 = maybeSummarizeHistory(deps);
    await streamReadyPromise;
    resolveStream();
    await Promise.all([promise1, promise2]);

    expect(deps._createSummaryMessage).toHaveBeenCalledTimes(1);
  });

  it("splits by cumulative tokens, not message count (AC6)", async () => {
    const messages = [
      makeMessage({ id: "m1", content: "x".repeat(100), created_at: "2026-01-01T00:00:00.000Z" }),
      makeMessage({ id: "m2", content: "x".repeat(100), created_at: "2026-01-01T00:01:00.000Z" }),
      makeMessage({ id: "m3", content: "x".repeat(20000), created_at: "2026-01-01T00:02:00.000Z" }),
      makeMessage({ id: "m4", content: "x".repeat(100), created_at: "2026-01-01T00:03:00.000Z" }),
      makeMessage({ id: "m5", content: "x".repeat(100), created_at: "2026-01-01T00:04:00.000Z" }),
      makeMessage({ id: "m6", content: "x".repeat(100), created_at: "2026-01-01T00:05:00.000Z" }),
    ];
    const streamSpy = vi.fn(async (_req: unknown, callbacks: ProviderStreamCallbacks) => {
      await callbacks.onTextChunk("New summary.");
      return { finishReason: "stop" as const, toolResults: [] };
    });
    const providerClient: ProviderClient = {
      stream: streamSpy as unknown as ProviderClient["stream"],
    };
    const deps = makeDeps({
      messages,
      settings: makeSettings({ summaryTokenThreshold: 50, summaryOldRatio: 0.5, summaryMinMessages: 3 }),
      providerClient,
    });

    await maybeSummarizeHistory(deps);

    expect(deps._createSummaryMessage).toHaveBeenCalledTimes(1);
    const request = (streamSpy.mock.calls[0] as unknown[])[0] as {
      messages: Array<{ role: string; content: string }>;
    };
    const userPrompt = request.messages.find((m) => m.role === "user");
    expect(userPrompt).toBeDefined();
    const invalidatedSaves = deps._repository.save.mock.calls
      .map((c) => c[0] as ChatMessage)
      .filter((m) => m.ai_visible === false && m.kind === "normal");
    const invalidatedIds = invalidatedSaves.map((m) => m.id);
    expect(invalidatedIds).toContain("m1");
    expect(invalidatedIds).toContain("m2");
    expect(invalidatedIds).toContain("m3");
    expect(invalidatedIds).not.toContain("m4");
  });
});
