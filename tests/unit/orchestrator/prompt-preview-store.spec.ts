import { createDefaultContextBudget } from "@/orchestrator/promptBuilder";
import { setActivePinia, createPinia } from "pinia";
import { beforeEach, describe, expect, it } from "vitest";
import { usePromptPreviewStore } from "@/stores/promptPreviewStore";

describe("prompt preview store", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it("records and clears the latest Harness request", () => {
    const store = usePromptPreviewStore();

    store.record({
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
    });

    expect(store.lastRequest?.metadata.request_id).toBe("req-preview");
    expect(store.lastRequest?.promptText).toBe("custom system prompt");

    store.clear();
    expect(store.lastRequest).toBeNull();
  });

  it("keeps budget-compatible segment data for preview rendering", () => {
    expect(createDefaultContextBudget()).toMatchObject({
      maxTotalTokens: expect.any(Number),
      maxWorldInfoEntries: expect.any(Number),
      maxHistoryMessages: expect.any(Number),
    });
  });
});
