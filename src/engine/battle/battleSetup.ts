import { getEnemy, getFormulaParams, getGrowth } from "@/content/contentRegistry";
import { computeDerivedCombatStats, statsAtLevel } from "@/engine/battle/formulaEngine";
import type { BattleEnemyInstance, BattleParticipant } from "@/types/battle";
import type { GrowthContent } from "@/types/content";

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
 * Build a BattleParticipant for a player character using their growth table.
 */
export function createPlayerBattleParticipant(
  id: string,
  displayName: string,
  level: number,
  growthId: string,
  accessoryModifiers?: Partial<Pick<BattleParticipant, "attack" | "defense" | "agility" | "intelligence">>,
): BattleParticipant {
  const growth = getGrowth(growthId);
  const params = getFormulaParams();
  const stats = statsAtLevel(growth.base, growth.perLevel, level);
  const derived = computeDerivedCombatStats(
    stats.agility,
    params.hitRate,
    params.critRate,
  );

  // Apply accessory modifiers
  const attack = stats.attack + (accessoryModifiers?.attack ?? 0);
  const defense = stats.defense + (accessoryModifiers?.defense ?? 0);
  const agility = stats.agility + (accessoryModifiers?.agility ?? 0);
  const intelligence = stats.intelligence + (accessoryModifiers?.intelligence ?? 0);

  return {
    id,
    side: "player",
    displayName,
    level,
    hp: {
      current: stats.hp.current,
      max: stats.hp.max,
    },
    mp: {
      current: stats.mp.current,
      max: stats.mp.max,
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
