import { ChatMessageService } from "@/engine/chatMessageService";
import { GameEngineFacade } from "@/engine/gameEngineFacade";
import { RecoveryService } from "@/engine/recoveryService";
import { createSessionManager } from "@/engine/sessionManager";
import { VariableEngine } from "@/engine/variableEngine";
import { InMemoryChatHistoryRepository } from "@/persistence/repositories/chatHistoryRepository";
import { InMemoryCheckpointRepository } from "@/persistence/repositories/checkpointRepository";
import { InMemoryEventLogRepository } from "@/persistence/repositories/eventLogRepository";
import { InMemoryVariableRepository } from "@/persistence/repositories/variableRepository";
import type { BattleSnapshot } from "@/types/battle";
import { describe, expect, it } from "vitest";

describe("RecoveryService", () => {
  it("rolls chat, variables, session, and battle state back to the latest checkpoint", async () => {
    const checkpointRepository = new InMemoryCheckpointRepository();
    const eventLogRepository = new InMemoryEventLogRepository();
    const chatRepository = new InMemoryChatHistoryRepository();
    const chatService = new ChatMessageService(chatRepository);
    const variableRepository = new InMemoryVariableRepository();
    const sessionManager = createSessionManager();
    const gameEngineFacade = new GameEngineFacade(sessionManager, {
      variableRepository,
    });
    const checkpointVariable = {
      ...new VariableEngine().createInitialState(),
      rootId: "root-before-request",
      stateHash: "hash-before-request",
    };
    const failedVariable = {
      ...new VariableEngine().createInitialState(),
      rootId: "root-after-failure",
      stateHash: "hash-after-failure",
    };
    let restoredBattle: BattleSnapshot | null | undefined;

    await variableRepository.saveCurrent(checkpointVariable);
    await chatService.createUserMessage({
      id: "msg-before-request",
      content: "我走进旧校舍。",
      createdAt: "2026-05-25T00:01:00.000Z",
    });
    await checkpointRepository.save({
      id: "checkpoint-before-request",
      kind: "idle_checkpoint",
      snapshotVersion: 1,
      createdAt: "2026-05-25T00:01:01.000Z",
      reason: "before_ai_request",
      sessionSnapshot: {
        sessionState: "IDLE",
        pipelineState: null,
        activeRequestId: null,
      },
      variableValue: checkpointVariable,
      chatMessages: await chatRepository.list(),
      activeBattle: {
        lifecycleState: "ACTIVE",
        phase: "PLAYER_COMMAND",
        encounterId: "encounter-before-request",
        participants: [],
        pressTurn: {
          ownerSide: "player",
          icons: [],
        },
      },
    });

    await variableRepository.saveCurrent(failedVariable);
    await chatService.createAssistantProvisionalMessage({
      id: "assistant-failed",
      requestId: "req-failed",
      createdAt: "2026-05-25T00:01:02.000Z",
    });
    await chatService.markAssistantFailedDraft({
      messageId: "assistant-failed",
    });
    gameEngineFacade.beginAiRequest("req-failed");
    gameEngineFacade.enterErrorRecovery();

    const service = new RecoveryService({
      checkpointRepository,
      eventLogRepository,
      chatRepository,
      variableRepository,
      restoreSessionSnapshot: (snapshot) =>
        gameEngineFacade.restoreSessionSnapshot(snapshot),
      restoreBattleSnapshot: ({ activeBattle }) => {
        restoredBattle = activeBattle;
      },
      idFactory: {
        eventId: () => "event-rollback-completed",
      },
      now: () => "2026-05-25T00:01:03.000Z",
    });

    await expect(service.rollbackToLatest("idle_checkpoint")).resolves.toEqual({
      ok: true,
      checkpointId: "checkpoint-before-request",
    });
    expect((await chatRepository.list()).map((message) => message.id)).toEqual([
      "msg-before-request",
    ]);
    expect(await variableRepository.getCurrent()).toMatchObject({
      rootId: "root-before-request",
      stateHash: "hash-before-request",
    });
    expect(gameEngineFacade.getSessionSnapshot()).toEqual({
      sessionState: "IDLE",
      pipelineState: null,
      activeRequestId: null,
    });
    expect(restoredBattle).toMatchObject({
      encounterId: "encounter-before-request",
    });
    expect(await eventLogRepository.list()).toEqual([
      expect.objectContaining({
        id: "event-rollback-completed",
        type: "RollbackCompleted",
        source: "recovery_service",
        payload: expect.objectContaining({
          checkpointId: "checkpoint-before-request",
          kind: "idle_checkpoint",
        }),
      }),
    ]);
  });

  it("rejects rollback when no checkpoint exists for the requested kind", async () => {
    const service = new RecoveryService({
      checkpointRepository: new InMemoryCheckpointRepository(),
      eventLogRepository: new InMemoryEventLogRepository(),
      chatRepository: new InMemoryChatHistoryRepository(),
      variableRepository: new InMemoryVariableRepository(),
      restoreSessionSnapshot: () => undefined,
    });

    await expect(service.rollbackToLatest("idle_checkpoint")).rejects.toThrow(
      "[CHECKPOINT_NOT_FOUND] No checkpoint found for kind: idle_checkpoint.",
    );
  });
});
