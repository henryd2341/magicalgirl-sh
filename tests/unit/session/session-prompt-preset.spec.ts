import { InMemoryChatHistoryRepository } from "@/persistence/repositories/chatHistoryRepository";
import { InMemoryVariableRepository } from "@/persistence/repositories/variableRepository";
import { InMemoryWorldInfoRepository } from "@/persistence/repositories/worldInfoRepository";
import { buildConfiguredHarnessRequest } from "@/orchestrator/configuredPromptBuilder";
import { InMemoryPromptPresetRepository } from "@/orchestrator/promptPreset";
import { describe, expect, it } from "vitest";

describe("configured Harness request builder", () => {
  it("uses the saved prompt preset system prompt and budget", async () => {
    const promptPresetRepository = new InMemoryPromptPresetRepository({
      now: () => "2026-05-26T12:03:00.000Z",
    });
    await promptPresetRepository.saveCurrent({
      systemPrompt: "custom configured system",
      budget: {
        maxTotalTokens: 2048,
        maxWorldInfoEntries: 1,
        maxHistoryMessages: 1,
      },
      updatedAt: "ignored",
    });

    const request = await buildConfiguredHarnessRequest({
      chatRepository: new InMemoryChatHistoryRepository(),
      variableRepository: new InMemoryVariableRepository(),
      worldInfoRepository: new InMemoryWorldInfoRepository(),
      promptPresetRepository,
      userInput: "继续。",
      requestId: "req-configured-preset",
      contextVersion: 21,
      now: "2026-05-26T12:04:00.000Z",
    });

    expect(request.segments[0]).toMatchObject({
      id: "system",
      content: "custom configured system",
    });
    expect(request.metadata.request_id).toBe("req-configured-preset");
  });
});
