import { CombatRefreshRecoveryService } from "@/engine/combatRefreshRecoveryService";
import { ChatMessageService } from "@/engine/chatMessageService";
import { GameEngineFacade } from "@/engine/gameEngineFacade";
import { createSessionManager } from "@/engine/sessionManager";
import { VariableEngine } from "@/engine/variableEngine";
import { InMemoryChatHistoryRepository } from "@/persistence/repositories/chatHistoryRepository";
import { InMemoryCheckpointRepository } from "@/persistence/repositories/checkpointRepository";
import { InMemoryEventLogRepository } from "@/persistence/repositories/eventLogRepository";
import { InMemoryVariableRepository } from "@/persistence/repositories/variableRepository";
import {
  createBattleSnapshotFromPendingBattle,
  createPendingBattleSnapshot,
  type BattleParticipant,
} from "@/types/battle";
import type { CheckpointSnapshotRecord } from "@/types/recovery";
import { describe, expect, it } from "vitest";

const RECOVERY_MESSAGE = "检测到战斗中刷新，已回滚到战斗前安全状态。";

function createPlayerParty(): BattleParticipant[] {
  return [
    {
      id: "player-heroine-1",
      side: "player",
      displayName: "鹿目真昼",
      hp: {
        current: 120,
        max: 120,
      },
      mp: {
        current: 48,
        max: 48,
      },
      isDown: false,
      isActive: true,
    },
  ];
}

function createPendingBattle() {
  return createPendingBattleSnapshot({
    encounterId: "enc-refresh",
    narrativeReason: "刷新恢复测试。",
    enemies: [{ enemy_id: "refresh-shadow", count: 1 }],
  });
}

function createCheckpoint(
  input: Partial<CheckpointSnapshotRecord>,
): CheckpointSnapshotRecord {
  return {
    id: "checkpoint-idle",
    kind: "idle_checkpoint",
    snapshotVersion: 1,
    createdAt: "2026-05-25T00:00:00.000Z",
    reason: "test",
    sessionSnapshot: {
      sessionState: "IDLE",
      pipelineState: null,
      activeRequestId: null,
    },
    variableValue: null,
    chatMessages: [],
    ...input,
  };
}

function createServiceFixture() {
  const checkpointRepository = new InMemoryCheckpointRepository();
  const eventLogRepository = new InMemoryEventLogRepository();
  const chatRepository = new InMemoryChatHistoryRepository();
  const chatService = new ChatMessageService(chatRepository);
  const variableRepository = new InMemoryVariableRepository();
  const sessionManager = createSessionManager();
  const gameEngineFacade = new GameEngineFacade(sessionManager, {
    variableRepository,
  });
  let restoredBattle: unknown = undefined;

  const service = new CombatRefreshRecoveryService({
    checkpointRepository,
    eventLogRepository,
    chatRepository,
    variableRepository,
    restoreSessionSnapshot: (snapshot) =>
      gameEngineFacade.restoreSessionSnapshot(snapshot),
    resetSessionToIdle: () => gameEngineFacade.resetToIdle(),
    restoreBattleSnapshot: (input) => {
      restoredBattle = input;
    },
    idFactory: {
      eventId: () => "event-refresh-recovery",
      recoveryMessageId: () => "msg-refresh-recovery",
    },
    now: () => "2026-05-25T00:00:05.000Z",
  });

  return {
    checkpointRepository,
    eventLogRepository,
    chatRepository,
    chatService,
    variableRepository,
    gameEngineFacade,
    getRestoredBattle: () => restoredBattle,
    service,
  };
}

describe("CombatRefreshRecoveryService", () => {
  it("rolls interrupted combat back to the latest idle checkpoint and records an audit message", async () => {
    const {
      checkpointRepository,
      eventLogRepository,
      chatRepository,
      chatService,
      variableRepository,
      gameEngineFacade,
      getRestoredBattle,
      service,
    } = createServiceFixture();
    const idleVariable = {
      ...new VariableEngine().createInitialState(),
      rootId: "root-before-combat",
      stateHash: "hash-before-combat",
    };
    const combatVariable = {
      ...new VariableEngine().createInitialState(),
      rootId: "root-during-combat",
      stateHash: "hash-during-combat",
    };
    const pendingBattle = createPendingBattle();
    const activeBattle = createBattleSnapshotFromPendingBattle({
      pendingBattle,
      playerParty: createPlayerParty(),
    });

    await variableRepository.saveCurrent(idleVariable);
    await chatService.createUserMessage({
      id: "msg-before-combat",
      content: "我听见楼梯间传来脚步声。",
      createdAt: "2026-05-25T00:00:01.000Z",
    });
    await checkpointRepository.save(
      createCheckpoint({
        id: "checkpoint-idle-before-combat",
        kind: "idle_checkpoint",
        createdAt: "2026-05-25T00:00:02.000Z",
        variableValue: idleVariable,
        chatMessages: await chatRepository.list(),
      }),
    );

    await variableRepository.saveCurrent(combatVariable);
    gameEngineFacade.restoreSessionSnapshot({
      sessionState: "IN_COMBAT",
      pipelineState: null,
      activeRequestId: null,
    });
    await checkpointRepository.save(
      createCheckpoint({
        id: "checkpoint-combat-active",
        kind: "combat_checkpoint",
        createdAt: "2026-05-25T00:00:04.000Z",
        reason: "combat_active",
        sessionSnapshot: gameEngineFacade.getSessionSnapshot(),
        variableValue: combatVariable,
        chatMessages: await chatRepository.list(),
        activeBattle,
        metadata: {
          refreshRecovery: true,
          encounterId: "enc-refresh",
        },
      }),
    );

    await expect(service.recoverFromInterruptedCombat()).resolves.toEqual({
      recovered: true,
      mode: "rolled_back",
      checkpointId: "checkpoint-combat-active",
    });
    expect(gameEngineFacade.getSessionSnapshot()).toEqual({
      sessionState: "IDLE",
      pipelineState: null,
      activeRequestId: null,
    });
    expect(await variableRepository.getCurrent()).toMatchObject({
      rootId: "root-before-combat",
      stateHash: "hash-before-combat",
    });
    expect(getRestoredBattle()).toEqual({
      pendingBattle: undefined,
      activeBattle: undefined,
    });
    expect((await chatRepository.list()).map((message) => message.id)).toEqual([
      "msg-before-combat",
      "msg-refresh-recovery",
    ]);
    expect(await chatRepository.getById("msg-refresh-recovery")).toMatchObject({
      role: "system",
      content: RECOVERY_MESSAGE,
      user_visible: true,
      ai_visible: false,
    });
    expect(await eventLogRepository.list()).toContainEqual(
      expect.objectContaining({
        id: "event-refresh-recovery",
        type: "RollbackCompleted",
        payload: expect.objectContaining({
          checkpointId: "checkpoint-idle-before-combat",
          combatCheckpointId: "checkpoint-combat-active",
          reason: "combat_refresh_safe_rollback",
        }),
      }),
    );
    expect(
      await checkpointRepository.getLatestByKind("combat_checkpoint"),
    ).toMatchObject({
      metadata: expect.objectContaining({
        refreshRecoveryResolved: true,
      }),
    });
  });

  it("returns noop when no unresolved combat checkpoint exists", async () => {
    const { checkpointRepository, service } = createServiceFixture();

    await expect(service.recoverFromInterruptedCombat()).resolves.toEqual({
      recovered: false,
      mode: "noop",
    });

    await checkpointRepository.save(
      createCheckpoint({
        id: "checkpoint-combat-post-ready",
        kind: "combat_checkpoint",
        sessionSnapshot: {
          sessionState: "POST_COMBAT_READY",
          pipelineState: null,
          activeRequestId: null,
        },
      }),
    );

    await expect(service.recoverFromInterruptedCombat()).resolves.toEqual({
      recovered: false,
      mode: "noop",
    });

    await checkpointRepository.save(
      createCheckpoint({
        id: "checkpoint-combat-resolved",
        kind: "combat_checkpoint",
        createdAt: "2026-05-25T00:00:01.000Z",
        sessionSnapshot: {
          sessionState: "IN_COMBAT",
          pipelineState: null,
          activeRequestId: null,
        },
        metadata: {
          refreshRecoveryResolved: true,
        },
      }),
    );

    await expect(service.recoverFromInterruptedCombat()).resolves.toEqual({
      recovered: false,
      mode: "noop",
    });
  });

  it("safe-resets combat state without replacing chat history when no idle checkpoint exists", async () => {
    const {
      checkpointRepository,
      chatRepository,
      chatService,
      gameEngineFacade,
      getRestoredBattle,
      service,
    } = createServiceFixture();
    const pendingBattle = createPendingBattle();

    await chatService.createUserMessage({
      id: "msg-current-chat",
      content: "战斗开始前的最后一句话。",
      createdAt: "2026-05-25T00:00:01.000Z",
    });
    gameEngineFacade.restoreSessionSnapshot({
      sessionState: "COMBAT_PENDING",
      pipelineState: null,
      activeRequestId: null,
    });
    await checkpointRepository.save(
      createCheckpoint({
        id: "checkpoint-combat-pending",
        kind: "combat_checkpoint",
        sessionSnapshot: gameEngineFacade.getSessionSnapshot(),
        pendingBattle,
      }),
    );

    await expect(service.recoverFromInterruptedCombat()).resolves.toEqual({
      recovered: true,
      mode: "safe_reset",
      checkpointId: "checkpoint-combat-pending",
    });
    expect(gameEngineFacade.getSessionSnapshot().sessionState).toBe("IDLE");
    expect(getRestoredBattle()).toEqual({
      pendingBattle: undefined,
      activeBattle: undefined,
    });
    expect((await chatRepository.list()).map((message) => message.id)).toEqual([
      "msg-current-chat",
      "msg-refresh-recovery",
    ]);
  });
});
