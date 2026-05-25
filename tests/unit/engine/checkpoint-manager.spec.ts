import { ChatMessageService } from "@/engine/chatMessageService";
import { createCheckpointManager } from "@/engine/checkpointManager";
import { createSessionManager } from "@/engine/sessionManager";
import { VariableEngine } from "@/engine/variableEngine";
import { InMemoryChatHistoryRepository } from "@/persistence/repositories/chatHistoryRepository";
import { InMemoryCheckpointRepository } from "@/persistence/repositories/checkpointRepository";
import { InMemoryEventLogRepository } from "@/persistence/repositories/eventLogRepository";
import { InMemoryVariableRepository } from "@/persistence/repositories/variableRepository";
import { describe, expect, it } from "vitest";

describe("CheckpointManager", () => {
  it("captures restorable state and appends a CheckpointCreated event", async () => {
    const checkpointRepository = new InMemoryCheckpointRepository();
    const eventLogRepository = new InMemoryEventLogRepository();
    const chatRepository = new InMemoryChatHistoryRepository();
    const chatService = new ChatMessageService(chatRepository);
    const variableRepository = new InMemoryVariableRepository();
    const variableValue = {
      ...new VariableEngine().createInitialState(),
      rootId: "root-before-checkpoint",
    };
    const sessionManager = createSessionManager();

    await variableRepository.saveCurrent(variableValue);
    await chatService.createUserMessage({
      id: "msg-before-checkpoint",
      content: "我把书包放在座位旁。",
      createdAt: "2026-05-25T00:00:00.000Z",
    });

    const manager = createCheckpointManager({
      checkpointRepository,
      eventLogRepository,
      chatRepository,
      variableRepository,
      getSessionSnapshot: () => sessionManager.getSnapshot(),
      getPendingBattle: () => null,
      getActiveBattle: () => null,
      idFactory: {
        checkpointId: () => "checkpoint-before-request",
        eventId: () => "event-checkpoint-created",
      },
      now: () => "2026-05-25T00:00:01.000Z",
    });

    const checkpoint = await manager.createCheckpoint({
      kind: "idle_checkpoint",
      reason: "before_ai_request",
      contextVersion: 3,
      stateHash: "hash-before",
      metadata: {
        requestId: "req-before-checkpoint",
      },
    });

    expect(checkpoint).toMatchObject({
      id: "checkpoint-before-request",
      kind: "idle_checkpoint",
      snapshotVersion: 1,
      stateHash: "hash-before",
      variableValue: expect.objectContaining({
        rootId: "root-before-checkpoint",
      }),
      chatMessages: [
        expect.objectContaining({
          id: "msg-before-checkpoint",
        }),
      ],
    });
    expect(await checkpointRepository.getLatestByKind("idle_checkpoint"))
      .toMatchObject({
        id: checkpoint.id,
      });
    expect(await eventLogRepository.list()).toEqual([
      expect.objectContaining({
        id: "event-checkpoint-created",
        type: "CheckpointCreated",
        source: "checkpoint_manager",
        payload: expect.objectContaining({
          checkpointId: "checkpoint-before-request",
          kind: "idle_checkpoint",
          reason: "before_ai_request",
        }),
      }),
    ]);
  });
});
