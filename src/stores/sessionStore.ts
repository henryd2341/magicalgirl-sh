import { BattleResultService } from "@/engine/battleResultService";
import {
  CombatRefreshRecoveryService,
  type CombatRefreshRecoveryResult,
} from "@/engine/combatRefreshRecoveryService";
import { createCheckpointManager } from "@/engine/checkpointManager";
import { GameEngineFacade } from "@/engine/gameEngineFacade";
import { createSessionManager } from "@/engine/sessionManager";
import { ensureVariableState } from "@/engine/variableStateBootstrap";
import { OrchestratorService } from "@/orchestrator/orchestratorService";
import { buildHarnessRequest } from "@/orchestrator/promptBuilder";
import { FakeStreamingProviderClient } from "@/orchestrator/providerClient";
import {
  RecoveryService,
  type RollbackResult,
} from "@/engine/recoveryService";
import type {
  TriggerBattleToolEnvelope,
  TriggerBattleToolResult,
  UpdateVariablesToolEnvelope,
  UpdateVariablesToolResult,
} from "@/orchestrator/toolEnvelope";
import { ToolExecutor } from "@/orchestrator/toolExecutor";
import systemPrompt from "@/content/systemPrompt.md?raw";
import { getChatPersistenceClient } from "@/persistence/chatRuntime";
import type { DbWorkerClient } from "@/persistence/dbClient";
import { DbChatHistoryRepository } from "@/persistence/repositories/chatHistoryRepository";
import { DbCheckpointRepository } from "@/persistence/repositories/checkpointRepository";
import { DbEventLogRepository } from "@/persistence/repositories/eventLogRepository";
import {
  DbVariableChangeLogRepository,
  DbVariableRepository,
  InMemoryVariableChangeLogRepository,
  InMemoryVariableRepository,
  type VariableChangeLogRepository,
  type VariableRepository,
} from "@/persistence/repositories/variableRepository";
import { InMemoryWorldInfoRepository } from "@/persistence/repositories/worldInfoRepository";
import { useBattleStore } from "@/stores/battleStore";
import { useChatStore } from "@/stores/chatStore";
import type { BattleParticipant } from "@/types/battle";
import type { CheckpointSnapshotRecord } from "@/types/recovery";
import { defineStore } from "pinia";
import { ref } from "vue";

const POST_COMBAT_CONTINUE_INPUT = "请根据最近的战斗摘要继续剧情。";

function createPostCombatId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random()
    .toString(16)
    .slice(2, 10)}`;
}

function createRecoveryId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random()
    .toString(16)
    .slice(2, 10)}`;
}

export const useSessionStore = defineStore("session", () => {
  const sessionManager = createSessionManager();
  let variableRepository: VariableRepository = new InMemoryVariableRepository();
  let variableChangeLogRepository: VariableChangeLogRepository =
    new InMemoryVariableChangeLogRepository();
  const worldInfoRepository = new InMemoryWorldInfoRepository();
  let gameEngineFacade = new GameEngineFacade(sessionManager, {
    variableRepository,
    variableChangeLogRepository,
  });
  let toolExecutor = new ToolExecutor(gameEngineFacade);
  const snapshot = ref(gameEngineFacade.getSessionSnapshot());

  function createDbRecoveryRepositories(client: DbWorkerClient) {
    return {
      checkpointRepository: new DbCheckpointRepository(client),
      eventLogRepository: new DbEventLogRepository(client),
      chatRepository: new DbChatHistoryRepository(client),
      variableRepository: new DbVariableRepository(client),
    };
  }

  function getDbRecoveryRepositories() {
    const client = getChatPersistenceClient();

    if (!client) {
      return null;
    }

    return createDbRecoveryRepositories(client);
  }

  async function configurePersistence(input: { client: DbWorkerClient }) {
    const nextVariableRepository = new DbVariableRepository(input.client);
    await ensureVariableState(nextVariableRepository);

    variableRepository = nextVariableRepository;
    variableChangeLogRepository = new DbVariableChangeLogRepository(
      input.client,
    );

    const currentSnapshot = gameEngineFacade.getSessionSnapshot();
    gameEngineFacade = new GameEngineFacade(sessionManager, {
      variableRepository,
      variableChangeLogRepository,
    });
    gameEngineFacade.restoreSessionSnapshot(currentSnapshot);
    toolExecutor = new ToolExecutor(gameEngineFacade);
    snapshot.value = gameEngineFacade.getSessionSnapshot();
  }

  async function createRecoveryCheckpoint(input: {
    kind: "idle_checkpoint" | "combat_checkpoint";
    reason: string;
    encounterId?: string;
    metadata?: Record<string, unknown>;
  }) {
    const repositories = getDbRecoveryRepositories();

    if (!repositories) {
      return null;
    }

    const battleStore = useBattleStore();
    const manager = createCheckpointManager({
      ...repositories,
      getSessionSnapshot: () => gameEngineFacade.getSessionSnapshot(),
      getPendingBattle: () => battleStore.pendingBattle,
      getActiveBattle: () => battleStore.activeBattle,
      idFactory: {
        checkpointId: () => createRecoveryId("checkpoint"),
        eventId: () => createRecoveryId("event"),
      },
    });

    return manager.createCheckpoint({
      kind: input.kind,
      reason: input.reason,
      metadata: {
        refreshRecovery: true,
        safeRollbackKind: "idle_checkpoint",
        encounterId: input.encounterId,
        ...input.metadata,
      },
    });
  }

  async function markCombatCheckpoint(input: {
    reason: string;
    encounterId?: string;
  }) {
    await createRecoveryCheckpoint({
      kind: "combat_checkpoint",
      reason: input.reason,
      encounterId: input.encounterId,
      metadata: {
        combatSessionState: snapshot.value.sessionState,
      },
    });
  }

  async function markLatestCombatCheckpointFinished() {
    const repositories = getDbRecoveryRepositories();

    if (!repositories) {
      return;
    }

    const checkpoint =
      await repositories.checkpointRepository.getLatestByKind(
        "combat_checkpoint",
      );

    if (!checkpoint) {
      return;
    }

    await repositories.checkpointRepository.save({
      ...checkpoint,
      metadata: {
        ...checkpoint.metadata,
        finished: true,
        finishedAt: new Date().toISOString(),
      },
    });
  }

  function beginAiRequest(requestId: string) {
    gameEngineFacade.beginAiRequest(requestId);
    snapshot.value = gameEngineFacade.getSessionSnapshot();
  }

  async function executeTriggerBattle(
    envelope: TriggerBattleToolEnvelope,
  ): Promise<TriggerBattleToolResult> {
    const battleStore = useBattleStore();
    const result = await toolExecutor.execute(envelope);

    snapshot.value = gameEngineFacade.getSessionSnapshot();

    if (result.ok) {
      battleStore.stagePendingEncounter({
        encounterId: result.output.encounterId,
        narrativeReason: envelope.input.narrative_reason,
        enemies: envelope.input.enemies,
      });
      await markCombatCheckpoint({
        reason: "combat_pending",
        encounterId: result.output.encounterId,
      });
    }

    return result;
  }

  async function executeUpdateVariables(
    envelope: UpdateVariablesToolEnvelope,
  ): Promise<UpdateVariablesToolResult> {
    const result = await toolExecutor.execute(envelope);
    snapshot.value = gameEngineFacade.getSessionSnapshot();

    return result;
  }

  function enterCombatPending() {
    gameEngineFacade.dispatchCommand({
      type: "TRIGGER_BATTLE",
      payload: {
        request_id: "session-store-enter-combat-pending",
        context_version: 1,
        state_hash: "initial",
        tool_call_id: "session-store-enter-combat-pending",
        input: {
          encounter_id: "session-store-pending-encounter",
          enemies: [{ enemy_id: "pending-placeholder", count: 1 }],
          narrative_reason: "Session store pending battle entrypoint.",
        },
      },
    });
    snapshot.value = gameEngineFacade.getSessionSnapshot();
  }

  async function startBattle(playerParty: BattleParticipant[]) {
    const battleStore = useBattleStore();

    battleStore.startBattle(playerParty);
    gameEngineFacade.enterCombat();
    snapshot.value = gameEngineFacade.getSessionSnapshot();
    await markCombatCheckpoint({
      reason: "combat_active",
      encounterId: battleStore.activeBattle?.encounterId,
    });
  }

  function cancelPendingBattle() {
    if (snapshot.value.sessionState !== "COMBAT_PENDING") {
      throw new Error(
        `[COMBAT_PENDING_CANCEL_INVALID_STATE] Cannot cancel pending battle from ${snapshot.value.sessionState}.`,
      );
    }

    const battleStore = useBattleStore();

    battleStore.clearPendingEncounter();
    gameEngineFacade.resetToIdle();
    snapshot.value = gameEngineFacade.getSessionSnapshot();
  }

  async function completeActiveBattle() {
    const battleStore = useBattleStore();
    const chatStore = useChatStore();

    if (battleStore.activeBattle === null) {
      throw new Error(
        "[BATTLE_RESULT_REQUIRED] Cannot complete battle without an active battle snapshot.",
      );
    }

    const battleResultService = new BattleResultService({
      chatService: chatStore,
    });

    const result = await battleResultService.commitResolvedBattle(
      battleStore.activeBattle,
    );

    gameEngineFacade.markPostCombatReady();
    snapshot.value = gameEngineFacade.getSessionSnapshot();
    await markLatestCombatCheckpointFinished();

    return result;
  }

  async function continuePostCombatStory() {
    if (snapshot.value.sessionState !== "POST_COMBAT_READY") {
      throw new Error(
        `[POST_COMBAT_CONTINUATION_INVALID_STATE] Cannot continue post-combat story from ${snapshot.value.sessionState}.`,
      );
    }

    const chatStore = useChatStore();
    const chatRuntime = chatStore.getActiveChatRuntime();
    const requestId = createPostCombatId("post-combat-continue");
    const orchestratorService = new OrchestratorService({
      chatService: chatRuntime.service,
      gameEngineFacade,
      providerClient: new FakeStreamingProviderClient({}),
      toolExecutor,
      buildRequest(input) {
        return buildHarnessRequest({
          ...input,
          chatRepository: chatRuntime.repository,
          variableRepository,
          worldInfoRepository,
          systemPrompt,
          requestId,
          now: new Date().toISOString(),
        });
      },
      idFactory: {
        userMessageId: () => createPostCombatId("msg-post-combat-user"),
        assistantMessageId: () =>
          createPostCombatId("msg-post-combat-assistant"),
      },
      now: () => new Date().toISOString(),
    });

    const result = await orchestratorService.runUserTurn({
      userInput: POST_COMBAT_CONTINUE_INPUT,
      userVisible: false,
      aiVisible: true,
    });

    await chatStore.refreshMessages();
    snapshot.value = gameEngineFacade.getSessionSnapshot();

    return result;
  }

  function refreshSnapshot() {
    snapshot.value = gameEngineFacade.getSessionSnapshot();
  }

  async function markIdleCheckpointForRefreshRecovery() {
    return createRecoveryCheckpoint({
      kind: "idle_checkpoint",
      reason: "combat_refresh_idle_checkpoint",
    });
  }

  async function recoverFromInterruptedCombat(): Promise<CombatRefreshRecoveryResult> {
    const repositories = getDbRecoveryRepositories();

    if (!repositories) {
      return {
        recovered: false,
        mode: "noop",
      };
    }

    const battleStore = useBattleStore();
    const chatStore = useChatStore();
    const service = new CombatRefreshRecoveryService({
      ...repositories,
      restoreSessionSnapshot: (nextSnapshot) =>
        gameEngineFacade.restoreSessionSnapshot(nextSnapshot),
      resetSessionToIdle: () => gameEngineFacade.resetToIdle(),
      restoreBattleSnapshot: (input) =>
        battleStore.restoreBattleSnapshot(input),
      idFactory: {
        eventId: () => createRecoveryId("event"),
        recoveryMessageId: () =>
          createRecoveryId("msg-combat-refresh-recovery"),
      },
    });

    const result = await service.recoverFromInterruptedCombat();
    snapshot.value = gameEngineFacade.getSessionSnapshot();

    if (result.recovered) {
      await chatStore.refreshMessages();
    }

    return result;
  }

  async function restoreFromCheckpointSnapshot(
    checkpoint: CheckpointSnapshotRecord,
  ) {
    const battleStore = useBattleStore();

    if (checkpoint.variableValue !== null) {
      await variableRepository.saveCurrent(checkpoint.variableValue);
    }

    gameEngineFacade.restoreSessionSnapshot(checkpoint.sessionSnapshot);
    battleStore.restoreBattleSnapshot({
      pendingBattle: checkpoint.pendingBattle,
      activeBattle: checkpoint.activeBattle,
    });
    snapshot.value = gameEngineFacade.getSessionSnapshot();
  }

  async function rollbackToLatestIdleCheckpoint(): Promise<RollbackResult> {
    const repositories = getDbRecoveryRepositories();

    if (!repositories) {
      throw new Error(
        "[RECOVERY_DB_UNAVAILABLE] Cannot rollback without DB-backed persistence.",
      );
    }

    const battleStore = useBattleStore();
    const checkpoint =
      await repositories.checkpointRepository.getLatestByKind(
        "idle_checkpoint",
      );

    if (!checkpoint) {
      throw new Error(
        "[CHECKPOINT_NOT_FOUND] No checkpoint found for kind: idle_checkpoint.",
      );
    }

    const service = new RecoveryService({
      ...repositories,
      restoreSessionSnapshot: (nextSnapshot) =>
        gameEngineFacade.restoreSessionSnapshot(nextSnapshot),
      restoreBattleSnapshot: (input) =>
        battleStore.restoreBattleSnapshot(input),
      idFactory: {
        eventId: () => createRecoveryId("event"),
      },
    });
    const result = await service.rollbackToLatest("idle_checkpoint");

    if (checkpoint.variableValue !== null) {
      await variableRepository.saveCurrent(checkpoint.variableValue);
    }

    snapshot.value = gameEngineFacade.getSessionSnapshot();

    return result;
  }

  return {
    snapshot,
    configurePersistence,
    beginAiRequest,
    executeUpdateVariables,
    executeTriggerBattle,
    enterCombatPending,
    startBattle,
    cancelPendingBattle,
    completeActiveBattle,
    continuePostCombatStory,
    refreshSnapshot,
    markIdleCheckpointForRefreshRecovery,
    recoverFromInterruptedCombat,
    restoreFromCheckpointSnapshot,
    rollbackToLatestIdleCheckpoint,
  };
});
