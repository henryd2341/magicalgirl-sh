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
    refreshSnapshot() {
      this.snapshot = gameEngineFacade.getSessionSnapshot();
    },
  },
});
