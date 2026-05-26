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
        maxTotalTokens: createDefaultContextBudget().maxTotalTokens,
        previewMustacheVariables: false,
        updatedAt: "2026-05-26T12:00:00.000Z",
      });
  });

  it("saves, reads, and resets the current prompt preset", async () => {
    const repository = new InMemoryPromptPresetRepository({
      now: () => "2026-05-26T12:00:00.000Z",
    });

    await repository.saveCurrent({
      systemPrompt: "custom system prompt",
      maxTotalTokens: 1234,
      previewMustacheVariables: true,
      updatedAt: "ignored-by-repository",
    });

    await expect(repository.getCurrent()).resolves.toEqual({
      systemPrompt: "custom system prompt",
      maxTotalTokens: 1234,
      previewMustacheVariables: true,
      updatedAt: "2026-05-26T12:00:00.000Z",
    });

    await expect(repository.resetToDefault()).resolves.toEqual(
      createDefaultPromptPresetConfig("2026-05-26T12:00:00.000Z"),
    );
  });

  it("normalizes legacy budget-shaped prompt preset configs", async () => {
    const repository = new InMemoryPromptPresetRepository({
      now: () => "2026-05-26T12:00:00.000Z",
    });

    await repository.saveCurrent({
      systemPrompt: "legacy prompt",
      budget: {
        maxTotalTokens: 4096,
        maxWorldInfoEntries: 1,
        maxHistoryMessages: 1,
      },
      updatedAt: "legacy",
    });

    await expect(repository.getCurrent()).resolves.toEqual({
      systemPrompt: "legacy prompt",
      maxTotalTokens: 4096,
      previewMustacheVariables: false,
      updatedAt: "2026-05-26T12:00:00.000Z",
    });
  });
});
