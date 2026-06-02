import {
  findBattleActionMenuNodeById,
  getBattleActionDefinition,
} from "@/engine/battle/battleActionCatalog";
import {
  resolveEnemyTurn,
  resolveSelectedBattleAction,
} from "@/engine/battle/battleResolver";
import {
  createBattleSnapshotFromPendingBattle,
  createEnemyBattleParticipant,
  createPendingBattleSnapshot,
} from "@/engine/battle/battleSetup";
import {
  type BattleActionId,
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
    onItemConsumed: null as ((itemId: string) => void) | null,
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

      // Build enemy participants from content
      const enemyParticipants = this.pendingBattle.enemies.map(
        createEnemyBattleParticipant,
      );

      const allParticipants = [...playerParty, ...enemyParticipants];

      this.activeBattle = createBattleSnapshotFromPendingBattle({
        pendingBattle: this.pendingBattle,
        playerParty,
      });

      // Replace enemy participants with content-driven versions
      if (this.activeBattle != null) {
        this.activeBattle.participants = allParticipants;
      }

      if (this.activeBattle?.pressTurnAllocation != null) {
        const { participantIds } = this.activeBattle.pressTurnAllocation;
        this.activeBattle.currentActorId =
          participantIds.find((participantId) => {
            const participant = this.activeBattle?.participants.find(
              (candidate) => candidate.id === participantId,
            );

            return (
              participant != null &&
              participant.isActive &&
              !participant.isDown &&
              participant.canAct !== false
            );
          }) ?? null;
      }

      this.pendingBattle = null;
    },
    selectMenuNode(nodeId: string) {
      if (this.activeBattle === null || this.activeBattle.actionMenu == null) {
        return;
      }

      const node = findBattleActionMenuNodeById(
        this.activeBattle.actionMenu,
        nodeId,
      );

      if (node == null) {
        return;
      }

      if (node.kind === "group") {
        this.activeBattle.currentMenuNodeId = node.id;
        return;
      }

      if (node.actionId == null) {
        return;
      }

      const definition = getBattleActionDefinition(node.actionId);
      this.activeBattle.selectedActionId = definition.id;
      this.activeBattle.selectedContentId = node.contentId ?? null;

      if (definition.selectionMode === "none") {
        this.confirmSelectedAction();
      }
    },
    returnToRootMenu() {
      if (this.activeBattle === null) {
        return;
      }

      this.activeBattle.currentMenuNodeId = null;
    },
    selectTarget(targetId: string) {
      if (
        this.activeBattle === null ||
        this.activeBattle.selectedActionId == null
      ) {
        return;
      }

      const definition = getBattleActionDefinition(
        this.activeBattle.selectedActionId,
      );

      if (definition.selectionMode !== "selective") {
        return;
      }

      const target = this.activeBattle.participants.find(
        (participant) => participant.id === targetId,
      );

      if (target == null || !definition.allowedSides.includes(target.side)) {
        return;
      }

      this.activeBattle.selectedTargetId = targetId;
      this.confirmSelectedAction();
    },
    selectAction(actionId: string) {
      if (this.activeBattle === null || this.activeBattle.actionMenu == null) {
        return;
      }

      const matchingNode = findActionNodeIdByActionId(
        this.activeBattle.actionMenu,
        actionId,
      );

      if (matchingNode == null) {
        return;
      }

      this.selectMenuNode(matchingNode);
    },
    selectSwapParticipants({
      swapOutParticipantId,
      swapInParticipantId,
    }: {
      swapOutParticipantId: string;
      swapInParticipantId?: string | null;
    }) {
      if (this.activeBattle == null) {
        return;
      }

      this.activeBattle.selectedActionId = "swap";
      this.activeBattle.selectedSwapOutParticipantId = swapOutParticipantId;
      this.activeBattle.selectedSwapInParticipantId =
        swapInParticipantId ?? null;
      this.confirmSelectedAction();
    },
    confirmSelectedAction() {
      if (this.activeBattle === null) {
        return;
      }

      this.activeBattle = resolveSelectedBattleAction(this.activeBattle);

      // Handle item consumption
      if (this.activeBattle.consumedItemId && this.onItemConsumed) {
        this.onItemConsumed(this.activeBattle.consumedItemId);
        this.activeBattle.consumedItemId = null;
      }
    },
    resolveEnemyTurn() {
      if (this.activeBattle === null) {
        return;
      }

      this.activeBattle = resolveEnemyTurn(this.activeBattle);
    },
    restoreBattleSnapshot(input: {
      pendingBattle?: PendingBattleSnapshot;
      activeBattle?: BattleSnapshot;
    }) {
      this.pendingBattle = input.pendingBattle ?? null;
      this.activeBattle = input.activeBattle ?? null;
    },
  },
});

function findActionNodeIdByActionId(
  nodes: BattleSnapshot["actionMenu"],
  actionId: string,
): string | null {
  if (nodes == null) {
    return null;
  }

  for (const node of nodes) {
    if (
      node.kind === "action" &&
      node.actionId === (actionId as BattleActionId)
    ) {
      return node.id;
    }

    if (node.children != null) {
      const childMatch = findActionNodeIdByActionId(node.children, actionId);

      if (childMatch != null) {
        return childMatch;
      }
    }
  }

  return null;
}
