import { createDefaultContextBudget } from "@/orchestrator/promptBuilder";
import { setActivePinia, createPinia } from "pinia";
import { beforeEach, describe, expect, it } from "vitest";
import { usePromptViewerStore } from "@/stores/promptViewerStore";

describe("prompt viewer store", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it("records and clears the latest Harness request", () => {
    const store = usePromptViewerStore();

    store.record(
      {
        metadata: {
          request_id: "req-preview",
          context_version: 1,
          state_hash: "initial",
          issued_at: "2026-05-26T12:01:00.000Z",
        },
        segments: [
          {
            id: "system",
            kind: "system",
            title: "System Prompt",
            content: "custom system prompt",
            source: "systemPrompt",
            tokenEstimate: 5,
            included: true,
          },
        ],
        traces: [],
        messages: [],
        tools: [],
        promptText: "custom system prompt",
      },
      {
        profileName: "gateway",
        kind: "openai-compatible",
        baseURL: "https://api.example.test/v1",
        model: "story-model",
        hasApiKey: true,
        streamingEnabled: true,
      },
    );

    expect(store.lastRequest?.metadata.request_id).toBe("req-preview");
    expect(store.lastRequest?.promptText).toBe("custom system prompt");
    expect(store.lastProviderInfo).toEqual({
      profileName: "gateway",
      kind: "openai-compatible",
      baseURL: "https://api.example.test/v1",
      model: "story-model",
      hasApiKey: true,
      streamingEnabled: true,
    });
    expect(JSON.stringify(store.lastProviderInfo)).not.toContain("secret");

    store.clear();
    expect(store.lastRequest).toBeNull();
    expect(store.lastProviderInfo).toBeNull();
  });

  it("keeps budget-compatible segment data for preview rendering", () => {
    expect(createDefaultContextBudget()).toMatchObject({
      maxTotalTokens: expect.any(Number),
    });
  });
});
