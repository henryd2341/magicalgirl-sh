import { defineStore } from "pinia";

export interface StagePendingEncounterInput {
  encounterId: string;
  narrativeReason: string;
}

export const useBattleStore = defineStore("battle", {
  state: () => ({
    pendingEncounterId: null as string | null,
    lastNarrativeReason: null as string | null,
  }),
  actions: {
    stagePendingEncounter(input: StagePendingEncounterInput) {
      this.pendingEncounterId = input.encounterId;
      this.lastNarrativeReason = input.narrativeReason;
    },
    clearPendingEncounter() {
      this.pendingEncounterId = null;
      this.lastNarrativeReason = null;
    },
  },
});
