import {
  createDefaultPromptPresetConfig,
  InMemoryPromptPresetRepository,
} from "@/orchestrator/promptPreset";
import { createDefaultContextBudget } from "@/orchestrator/promptBuilder";
import systemPrompt from "@/content/systemPrompt.md?raw";
import { describe, expect, it } from "vitest";

describe("prompt preset config", () => {
  it("creates defaults from the bundled system prompt and context budget", () => {
    expect(createDefaultPromptPresetConfig("2026-05-26T12:00:00.000Z"))
      .toEqual({
        systemPrompt,
        budget: createDefaultContextBudget(),
        updatedAt: "2026-05-26T12:00:00.000Z",
      });
  });

  it("saves, reads, and resets the current prompt preset", async () => {
    const repository = new InMemoryPromptPresetRepository({
      now: () => "2026-05-26T12:00:00.000Z",
    });

    await repository.saveCurrent({
      systemPrompt: "custom system prompt",
      budget: {
        maxTotalTokens: 1234,
        maxWorldInfoEntries: 2,
        maxHistoryMessages: 3,
      },
      updatedAt: "ignored-by-repository",
    });

    await expect(repository.getCurrent()).resolves.toEqual({
      systemPrompt: "custom system prompt",
      budget: {
        maxTotalTokens: 1234,
        maxWorldInfoEntries: 2,
        maxHistoryMessages: 3,
      },
      updatedAt: "2026-05-26T12:00:00.000Z",
    });

    await expect(repository.resetToDefault()).resolves.toEqual(
      createDefaultPromptPresetConfig("2026-05-26T12:00:00.000Z"),
    );
  });
});
