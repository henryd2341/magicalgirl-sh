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

export interface BattleActionMenuItem {
  id: string;
  label: string;
  description: string;
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
  selectedActionId?: string | null;
  actionMenu?: BattleActionMenuItem[];
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
    selectedActionId: "attack",
    actionMenu: [
      {
        id: "attack",
        label: "Attack",
        description: "使用基础攻击对单体敌人造成伤害。",
      },
      {
        id: "skill",
        label: "Skill",
        description: "施放角色技能并消耗对应资源。",
      },
      {
        id: "guard",
        label: "Guard",
        description: "进入防御姿态，减少即将受到的伤害。",
      },
      {
        id: "item",
        label: "Item",
        description: "使用背包中的道具支援当前战斗。",
      },
    ],
  };
}
