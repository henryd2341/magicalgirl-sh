import { BattleResultService } from "@/engine/battleResultService";
import { GameEngineFacade } from "@/engine/gameEngineFacade";
import { createSessionManager } from "@/engine/sessionManager";
import { OrchestratorService } from "@/orchestrator/orchestratorService";
import { buildHarnessRequest } from "@/orchestrator/promptBuilder";
import { FakeStreamingProviderClient } from "@/orchestrator/providerClient";
import type {
  TriggerBattleToolEnvelope,
  TriggerBattleToolResult,
} from "@/orchestrator/toolEnvelope";
import { ToolExecutor } from "@/orchestrator/toolExecutor";
import systemPrompt from "@/content/systemPrompt.md?raw";
import {
  InMemoryVariableChangeLogRepository,
  InMemoryVariableRepository,
} from "@/persistence/repositories/variableRepository";
import { InMemoryWorldInfoRepository } from "@/persistence/repositories/worldInfoRepository";
import { useBattleStore } from "@/stores/battleStore";
import { useChatStore } from "@/stores/chatStore";
import type { BattleParticipant } from "@/types/battle";
import { defineStore } from "pinia";
import { ref } from "vue";

const POST_COMBAT_CONTINUE_INPUT = "请根据最近的战斗摘要继续剧情。";

function createPostCombatId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random()
    .toString(16)
    .slice(2, 10)}`;
}

export const useSessionStore = defineStore("session", () => {
  const sessionManager = createSessionManager();
  const variableRepository = new InMemoryVariableRepository();
  const variableChangeLogRepository = new InMemoryVariableChangeLogRepository();
  const worldInfoRepository = new InMemoryWorldInfoRepository();
  const gameEngineFacade = new GameEngineFacade(sessionManager, {
    variableRepository,
    variableChangeLogRepository,
  });
  const toolExecutor = new ToolExecutor(gameEngineFacade);
  const snapshot = ref(gameEngineFacade.getSessionSnapshot());

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
    }

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

  function startBattle(playerParty: BattleParticipant[]) {
    const battleStore = useBattleStore();

    battleStore.startBattle(playerParty);
    gameEngineFacade.enterCombat();
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

  return {
    snapshot,
    beginAiRequest,
    executeTriggerBattle,
    enterCombatPending,
    startBattle,
    completeActiveBattle,
    continuePostCombatStory,
    refreshSnapshot,
  };
});
