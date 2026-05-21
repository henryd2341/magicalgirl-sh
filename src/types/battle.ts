import { createDefaultBattleCommandMenuTree } from "@/engine/battle/battleActionCatalog";
import type { TriggerBattleEnemyInput } from "@/orchestrator/toolEnvelope";

export const BATTLE_LIFECYCLE_STATES = [
  "PENDING",
  "ACTIVE",
  "RESOLVED",
] as const;

export type BattleLifecycleState = (typeof BATTLE_LIFECYCLE_STATES)[number];

export const BATTLE_PHASES = [
  "PLAYER_COMMAND",
  "PLAYER_RESOLUTION",
  "ENEMY_TURN",
  "RESULT",
] as const;

export type BattlePhase = (typeof BATTLE_PHASES)[number];

export const COMBATANT_SIDES = ["player", "enemy"] as const;

export type CombatantSide = (typeof COMBATANT_SIDES)[number];

export const BATTLE_ACTION_IDS = [
  "attack",
  "guard",
  "pass",
  "basic-skill",
  "basic-item",
] as const;

export type BattleActionId = (typeof BATTLE_ACTION_IDS)[number];

export const BATTLE_ACTION_SELECTION_MODES = ["none", "selective"] as const;

export type BattleActionSelectionMode =
  (typeof BATTLE_ACTION_SELECTION_MODES)[number];

export const BATTLE_ACTION_RESOLUTION_KINDS = [
  "attack",
  "unimplemented",
] as const;

export type BattleActionResolutionKind =
  (typeof BATTLE_ACTION_RESOLUTION_KINDS)[number];

export interface BattleEnemyInstance {
  instanceId: string;
  enemyId: string;
  displayName: string;
  side: "enemy";
}

export interface BattleParticipant {
  id: string;
  side: CombatantSide;
  displayName: string;
  level?: number;
  hp: {
    current: number;
    max: number;
  };
  mp: {
    current: number;
    max: number;
  };
  isDown: boolean;
  statusEffects?: string[];
}

export interface PressTurnState {
  totalIcons: number;
  spentIcons: number;
}

export interface BattleActionDefinition {
  id: BattleActionId;
  label: string;
  description: string;
  selectionMode: BattleActionSelectionMode;
  allowedSides: CombatantSide[];
  resolutionKind: BattleActionResolutionKind;
}

export interface BattleActionMenuNode {
  id: string;
  label: string;
  description: string;
  kind: "action" | "group";
  actionId?: BattleActionId;
  children?: BattleActionMenuNode[];
}

export interface PendingBattleSnapshot {
  lifecycleState: "PENDING";
  encounterId: string;
  narrativeReason: string;
  enemies: BattleEnemyInstance[];
}

export interface BattleSnapshot {
  lifecycleState: BattleLifecycleState;
  phase: BattlePhase;
  encounterId: string;
  participants: BattleParticipant[];
  pressTurn: PressTurnState;
  turnCount?: number;
  selectedTargetId?: string | null;
  currentActorId?: string | null;
  currentMenuNodeId?: string | null;
  selectedActionId?: BattleActionId | null;
  actionMenu?: BattleActionMenuNode[];
  resultSummary?: string;
}

export interface CreatePendingBattleSnapshotInput {
  encounterId: string;
  narrativeReason: string;
  enemies: TriggerBattleEnemyInput[];
}

export interface CreateBattleSnapshotFromPendingBattleInput {
  pendingBattle: PendingBattleSnapshot;
  playerParty: BattleParticipant[];
}

export function expandTriggerBattleEnemies(
  enemies: TriggerBattleEnemyInput[],
): BattleEnemyInstance[] {
  const expanded: BattleEnemyInstance[] = [];
  let runningIndex = 1;

  for (const enemy of enemies) {
    for (let countIndex = 0; countIndex < enemy.count; countIndex += 1) {
      expanded.push({
        instanceId: `enemy-${runningIndex}`,
        enemyId: enemy.enemy_id,
        displayName: enemy.enemy_id,
        side: "enemy",
      });
      runningIndex += 1;
    }
  }

  return expanded;
}

export function createPendingBattleSnapshot(
  input: CreatePendingBattleSnapshotInput,
): PendingBattleSnapshot {
  return {
    lifecycleState: "PENDING",
    encounterId: input.encounterId,
    narrativeReason: input.narrativeReason,
    enemies: expandTriggerBattleEnemies(input.enemies),
  };
}

export function createBattleSnapshotFromPendingBattle(
  input: CreateBattleSnapshotFromPendingBattleInput,
): BattleSnapshot {
  const playerParticipants: BattleParticipant[] = input.playerParty.map(
    (participant) => ({
      ...participant,
      level: participant.level ?? 1,
      statusEffects: participant.statusEffects ?? [],
    }),
  );

  const enemyParticipants: BattleParticipant[] =
    input.pendingBattle.enemies.map((enemy) => ({
      id: enemy.instanceId,
      side: "enemy",
      displayName: enemy.displayName,
      level: 1,
      hp: {
        current: 1,
        max: 1,
      },
      mp: {
        current: 0,
        max: 0,
      },
      isDown: false,
      statusEffects: [],
    }));

  return {
    lifecycleState: "ACTIVE",
    phase: "PLAYER_COMMAND",
    encounterId: input.pendingBattle.encounterId,
    participants: [...playerParticipants, ...enemyParticipants],
    pressTurn: {
      totalIcons: playerParticipants.length,
      spentIcons: 0,
    },
    turnCount: 1,
    selectedTargetId: enemyParticipants[0]?.id ?? null,
    currentActorId: playerParticipants[0]?.id ?? null,
    currentMenuNodeId: null,
    selectedActionId: null,
    actionMenu: createDefaultBattleCommandMenuTree(),
  };
}
