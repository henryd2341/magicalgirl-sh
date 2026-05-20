import {
  createBattleSnapshotFromPendingBattle,
  createPendingBattleSnapshot,
  type BattleParticipant,
  type BattleSnapshot,
  type CreatePendingBattleSnapshotInput,
  type PendingBattleSnapshot,
} from "@/types/battle";
import { defineStore } from "pinia";

export type StagePendingEncounterInput = CreatePendingBattleSnapshotInput;

function createPendingBattleRequiredError(): Error {
  return new Error(
    "[BATTLE_PENDING_REQUIRED] Cannot start battle without a pending battle snapshot.",
  );
}

export const useBattleStore = defineStore("battle", {
  state: () => ({
    pendingBattle: null as PendingBattleSnapshot | null,
    activeBattle: null as BattleSnapshot | null,
  }),
  actions: {
    stagePendingEncounter(input: StagePendingEncounterInput) {
      this.pendingBattle = createPendingBattleSnapshot(input);
    },
    clearPendingEncounter() {
      this.pendingBattle = null;
    },
    startBattle(playerParty: BattleParticipant[]) {
      if (this.pendingBattle === null) {
        throw createPendingBattleRequiredError();
      }

      this.activeBattle = createBattleSnapshotFromPendingBattle({
        pendingBattle: this.pendingBattle,
        playerParty,
      });
      this.pendingBattle = null;
    },
    selectEnemy(enemyId: string) {
      if (this.activeBattle === null) {
        return;
      }

      this.activeBattle.selectedEnemyId = enemyId;
    },
    selectAction(actionId: string) {
      if (this.activeBattle === null) {
        return;
      }

      this.activeBattle.selectedActionId = actionId;
    },
  },
});
