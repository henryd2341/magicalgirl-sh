import { getEnemy, getFormulaParams, getGrowth } from "@/content/contentRegistry";
import {
  computeDerivedCombatStats,
  computeGrowthStats,
  statsAtLevel,
  type AllocatedPoints,
} from "@/engine/battle/formulaEngine";
import type {
  BattleEnemyInstance,
  BattleParticipant,
  BattleSnapshot,
  CreateBattleSnapshotFromPendingBattleInput,
  CreatePendingBattleSnapshotInput,
  PendingBattleSnapshot,
} from "@/types/battle";
import type { TriggerBattleEnemyInput } from "@/orchestrator/toolEnvelope";
import {
  createDefaultBattleCommandMenuTree,
} from "@/engine/battle/battleActionCatalog";
import {
  createPressTurnStateForSide,
} from "@/engine/battle/pressTurn";

/**
 * Build a BattleParticipant from content data for an enemy.
 */
export function createEnemyBattleParticipant(
  enemy: BattleEnemyInstance,
): BattleParticipant {
  let level = 1;
  let hp = 5;
  let mp = 0;
  let attack = 5;
  let defense = 3;
  let agility = 5;
  let intelligence = 3;
  let displayName = enemy.displayName;
  let affinities = { weak: 0, resist: 0, nullify: 0, reflect: 0, absorb: 0 };

  try {
    const enemyDef = getEnemy(enemy.enemyId);
    level = enemyDef.baseLevel;
    hp = enemyDef.stats.hp;
    mp = enemyDef.stats.mp;
    attack = enemyDef.stats.attack;
    defense = enemyDef.stats.defense;
    agility = enemyDef.stats.agility;
    intelligence = enemyDef.stats.intelligence;
    displayName = enemyDef.name;
    affinities = enemyDef.affinities;
  } catch {
    // Enemy not in content registry, use defaults
  }

  const params = getFormulaParams();
  const derived = computeDerivedCombatStats(
    agility,
    params.hitRate,
    params.critRate,
  );

  return {
    id: enemy.instanceId,
    side: "enemy",
    displayName,
    level,
    hp: {
      current: hp,
      max: hp,
    },
    mp: {
      current: mp,
      max: mp,
    },
    attack,
    defense,
    agility,
    intelligence,
    isDown: false,
    isActive: true,
    statusEffects: [],
    affinities,
    combatStats: derived,
    canAct: true,
  };
}

/**
 * Build a BattleParticipant for a player character using their growth table
 * and manually allocated stat points.
 *
 * HP/MP auto-scale from the growth table; atk/def/agi/int use
 * base stats + allocatedPoints + accessory modifiers.
 */
export function createPlayerBattleParticipant(
  id: string,
  displayName: string,
  level: number,
  growthId: string,
  allocatedPoints: AllocatedPoints,
  accessoryModifiers?: Partial<Pick<BattleParticipant, "attack" | "defense" | "agility" | "intelligence">>,
): BattleParticipant {
  const growth = getGrowth(growthId);
  const params = getFormulaParams();

  // HP/MP auto-scale from growth table
  const hpMp = statsAtLevel(growth.base, growth.perLevel, level);

  // atk/def/agi/int = base + allocated + accessory
  const stats = computeGrowthStats(growth.base, allocatedPoints);

  const attack = stats.attack + (accessoryModifiers?.attack ?? 0);
  const defense = stats.defense + (accessoryModifiers?.defense ?? 0);
  const agility = stats.agility + (accessoryModifiers?.agility ?? 0);
  const intelligence = stats.intelligence + (accessoryModifiers?.intelligence ?? 0);

  const derived = computeDerivedCombatStats(
    agility,
    params.hitRate,
    params.critRate,
  );

  return {
    id,
    side: "player",
    displayName,
    level,
    hp: {
      current: hpMp.hp.current,
      max: hpMp.hp.max,
    },
    mp: {
      current: hpMp.mp.current,
      max: hpMp.mp.max,
    },
    attack,
    defense,
    agility,
    intelligence,
    isDown: false,
    isActive: true,
    statusEffects: [],
    affinities: {
      weak: 0,
      resist: 0,
      nullify: 0,
      reflect: 0,
      absorb: 0,
    },
    combatStats: derived,
    canAct: true,
  };
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
      isActive: participant.isActive ?? true,
      statusEffects: participant.statusEffects ?? [],
      affinities: participant.affinities ?? {
        weak: 0,
        resist: 0,
        nullify: 0,
        reflect: 0,
        absorb: 0,
      },
      combatStats: participant.combatStats ?? {
        accuracy: 100,
        evasion: 100,
        critRate: 0,
      },
      canAct: participant.canAct ?? true,
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
      isActive: true,
      statusEffects: [],
      affinities: {
        weak: 0,
        resist: 0,
        nullify: 0,
        reflect: 0,
        absorb: 0,
      },
      combatStats: {
        accuracy: 100,
        evasion: 100,
        critRate: 0,
      },
      canAct: true,
    }));

  const participants = [...playerParticipants, ...enemyParticipants];
  const playerActingParticipantIds = playerParticipants
    .filter(
      (participant) =>
        participant.isActive &&
        !participant.isDown &&
        participant.canAct !== false,
    )
    .map((participant) => participant.id);

  return {
    lifecycleState: "ACTIVE",
    phase: "PLAYER_COMMAND",
    encounterId: input.pendingBattle.encounterId,
    participants,
    pressTurn: createPressTurnStateForSide(participants, "player"),
    pressTurnAllocation: {
      participantIds: playerActingParticipantIds,
      initialIconCount: playerActingParticipantIds.length,
    },
    turnCount: 1,
    selectedTargetId: enemyParticipants[0]?.id ?? null,
    currentActorId: playerParticipants[0]?.id ?? null,
    currentMenuNodeId: null,
    selectedActionId: null,
    selectedSwapOutParticipantId: null,
    selectedSwapInParticipantId: null,
    actionMenu: createDefaultBattleCommandMenuTree(),
    battleResult: undefined,
    battleLog: [],
  };
}

