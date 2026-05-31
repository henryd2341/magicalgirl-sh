import type {
  BattleActionOutcomeType,
  BattleAffinityProfile,
  BattleElement,
} from "@/types/battle";
import { resolveAffinityResult } from "@/engine/battle/battleAffinity";
import type {
  CombatStats,
  FormulaParams,
  GrowthStats,
  StatusEffectContent,
  StatusEffectTickResult,
} from "@/types/content";

// ── Random utility ──

function randomInRange(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

// ── Damage calculation ──

export function calculateDamage(
  attackerAtk: number,
  attackerLevel: number,
  defenderDef: number,
  skillPower: number,
  affinityMultiplier: number,
  params: FormulaParams["damage"],
): number {
  if (affinityMultiplier === 0) {
    return 0;
  }

  const base = Math.sqrt(skillPower * 2);
  const statRatio = Math.sqrt(
    attackerAtk / Math.max(1, defenderDef),
  );
  const levelMod = 1 + attackerLevel * params.levelInfluence;
  const variance = randomInRange(params.varianceMin, params.varianceMax);

  return Math.max(params.minDamage, Math.floor(
    base * statRatio * levelMod * affinityMultiplier * variance,
  ));
}

// ── Hit chance calculation ──

export function calculateHitChance(
  skillAccuracy: number,
  attackerAgility: number,
  defenderAgility: number,
  params: FormulaParams["hitRate"],
): number {
  return clamp(
    skillAccuracy + (attackerAgility - defenderAgility) * params.agilityInfluence,
    params.minHitRate,
    params.maxHitRate,
  );
}

export function rollHit(hitChance: number): boolean {
  return Math.random() * 100 < hitChance;
}

// ── Critical hit calculation ──

export function calculateCritChance(
  agility: number,
  params: FormulaParams["critRate"],
): number {
  return Math.min(params.base + agility * params.agilityBonus, params.max);
}

export function rollCrit(critChance: number): boolean {
  return Math.random() * 100 < critChance;
}

// ── Affinity resolution ──

export function resolveAffinityMultiplier(
  profile: BattleAffinityProfile,
  element: BattleElement,
  params: FormulaParams["affinity"],
): number {
  const result = resolveAffinityResult(profile, element);

  switch (result) {
    case "weak":
      return params.weak;
    case "resist":
      return params.resist;
    case "nullify":
      return params.nullify;
    default:
      return params.normal;
  }
}

export function resolveAffinityOutcomeType(
  profile: BattleAffinityProfile,
  element: BattleElement,
): { outcomeType: BattleActionOutcomeType | null; preventedBy?: "nullify" | "reflect" | "absorb" } {
  const result = resolveAffinityResult(profile, element);

  switch (result) {
    case "reflect":
      return { outcomeType: "reflect", preventedBy: "reflect" };
    case "absorb":
      return { outcomeType: "absorb", preventedBy: "absorb" };
    case "nullify":
      return { outcomeType: "block", preventedBy: "nullify" };
    default:
      return { outcomeType: null };
  }
}

// ── Experience calculation ──

export function calculateExpToNextLevel(
  level: number,
  params: FormulaParams["exp"],
): number {
  return Math.floor(params.baseExpToNext * Math.pow(level, params.levelExponent));
}

export function calculateExpGained(
  enemyBaseExp: number,
  enemyLevel: number,
  playerLevel: number,
): number {
  return Math.max(1, Math.floor(
    enemyBaseExp * (enemyLevel / Math.max(1, playerLevel)),
  ));
}

// ── Growth table ──

export interface AllocatedPoints {
  attack: number;
  defense: number;
  agility: number;
  intelligence: number;
}

/**
 * Combine base growth stats with manually allocated points.
 * atk/def/agi/int = base + allocated; hp/mp come from statsAtLevel.
 */
export function computeGrowthStats(
  base: GrowthStats,
  allocated: AllocatedPoints,
): Pick<CombatStats, "attack" | "defense" | "agility" | "intelligence"> {
  return {
    attack: base.attack + allocated.attack,
    defense: base.defense + allocated.defense,
    agility: base.agility + allocated.agility,
    intelligence: base.intelligence + allocated.intelligence,
  };
}

export function statsAtLevel(
  base: GrowthStats,
  perLevel: GrowthStats,
  level: number,
): Omit<CombatStats, "level" | "exp"> {
  const levelOffset = level - 1;

  return {
    hp: { current: base.hp + perLevel.hp * levelOffset, max: base.hp + perLevel.hp * levelOffset },
    mp: { current: base.mp + perLevel.mp * levelOffset, max: base.mp + perLevel.mp * levelOffset },
    attack: base.attack + perLevel.attack * levelOffset,
    defense: base.defense + perLevel.defense * levelOffset,
    agility: base.agility + perLevel.agility * levelOffset,
    intelligence: base.intelligence + perLevel.intelligence * levelOffset,
  };
}

// ── Derived combat stats (accuracy / evasion / critRate) ──

export interface DerivedCombatStats {
  accuracy: number;
  evasion: number;
  critRate: number;
}

export function computeDerivedCombatStats(
  agility: number,
  hitParams: FormulaParams["hitRate"],
  critParams: FormulaParams["critRate"],
): DerivedCombatStats {
  return {
    accuracy: clamp(
      90 + agility * hitParams.agilityInfluence,
      hitParams.minHitRate,
      hitParams.maxHitRate,
    ),
    evasion: clamp(
      80 + agility * hitParams.agilityInfluence * 0.5,
      hitParams.minHitRate,
      hitParams.maxHitRate,
    ),
    critRate: calculateCritChance(agility, critParams),
  };
}

// ── Guard damage reduction ──

export function calculateGuardReduction(
  baseDamage: number,
  params: FormulaParams["guard"],
): number {
  return Math.max(0, baseDamage - params.damageReduction);
}

// ── Status effect tick ──

export function applyStatusEffectTick(
  participantHpMax: number,
  effect: StatusEffectContent,
): StatusEffectTickResult {
  const result: StatusEffectTickResult = {
    hpDelta: 0,
    mpDelta: 0,
    statChanges: {},
    expired: false,
  };

  if (effect.damagePercent != null) {
    result.hpDelta = -Math.floor(participantHpMax * (effect.damagePercent / 100));
  }

  if (effect.healPercent != null) {
    result.hpDelta = Math.floor(participantHpMax * (effect.healPercent / 100));
  }

  if (effect.statModifiers != null) {
    result.statChanges = { ...effect.statModifiers };
  }

  return result;
}
