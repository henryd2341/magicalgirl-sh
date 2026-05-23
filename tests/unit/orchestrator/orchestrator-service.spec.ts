import { ChatMessageService } from "@/engine/chatMessageService";
import { GameEngineFacade } from "@/engine/gameEngineFacade";
import { createSessionManager } from "@/engine/sessionManager";
import { VariableEngine } from "@/engine/variableEngine";
import { FakeStreamingProviderClient } from "@/orchestrator/providerClient";
import { OrchestratorService } from "@/orchestrator/orchestratorService";
import { buildHarnessRequest } from "@/orchestrator/promptBuilder";
import { ToolExecutor } from "@/orchestrator/toolExecutor";
import { InMemoryChatHistoryRepository } from "@/persistence/repositories/chatHistoryRepository";
import {
  InMemoryVariableChangeLogRepository,
  InMemoryVariableRepository,
} from "@/persistence/repositories/variableRepository";
import { InMemoryWorldInfoRepository } from "@/persistence/repositories/worldInfoRepository";
import { describe, expect, it } from "vitest";

describe("OrchestratorService", () => {
  it("streams fake provider chunks into a provisional assistant message and finalizes after commit ack", async () => {
    const chatRepository = new InMemoryChatHistoryRepository();
    const chatService = new ChatMessageService(chatRepository);
    const variableRepository = new InMemoryVariableRepository();
    await variableRepository.saveCurrent(new VariableEngine().createInitialState());

    const service = new OrchestratorService({
      chatService,
      gameEngineFacade: new GameEngineFacade(createSessionManager(), {
        variableRepository,
        variableChangeLogRepository: new InMemoryVariableChangeLogRepository(),
      }),
      providerClient: new FakeStreamingProviderClient({
        textChunks: ["旧校舍的门", "轻轻打开。"],
      }),
      toolExecutor: null,
      buildRequest(input) {
        return buildHarnessRequest({
          ...input,
          chatRepository,
          variableRepository,
          worldInfoRepository: new InMemoryWorldInfoRepository(),
          systemPrompt: "stable system",
          requestId: "req-orchestrator-001",
          contextVersion: 1,
          now: "2026-05-23T01:00:00.000Z",
        });
      },
      idFactory: {
        userMessageId: () => "msg-user-001",
        assistantMessageId: () => "msg-assistant-001",
      },
      now: () => "2026-05-23T01:00:00.000Z",
    });

    const result = await service.runUserTurn({
      userInput: "推开旧校舍的门。",
    });

    const messages = await chatRepository.list();
    expect(result.ok).toBe(true);
    expect(messages).toHaveLength(2);
    expect(messages[0]).toMatchObject({
      id: "msg-user-001",
      role: "user",
      finalized: true,
    });
    expect(messages[1]).toMatchObject({
      id: "msg-assistant-001",
      role: "assistant",
      content: "旧校舍的门轻轻打开。",
      provisional: false,
      finalized: true,
      failed: false,
      request_id: "req-orchestrator-001",
    });
  });

  it("marks the assistant response as a failed draft when the provider stream throws", async () => {
    const chatRepository = new InMemoryChatHistoryRepository();
    const chatService = new ChatMessageService(chatRepository);
    const variableRepository = new InMemoryVariableRepository();
    await variableRepository.saveCurrent(new VariableEngine().createInitialState());

    const service = new OrchestratorService({
      chatService,
      gameEngineFacade: new GameEngineFacade(createSessionManager(), {
        variableRepository,
        variableChangeLogRepository: new InMemoryVariableChangeLogRepository(),
      }),
      providerClient: new FakeStreamingProviderClient({
        textChunks: ["半句文本"],
        error: new Error("provider unavailable"),
      }),
      toolExecutor: null,
      buildRequest(input) {
        return buildHarnessRequest({
          ...input,
          chatRepository,
          variableRepository,
          worldInfoRepository: new InMemoryWorldInfoRepository(),
          systemPrompt: "stable system",
          requestId: "req-orchestrator-002",
          contextVersion: 1,
          now: "2026-05-23T01:05:00.000Z",
        });
      },
      idFactory: {
        userMessageId: () => "msg-user-002",
        assistantMessageId: () => "msg-assistant-002",
      },
      now: () => "2026-05-23T01:05:00.000Z",
    });

    const result = await service.runUserTurn({
      userInput: "继续。",
    });

    const failedDraft = await chatRepository.getById("msg-assistant-002");
    expect(result.ok).toBe(false);
    expect(result.error?.message).toBe("provider unavailable");
    expect(failedDraft).toMatchObject({
      kind: "failed_draft",
      content: "半句文本",
      finalized: false,
      failed: true,
    });
  });

  it("wraps provider tool calls with the current Harness metadata before executing them", async () => {
    const chatRepository = new InMemoryChatHistoryRepository();
    const chatService = new ChatMessageService(chatRepository);
    const variableRepository = new InMemoryVariableRepository();
    await variableRepository.saveCurrent(new VariableEngine().createInitialState());
    const facade = new GameEngineFacade(createSessionManager(), {
      variableRepository,
      variableChangeLogRepository: new InMemoryVariableChangeLogRepository(),
    });

    const service = new OrchestratorService({
      chatService,
      gameEngineFacade: facade,
      providerClient: new FakeStreamingProviderClient({
        textChunks: ["你捡起了硬币。"],
        toolCalls: [
          {
            tool_name: "update_variables",
            tool_call_id: "tool-update-money",
            input: {
              patches: [{ path: "player.money", value: 5 }],
            },
          },
        ],
      }),
      toolExecutor: new ToolExecutor(facade),
      buildRequest(input) {
        return buildHarnessRequest({
          ...input,
          chatRepository,
          variableRepository,
          worldInfoRepository: new InMemoryWorldInfoRepository(),
          systemPrompt: "stable system",
          requestId: "req-orchestrator-003",
          contextVersion: 11,
          now: "2026-05-23T01:10:00.000Z",
        });
      },
      idFactory: {
        userMessageId: () => "msg-user-003",
        assistantMessageId: () => "msg-assistant-003",
      },
      now: () => "2026-05-23T01:10:00.000Z",
    });

    const result = await service.runUserTurn({
      userInput: "捡起地上的硬币。",
    });

    const current = await variableRepository.getCurrent();
    expect(result.ok).toBe(true);
    expect(current?.root.player.money).toBe(5);
    expect(result.toolResults).toEqual([
      expect.objectContaining({
        ok: true,
        tool_name: "update_variables",
        tool_call_id: "tool-update-money",
      }),
    ]);
  });
});
