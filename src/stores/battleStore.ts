/* eslint-disable no-unused-vars */
import {
  findBattleActionMenuNodeById,
  getBattleActionDefinition,
  createDefaultBattleCommandMenuTree,
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
import { getSkill, getItem } from "@/content/contentRegistry";
import {
  type BattleActionId,
  type BattleParticipant,
  type BattleSnapshot,
  type CreatePendingBattleSnapshotInput,
  type PendingBattleSnapshot,
} from "@/types/battle";
import type { SkillTargetType } from "@/types/content";
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
    _currentBattleItems: null as Record<string, number> | null,
  }),
  actions: {
    stagePendingEncounter(input: StagePendingEncounterInput) {
      console.log("[battleStore.stagePendingEncounter] input =", input);
      this.pendingBattle = createPendingBattleSnapshot(input);
      console.log("[battleStore.stagePendingEncounter] pendingBattle set to =", this.pendingBattle);
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

      // Clear stale target type hint before processing new selection
      this.activeBattle._targetTypeHint = null;

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

      // Swap: enter swap-out selection phase instead of auto-confirming
      if (definition.resolutionKind === "swap") {
        this.activeBattle.swapPhase = "select_out";
        return;
      }

      // For basic-skill, read skill content to determine targetType
      if (definition.id === "basic-skill" && node.contentId) {
        try {
          const skill = getSkill(node.contentId);
          const targetType: SkillTargetType = skill.targetType ?? "single_enemy";

          // Auto-confirm for skills that don't need manual target selection.
          // Must set a non-null targetId so the resolver's target_required guard passes.
          // resolveTargets ignores selectedTargetId for self/all_allies/all_enemies.
          if (
            targetType === "self" ||
            targetType === "all_allies" ||
            targetType === "all_enemies"
          ) {
            this.activeBattle.selectedTargetId =
              pickArbitraryTargetId(
                this.activeBattle.participants,
                targetType,
                this.activeBattle.currentActorId,
              );
            this.confirmSelectedAction();
            return;
          }

          // For single_ally, store expected target side for validation
          if (targetType === "single_ally") {
            this.activeBattle.selectedTargetId = null;
            this.activeBattle._targetTypeHint = "single_ally";
            return;
          }

          // For single_enemy, clear target to force selection
          this.activeBattle.selectedTargetId = null;
          this.activeBattle._targetTypeHint = "single_enemy";
          return;
        } catch {
          // skill not found, fall through to default behavior
        }
      }

      // For basic-item, read item content to determine targetType
      if (definition.id === "basic-item" && node.contentId) {
        try {
          const item = getItem(node.contentId);
          const targetType = item.targetType ?? null;

          // Auto-confirm for items that don't need manual target selection
          if (
            targetType === "self" ||
            targetType === "all_allies" ||
            targetType === "all_enemies"
          ) {
            this.activeBattle.selectedTargetId =
              pickArbitraryTargetId(
                this.activeBattle.participants,
                targetType,
                this.activeBattle.currentActorId,
              );
            this.confirmSelectedAction();
            return;
          }

          // For single_ally, store expected target side for validation
          if (targetType === "single_ally") {
            this.activeBattle.selectedTargetId = null;
            this.activeBattle._targetTypeHint = "single_ally";
            return;
          }

          // For single_enemy, clear target to force selection
          if (targetType === "single_enemy") {
            this.activeBattle.selectedTargetId = null;
            this.activeBattle._targetTypeHint = "single_enemy";
            return;
          }

          // No targetType specified — allow both sides (hint already cleared above)
          return;
        } catch {
          // item not found, fall through to default behavior
        }
      }

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

      if (target == null) {
        return;
      }

      // For basic-skill, validate target side against skill's targetType
      if (definition.id === "basic-skill" && this.activeBattle.selectedContentId) {
        try {
          const skill = getSkill(this.activeBattle.selectedContentId);
          const targetType: SkillTargetType = skill.targetType ?? "single_enemy";
          const allowedSide = targetType === "single_ally" ? "player" : "enemy";
          if (target.side !== allowedSide) {
            return;
          }
        } catch {
          // fall through to generic allowedSides check
          if (!definition.allowedSides.includes(target.side)) {
            return;
          }
        }
      } else if (definition.id === "basic-item" && this.activeBattle.selectedContentId) {
        try {
          const item = getItem(this.activeBattle.selectedContentId);
          const targetType = item.targetType ?? null;
          if (targetType) {
            const allowedSide = targetType === "single_ally" ? "player" : "enemy";
            if (target.side !== allowedSide) {
              return;
            }
          }
          // null targetType means both sides allowed — fall through to allowedSides check
        } catch {
          // fall through to generic allowedSides check
          if (!definition.allowedSides.includes(target.side)) {
            return;
          }
        }
      } else if (!definition.allowedSides.includes(target.side)) {
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
      this.activeBattle.swapPhase = "idle";
      this.confirmSelectedAction();
    },
    selectSwapOut(participantId: string) {
      if (this.activeBattle == null) return;

      // Guard: prevent swapping out the last active player when no reserve exists
      const activePlayerCount = this.activeBattle.participants.filter(
        p => p.side === "player" && p.isActive && !p.isDown,
      ).length;
      const reserveCount = this.activeBattle.participants.filter(
        p => p.side === "player" && !p.isActive && !p.isDown,
      ).length;
      const targetIsActive = this.activeBattle.participants.some(
        p => p.id === participantId && p.isActive,
      );
      if (targetIsActive && activePlayerCount <= 1 && reserveCount === 0) {
        return; // Cannot leave the party with zero active members and no one to swap in
      }

      this.activeBattle.selectedSwapOutParticipantId = participantId;
      // Check if there are reserve members to swap in
      const hasReserve = this.activeBattle.participants.some(
        p => p.side === "player" && !p.isActive,
      );
      if (hasReserve) {
        this.activeBattle.swapPhase = "select_in";
      } else {
        // No reserve — only allow if someone else stays active
        const activeCount = this.activeBattle.participants.filter(
          p => p.side === "player" && p.isActive && !p.isDown && p.id !== participantId,
        ).length;
        if (activeCount === 0) return;

        this.activeBattle.swapPhase = "idle";
        this.selectSwapParticipants({
          swapOutParticipantId: participantId,
          swapInParticipantId: null,
        });
      }
    },
    selectSwapIn(participantId: string | null) {
      if (this.activeBattle == null) return;
      if (this.activeBattle.selectedSwapOutParticipantId == null) return;

      // Guard: if no swap-in, ensure at least one player remains active
      if (participantId == null) {
        const activeCount = this.activeBattle.participants.filter(
          p => p.side === "player" && p.isActive && !p.isDown,
        ).length;
        const swapeeIsActive = this.activeBattle.participants.some(
          p => p.id === this.activeBattle!.selectedSwapOutParticipantId && p.isActive,
        );
        if (swapeeIsActive && activeCount <= 1) {
          return; // Would leave zero active players
        }
      }

      this.activeBattle.swapPhase = "idle";
      this.selectSwapParticipants({
        swapOutParticipantId: this.activeBattle.selectedSwapOutParticipantId,
        swapInParticipantId: participantId,
      });
    },
    cancelSwap() {
      if (this.activeBattle == null) return;
      this.activeBattle.swapPhase = "idle";
      this.activeBattle.selectedActionId = null;
      this.activeBattle.selectedContentId = null;
      this.activeBattle.selectedSwapOutParticipantId = null;
      this.activeBattle.selectedSwapInParticipantId = null;
      this.activeBattle.currentMenuNodeId = null;
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

      // Rebuild menu for next player actor
      if (this.activeBattle.currentActorId) {
        this.rebuildActionMenuForActor(this.activeBattle.currentActorId);
      }
    },
    resolveEnemyTurn() {
      if (this.activeBattle === null) {
        return;
      }

      this.activeBattle = resolveEnemyTurn(this.activeBattle);

      // Rebuild menu when turn returns to player
      if (this.activeBattle.currentActorId) {
        this.rebuildActionMenuForActor(this.activeBattle.currentActorId);
      }
    },
    restoreBattleSnapshot(input: {
      pendingBattle?: PendingBattleSnapshot;
      activeBattle?: BattleSnapshot;
    }) {
      this.pendingBattle = input.pendingBattle ?? null;
      this.activeBattle = input.activeBattle ?? null;
    },
    setBattleItems(items: Record<string, number>) {
      this._currentBattleItems = items;
    },
    rebuildActionMenuForActor(actorId: string) {
      if (this.activeBattle === null) return;
      const actor = this.activeBattle.participants.find(p => p.id === actorId);
      if (!actor) return;
      const actorSkills = actor.availableSkillIds;
      this.activeBattle.actionMenu = createDefaultBattleCommandMenuTree(
        actorSkills,
        this._currentBattleItems ?? undefined,
      );
      // Clear previous actor's action selection state
      this.activeBattle.currentMenuNodeId = null;
      this.activeBattle.selectedActionId = null;
      this.activeBattle.selectedContentId = null;
      this.activeBattle.selectedTargetId = null;
      this.activeBattle._targetTypeHint = null;
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

function pickArbitraryTargetId(
  participants: BattleParticipant[],
  targetType: SkillTargetType,
  actorId: string | null | undefined,
): string {
  if (targetType === "self") {
    return actorId ?? participants[0]?.id ?? "";
  }
  if (targetType === "all_allies") {
    const ally =
      participants.find((p) => p.side === "player" && p.isActive && !p.isDown);
    return ally?.id ?? actorId ?? participants[0]?.id ?? "";
  }
  // all_enemies
  const enemy =
    participants.find((p) => p.side === "enemy" && p.isActive && !p.isDown);
  return enemy?.id ?? participants[0]?.id ?? "";
}
