import { GameEngineFacade } from "@/engine/gameEngineFacade";
import { createSessionManager } from "@/engine/sessionManager";
import type {
  TriggerBattleToolEnvelope,
  TriggerBattleToolResult,
} from "@/orchestrator/toolEnvelope";
import { ToolExecutor } from "@/orchestrator/toolExecutor";
import { useBattleStore } from "@/stores/battleStore";
import { defineStore } from "pinia";

const sessionManager = createSessionManager();
const gameEngineFacade = new GameEngineFacade(sessionManager);
const toolExecutor = new ToolExecutor(gameEngineFacade);

export const useSessionStore = defineStore("session", {
  state: () => ({
    snapshot: gameEngineFacade.getSessionSnapshot(),
  }),
  actions: {
    beginAiRequest(requestId: string) {
      gameEngineFacade.beginAiRequest(requestId);
      this.snapshot = gameEngineFacade.getSessionSnapshot();
    },
    async executeTriggerBattle(
      envelope: TriggerBattleToolEnvelope,
    ): Promise<TriggerBattleToolResult> {
      const battleStore = useBattleStore();
      const result = await toolExecutor.execute(envelope);

      this.snapshot = gameEngineFacade.getSessionSnapshot();

      if (result.ok) {
        battleStore.stagePendingEncounter({
          encounterId: result.output.encounterId,
          narrativeReason: envelope.input.narrative_reason,
        });
      }

      return result;
    },
    enterCombatPending() {
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
      this.snapshot = gameEngineFacade.getSessionSnapshot();
    },
    refreshSnapshot() {
      this.snapshot = gameEngineFacade.getSessionSnapshot();
    },
  },
});
