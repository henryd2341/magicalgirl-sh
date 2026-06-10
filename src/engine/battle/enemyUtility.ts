/**
 * Enemy Utility AI — action/target selection via weighted scoring.
 *
 * For each (available action, valid target) pair, computes a numeric utility
 * score and picks the highest. Three behavior types configure the dimension
 * weights.
 */

import { getSkill } from "@/content/contentRegistry";
import { calculateDamage } from "@/engine/battle/formulaEngine";
import { getFormulaParams } from "@/content/contentRegistry";
import type { BattleParticipant } from "@/types/battle";
import type { SkillTargetType } from "@/types/content";
import { BATTLE_ELEMENTS } from "@/types/battle";

// ── Behavior types ──

export type EnemyBehaviorType = "conservative" | "aggressive" | "chaotic";

interface UtilityWeights {
  damage: number;
  healing: number;
  survival: number;
  weakness: number;
  noiseRange: number;
}

const BEHAVIOR_WEIGHTS: Record<EnemyBehaviorType, UtilityWeights> = {
  conservative: {
    damage: 0.3,
    healing: 0.35,
    survival: 0.35,
    weakness: 0,
    noiseRange: 0.1,
  },
  aggressive: {
    damage: 0.55,
    healing: 0.05,
    survival: 0,
    weakness: 0.4,
    noiseRange: 0.1,
  },
  chaotic: {
    damage: 0.3,
    healing: 0.2,
    survival: 0.2,
    weakness: 0.3,
    noiseRange: 0.3,
  },
};

// ── Action description ──

export interface EnemyAction {
  /** The content-registry skill ID, or undefined for basic attack. */
  skillId?: string;
  /** Display name for logging. */
  name: string;
  targetType: SkillTargetType;
  basePower: number;
  element: number;
  accuracy: number;
  statDriver: "attack" | "intelligence";
  healPercent?: number;
}

export interface ScoredAction {
  action: EnemyAction;
  target: BattleParticipant;
  score: number;
}

// ── Action enumeration ──

function buildBasicAttack(): EnemyAction {
  return {
    skillId: undefined,
    name: "攻击",
    targetType: "single_enemy",
    basePower: 10,
    element: BATTLE_ELEMENTS.Physical,
    accuracy: 100,
    statDriver: "attack",
  };
}

function buildSkillAction(skillId: string): EnemyAction | null {
  try {
    const skill = getSkill(skillId);
    // Skip passive skills (enemies don't "use" passives as actions)
    if (skill.category === "passive") return null;
    return {
      skillId,
      name: skill.name,
      targetType: skill.targetType,
      basePower: skill.power,
      element: skill.element,
      accuracy: skill.accuracy,
      statDriver: skill.statDriver,
      healPercent: skill.healPercent,
    };
  } catch {
    return null;
  }
}

function buildEnemyActions(actor: BattleParticipant): EnemyAction[] {
  const actions: EnemyAction[] = [buildBasicAttack()];

  if (actor.skillIds != null) {
    for (const skillId of actor.skillIds) {
      const action = buildSkillAction(skillId);
      if (action != null) actions.push(action);
    }
  }

  return actions;
}

// ── Target filtering ──

function filterTargetsByScope(
  action: EnemyAction,
  actor: BattleParticipant,
  allParticipants: BattleParticipant[],
): BattleParticipant[] {
  const alive = (p: BattleParticipant) => !p.isDown;

  switch (action.targetType) {
    case "single_enemy":
    case "all_enemies":
      return allParticipants.filter(
        (p) => p.side !== actor.side && p.isActive && alive(p),
      );
    case "single_ally":
    case "all_allies":
      return allParticipants.filter(
        (p) => p.side === actor.side && p.isActive && alive(p),
      );
    case "self":
      return [actor];
    default:
      return [];
  }
}

// ── Scoring helpers ──

/**
 * Estimate expected damage against a target, ignoring hit/crit RNG.
 * Uses the same formula engine as actual combat for consistency.
 */
function estimateDamage(
  actor: BattleParticipant,
  target: BattleParticipant,
  action: EnemyAction,
): number {
  const params = getFormulaParams();
  const driverStat =
    action.statDriver === "attack"
      ? (actor.attack ?? 5)
      : (actor.intelligence ?? 5);
  const defenderDef = target.defense ?? 5;

  // Base damage with neutral affinity (actual affinity applied separately
  // in the weakness dimension)
  return calculateDamage(
    driverStat,
    actor.level ?? 1,
    defenderDef,
    action.basePower,
    1.0, // neutral — weakness bonus tracked separately
    params.damage,
  );
}

/** Normalised HP deficit for healing priority (0 = full HP, 1 = almost dead). */
function hpDeficit(target: BattleParticipant): number {
  if (target.hp.max <= 0) return 0;
  return 1 - target.hp.current / target.hp.max;
}

function estimateHealValue(
  target: BattleParticipant,
  action: EnemyAction,
): number {
  if (action.healPercent != null && action.healPercent > 0) {
    return (action.healPercent / 100) * target.hp.max * hpDeficit(target);
  }
  // Non-heal skills get zero healing score
  return 0;
}

/** Survival instinct: higher when actor is low on HP. */
function survivalScore(actor: BattleParticipant): number {
  const ratio = actor.hp.current / Math.max(1, actor.hp.max);
  if (ratio > 0.5) return 0;
  return 1 - ratio; // 0 → 1 as HP drops
}

/** Weakness bonus: 1 if target is weak to skill element, 0 otherwise. */
function weaknessBonus(
  target: BattleParticipant,
  action: EnemyAction,
): number {
  if (action.element === BATTLE_ELEMENTS.None) return 0;
  if (action.element === BATTLE_ELEMENTS.Physical) return 0;
  const affinities = target.affinities;
  if (!affinities) return 0;
  return (affinities.weak & action.element) !== 0 ? 1 : 0;
}

// ── Main scoring function ──

function computeUtilityScore(
  action: EnemyAction,
  target: BattleParticipant,
  actor: BattleParticipant,
  weights: UtilityWeights,
): number {
  const dmg = estimateDamage(actor, target, action);
  const maxHp = Math.max(1, target.hp.max ?? 1);

  // Normalise damage to 0–1 range relative to target HP
  const damageNorm = Math.min(1, dmg / maxHp);

  const healVal = estimateHealValue(target, action);
  const survive = survivalScore(actor);
  const weak = weaknessBonus(target, action);

  let score =
    weights.damage * damageNorm +
    weights.healing * healVal +
    weights.survival * survive +
    weights.weakness * weak;

  // Random perturbation
  if (weights.noiseRange > 0) {
    const noise = (Math.random() * 2 - 1) * weights.noiseRange;
    score += noise;
  }

  return score;
}

// ── Public API ──

export function selectEnemyAction(
  actor: BattleParticipant,
  allParticipants: BattleParticipant[],
  behaviorType: EnemyBehaviorType = "aggressive",
): ScoredAction | null {
  const weights = BEHAVIOR_WEIGHTS[behaviorType];
  const actions = buildEnemyActions(actor);
  const candidates: ScoredAction[] = [];

  for (const action of actions) {
    const targets = filterTargetsByScope(action, actor, allParticipants);
    for (const target of targets) {
      // Skip healing at full HP unless it's the only option
      if (action.healPercent != null && action.healPercent > 0 && hpDeficit(target) < 0.1) {
        continue;
      }
      candidates.push({
        action,
        target,
        score: computeUtilityScore(action, target, actor, weights),
      });
    }
  }

  if (candidates.length === 0) return null;

  candidates.sort((a, b) => b.score - a.score);
  return candidates[0]!;
}

export { BEHAVIOR_WEIGHTS };
