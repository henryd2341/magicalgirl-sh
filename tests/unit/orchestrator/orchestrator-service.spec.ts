import { ChatMessageService } from "@/engine/chatMessageService";
import { createCheckpointManager } from "@/engine/checkpointManager";
import { GameEngineFacade } from "@/engine/gameEngineFacade";
import { createSessionManager } from "@/engine/sessionManager";
import { VariableEngine } from "@/engine/variableEngine";
import { FakeStreamingProviderClient } from "@/orchestrator/providerClient";
import { OrchestratorService } from "@/orchestrator/orchestratorService";
import { buildHarnessRequest } from "@/orchestrator/promptBuilder";
import { InMemoryChatHistoryRepository } from "@/persistence/repositories/chatHistoryRepository";
import { InMemoryCheckpointRepository } from "@/persistence/repositories/checkpointRepository";
import { InMemoryEventLogRepository } from "@/persistence/repositories/eventLogRepository";
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
    const checkpointRepository = new InMemoryCheckpointRepository();
    const eventLogRepository = new InMemoryEventLogRepository();
    const variableRepository = new InMemoryVariableRepository();
    await variableRepository.saveCurrent(new VariableEngine().createInitialState());
    const facade = new GameEngineFacade(createSessionManager(), {
      variableRepository,
      variableChangeLogRepository: new InMemoryVariableChangeLogRepository(),
    });

    const service = new OrchestratorService({
      chatService,
      gameEngineFacade: facade,
      checkpointManager: createCheckpointManager({
        checkpointRepository,
        eventLogRepository,
        chatRepository,
        variableRepository,
        getSessionSnapshot: () => facade.getSessionSnapshot(),
        getPendingBattle: () => null,
        getActiveBattle: () => null,
        idFactory: {
          checkpointId: () => "checkpoint-orchestrator-001",
          eventId: () => "event-checkpoint-orchestrator-001",
        },
        now: () => "2026-05-23T01:00:00.000Z",
      }),
      eventLogRepository,
      providerClient: new FakeStreamingProviderClient({
        textChunks: ["旧校舍的门", "轻轻打开。"],
      }),
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
    expect(await checkpointRepository.getLatestByKind("idle_checkpoint"))
      .toMatchObject({
        id: "checkpoint-orchestrator-001",
        kind: "idle_checkpoint",
        contextVersion: 1,
        metadata: {
          requestId: "req-orchestrator-001",
        },
      });
    expect((await eventLogRepository.list()).map((event) => event.type)).toEqual(
      ["CheckpointCreated", "RequestStarted", "AssistantMessageFinalized"],
    );
  });

  it("marks the assistant response as a failed draft when the provider stream throws", async () => {
    const chatRepository = new InMemoryChatHistoryRepository();
    const chatService = new ChatMessageService(chatRepository);
    const checkpointRepository = new InMemoryCheckpointRepository();
    const eventLogRepository = new InMemoryEventLogRepository();
    const variableRepository = new InMemoryVariableRepository();
    await variableRepository.saveCurrent(new VariableEngine().createInitialState());
    const facade = new GameEngineFacade(createSessionManager(), {
      variableRepository,
      variableChangeLogRepository: new InMemoryVariableChangeLogRepository(),
    });

    const service = new OrchestratorService({
      chatService,
      gameEngineFacade: facade,
      checkpointManager: createCheckpointManager({
        checkpointRepository,
        eventLogRepository,
        chatRepository,
        variableRepository,
        getSessionSnapshot: () => facade.getSessionSnapshot(),
        getPendingBattle: () => null,
        getActiveBattle: () => null,
        idFactory: {
          checkpointId: () => "checkpoint-orchestrator-failure",
          eventId: () => "event-checkpoint-orchestrator-failure",
        },
        now: () => "2026-05-23T01:05:00.000Z",
      }),
      eventLogRepository,
      providerClient: new FakeStreamingProviderClient({
        textChunks: ["半句文本"],
        error: new Error("provider unavailable"),
      }),
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
    expect(await checkpointRepository.getLatestByKind("idle_checkpoint"))
      .toMatchObject({
        id: "checkpoint-orchestrator-failure",
        metadata: {
          requestId: "req-orchestrator-002",
        },
      });
    expect((await eventLogRepository.list()).map((event) => event.type)).toEqual(
      ["CheckpointCreated", "RequestStarted"],
    );
  });

  it("writes a visible failed draft message when the provider fails before streaming text", async () => {
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
        textChunks: [],
        error: new TypeError("Failed to fetch"),
      }),
      buildRequest(input) {
        return buildHarnessRequest({
          ...input,
          chatRepository,
          variableRepository,
          worldInfoRepository: new InMemoryWorldInfoRepository(),
          systemPrompt: "stable system",
          requestId: "req-orchestrator-fetch-failure",
          contextVersion: 1,
          now: "2026-05-27T12:20:00.000Z",
        });
      },
      idFactory: {
        userMessageId: () => "msg-user-fetch-failure",
        assistantMessageId: () => "msg-assistant-fetch-failure",
      },
      now: () => "2026-05-27T12:20:00.000Z",
    });

    const result = await service.runUserTurn({
      userInput: "继续。",
    });

    const failedDraft = await chatRepository.getById(
      "msg-assistant-fetch-failure",
    );
    expect(result.ok).toBe(false);
    expect(failedDraft).toMatchObject({
      kind: "failed_draft",
      content: "生成失败：Failed to fetch",
      failed: true,
    });
  });

  it("reports tool results from the provider stream", async () => {
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
        toolResults: [
          {
            tool_name: "update_variables",
            tool_call_id: "tool-update-money",
            ok: true,
            output: { next: {}, nextHash: "hash" },
          },
        ],
      }),
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

    expect(result.ok).toBe(true);
    expect(result.toolResults).toEqual([
      expect.objectContaining({
        ok: true,
        tool_name: "update_variables",
        tool_call_id: "tool-update-money",
      }),
    ]);
  });

  it("throws when a tool result is not ok", async () => {
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
        textChunks: [],
        toolResults: [
          {
            tool_name: "update_variables",
            tool_call_id: "tool-broken",
            ok: false,
            error: "state hash mismatch",
          },
        ],
      }),
      buildRequest(input) {
        return buildHarnessRequest({
          ...input,
          chatRepository,
          variableRepository,
          worldInfoRepository: new InMemoryWorldInfoRepository(),
          systemPrompt: "stable system",
          requestId: "req-orchestrator-004",
          contextVersion: 12,
          now: "2026-05-23T02:00:00.000Z",
        });
      },
      idFactory: {
        userMessageId: () => "msg-user-004",
        assistantMessageId: () => "msg-assistant-004",
      },
      now: () => "2026-05-23T02:00:00.000Z",
    });

    const result = await service.runUserTurn({
      userInput: "触发失败工具。",
    });

    expect(result.ok).toBe(false);
    expect(result.error?.message).toContain("TOOL_EXECUTION_FAILED");
    expect(result.toolResults[0].ok).toBe(false);
  });
});
