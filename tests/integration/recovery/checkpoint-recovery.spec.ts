import { ChatMessageService } from "@/engine/chatMessageService";
import { createCheckpointManager } from "@/engine/checkpointManager";
import { GameEngineFacade } from "@/engine/gameEngineFacade";
import { RecoveryService } from "@/engine/recoveryService";
import { createSessionManager } from "@/engine/sessionManager";
import { VariableEngine } from "@/engine/variableEngine";
import { buildHarnessRequest } from "@/orchestrator/promptBuilder";
import { FakeStreamingProviderClient } from "@/orchestrator/providerClient";
import { OrchestratorService } from "@/orchestrator/orchestratorService";
import {
  DbWorkerClient,
  createInProcessDbWorkerEndpoint,
} from "@/persistence/dbClient";
import { DbChatHistoryRepository } from "@/persistence/repositories/chatHistoryRepository";
import { DbCheckpointRepository } from "@/persistence/repositories/checkpointRepository";
import { DbEventLogRepository } from "@/persistence/repositories/eventLogRepository";
import {
  DbVariableChangeLogRepository,
  DbVariableRepository,
} from "@/persistence/repositories/variableRepository";
import { InMemoryWorldInfoRepository } from "@/persistence/repositories/worldInfoRepository";
import { createDbWorkerRuntime } from "@/workers/db.worker";
import { describe, expect, it } from "vitest";

describe("checkpoint recovery integration", () => {
  it("rolls back failed provider output to the latest idle checkpoint", async () => {
    const client = new DbWorkerClient(
      createInProcessDbWorkerEndpoint(createDbWorkerRuntime()),
    );
    await client.initialize();

    const chatRepository = new DbChatHistoryRepository(client);
    const checkpointRepository = new DbCheckpointRepository(client);
    const eventLogRepository = new DbEventLogRepository(client);
    const variableRepository = new DbVariableRepository(client);
    const variableChangeLogRepository = new DbVariableChangeLogRepository(client);
    const chatService = new ChatMessageService(chatRepository);
    const sessionManager = createSessionManager();
    const gameEngineFacade = new GameEngineFacade(sessionManager, {
      variableRepository,
      variableChangeLogRepository,
    });
    const initialVariables = {
      ...new VariableEngine().createInitialState(),
      rootId: "root-before-failure",
      stateHash: "hash-before-failure",
    };

    await variableRepository.saveCurrent(initialVariables);
    await chatService.createUserMessage({
      id: "msg-seed",
      content: "我站在旧校舍门口。",
      createdAt: "2026-05-25T00:02:00.000Z",
    });

    const orchestrator = new OrchestratorService({
      chatService,
      gameEngineFacade,
      checkpointManager: createCheckpointManager({
        checkpointRepository,
        eventLogRepository,
        chatRepository,
        variableRepository,
        getSessionSnapshot: () => gameEngineFacade.getSessionSnapshot(),
        getPendingBattle: () => null,
        getActiveBattle: () => null,
        idFactory: {
          checkpointId: () => "checkpoint-before-provider-failure",
          eventId: () => "event-checkpoint-before-provider-failure",
        },
        now: () => "2026-05-25T00:02:01.000Z",
      }),
      eventLogRepository,
      providerClient: new FakeStreamingProviderClient({
        textChunks: ["门后传来一句未完成的话。"],
        error: new Error("provider stream interrupted"),
      }),
      buildRequest(input) {
        return buildHarnessRequest({
          ...input,
          chatRepository,
          variableRepository,
          worldInfoRepository: new InMemoryWorldInfoRepository(),
          systemPrompt: "stable system",
          requestId: "req-provider-failure",
          contextVersion: 12,
          now: "2026-05-25T00:02:01.000Z",
        });
      },
      idFactory: {
        userMessageId: () => "msg-user-failed-turn",
        assistantMessageId: () => "msg-assistant-failed-turn",
      },
      now: () => "2026-05-25T00:02:01.000Z",
    });

    const result = await orchestrator.runUserTurn({
      userInput: "推门进去。",
    });

    expect(result.ok).toBe(false);
    expect(gameEngineFacade.getSessionSnapshot().sessionState).toBe(
      "ERROR_RECOVERY",
    );
    expect(await chatRepository.getById("msg-assistant-failed-turn"))
      .toMatchObject({
        kind: "failed_draft",
        content: "门后传来一句未完成的话。",
      });

    await variableRepository.saveCurrent({
      ...initialVariables,
      rootId: "root-after-failure",
      stateHash: "hash-after-failure",
    });

    const recoveryService = new RecoveryService({
      checkpointRepository,
      eventLogRepository,
      chatRepository,
      variableRepository,
      restoreSessionSnapshot: (snapshot) =>
        gameEngineFacade.restoreSessionSnapshot(snapshot),
      idFactory: {
        eventId: () => "event-rollback-provider-failure",
      },
      now: () => "2026-05-25T00:02:02.000Z",
    });

    await expect(recoveryService.rollbackToLatest("idle_checkpoint")).resolves
      .toEqual({
        ok: true,
        checkpointId: "checkpoint-before-provider-failure",
      });

    expect((await chatRepository.list()).map((message) => message.id)).toEqual([
      "msg-seed",
      "msg-user-failed-turn",
    ]);
    expect(await chatRepository.getById("msg-assistant-failed-turn")).toBeNull();
    expect(await variableRepository.getCurrent()).toMatchObject({
      rootId: "root-before-failure",
      stateHash: "hash-before-failure",
    });
    expect(gameEngineFacade.getSessionSnapshot()).toEqual({
      sessionState: "IDLE",
      pipelineState: null,
      activeRequestId: null,
    });
    expect((await eventLogRepository.list()).map((event) => event.type))
      .toEqual(["CheckpointCreated", "RequestStarted", "RollbackCompleted"]);
  });
});
