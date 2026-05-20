import { GameEngineFacade } from "@/engine/gameEngineFacade";
import { createSessionManager } from "@/engine/sessionManager";
import type {
  TriggerBattleToolEnvelope,
  TriggerBattleToolResult,
} from "@/orchestrator/toolEnvelope";
import { ToolExecutor } from "@/orchestrator/toolExecutor";
import { useBattleStore } from "@/stores/battleStore";
import type { BattleParticipant } from "@/types/battle";
import { defineStore } from "pinia";
import { ref } from "vue";

export const useSessionStore = defineStore("session", () => {
  const sessionManager = createSessionManager();
  const gameEngineFacade = new GameEngineFacade(sessionManager);
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

  function refreshSnapshot() {
    snapshot.value = gameEngineFacade.getSessionSnapshot();
  }

  return {
    snapshot,
    beginAiRequest,
    executeTriggerBattle,
    enterCombatPending,
    startBattle,
    refreshSnapshot,
  };
});
