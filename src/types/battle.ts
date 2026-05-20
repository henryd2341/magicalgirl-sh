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
  hp: {
    current: number;
    max: number;
  };
  mp: {
    current: number;
    max: number;
  };
  isDown: boolean;
}

export interface PressTurnState {
  totalIcons: number;
  spentIcons: number;
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
  const enemyParticipants: BattleParticipant[] =
    input.pendingBattle.enemies.map((enemy) => ({
      id: enemy.instanceId,
      side: "enemy",
      displayName: enemy.displayName,
      hp: {
        current: 1,
        max: 1,
      },
      mp: {
        current: 0,
        max: 0,
      },
      isDown: false,
    }));

  return {
    lifecycleState: "ACTIVE",
    phase: "PLAYER_COMMAND",
    encounterId: input.pendingBattle.encounterId,
    participants: [...input.playerParty, ...enemyParticipants],
    pressTurn: {
      totalIcons: input.playerParty.length,
      spentIcons: 0,
    },
  };
}
