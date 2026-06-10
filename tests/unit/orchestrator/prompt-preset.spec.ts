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
      .toMatchObject({
        systemPrompt,
        maxTotalTokens: createDefaultContextBudget().maxTotalTokens,
        previewMustacheVariables: false,
        updatedAt: "2026-05-26T12:00:00.000Z",
        customChainOfThought: expect.objectContaining({ enabled: false }),
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
      customChainOfThought: { enabled: false, template: "", style: "prefix", placement: "system_message", prefillText: "", beautifyTagName: "" },
    });

    await expect(repository.getCurrent()).resolves.toMatchObject({
      systemPrompt: "custom system prompt",
      maxTotalTokens: 1234,
      previewMustacheVariables: true,
      updatedAt: "2026-05-26T12:00:00.000Z",
      customChainOfThought: expect.objectContaining({ enabled: false }),
    });

    await expect(repository.resetToDefault()).resolves.toMatchObject(
      expect.objectContaining({
        systemPrompt,
        customChainOfThought: expect.objectContaining({ enabled: false }),
      }),
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

    await expect(repository.getCurrent()).resolves.toMatchObject({
      systemPrompt: "legacy prompt",
      maxTotalTokens: 4096,
      previewMustacheVariables: false,
      updatedAt: "2026-05-26T12:00:00.000Z",
      customChainOfThought: expect.objectContaining({ enabled: false }),
    });
  });
});
