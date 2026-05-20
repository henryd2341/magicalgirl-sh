import { GameEngineFacade } from "@/engine/gameEngineFacade";
import { createSessionManager } from "@/engine/sessionManager";
import { defineStore } from "pinia";

const sessionManager = createSessionManager();
const gameEngineFacade = new GameEngineFacade(sessionManager);

export const useSessionStore = defineStore("session", {
  state: () => ({
    snapshot: gameEngineFacade.getSessionSnapshot(),
  }),
  actions: {
    beginAiRequest(requestId: string) {
      gameEngineFacade.beginAiRequest(requestId);
      this.snapshot = gameEngineFacade.getSessionSnapshot();
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
