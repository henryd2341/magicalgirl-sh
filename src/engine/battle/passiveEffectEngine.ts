import type { PassiveEffectDef, PassiveHook } from "@/types/content";
import type { BattleAffinityProfile } from "@/types/battle";
import { BATTLE_ELEMENTS, type BattleElement } from "@/types/battle";

import { getSkill } from "@/content/contentRegistry";

// ── Context types per hook ──

export interface DamageCalcContext {
  damage: number;
  element: string;
  actorHpPercent: number;
}

export interface TurnStartContext {
  hpMax: number;
  mpMax: number;
  hpCurrent: number;
  mpCurrent: number;
}

export interface DeathCheckContext {
  hpAfterDamage: number;
  endureUsed: boolean;
}

export interface ExpCalcContext {
  exp: number;
}

export interface StatusChanceContext {
  chance: number;
}

export type PassiveContext =
  | DamageCalcContext
  | TurnStartContext
  | DeathCheckContext
  | ExpCalcContext
  | StatusChanceContext;

// ── Element name -> bitmask mapping ──

const ELEMENT_NAME_TO_BIT: Record<string, BattleElement> = {
  Physical: BATTLE_ELEMENTS.Physical,
  Gun: BATTLE_ELEMENTS.Gun,
  Fire: BATTLE_ELEMENTS.Fire,
  Ice: BATTLE_ELEMENTS.Ice,
  Electric: BATTLE_ELEMENTS.Electric,
  Wind: BATTLE_ELEMENTS.Wind,
  Earth: BATTLE_ELEMENTS.Earth,
  Light: BATTLE_ELEMENTS.Light,
  Dark: BATTLE_ELEMENTS.Dark,
  Almighty: BATTLE_ELEMENTS.Almighty,
  Heal: BATTLE_ELEMENTS.Heal,
  Ailment: BATTLE_ELEMENTS.Ailment,
  None: BATTLE_ELEMENTS.None,
};

/** Reverse lookup: bitmask -> element name. */
export function elementBitToName(bit: BattleElement): string {
  for (const [name, mask] of Object.entries(ELEMENT_NAME_TO_BIT)) {
    if (mask === bit) return name;
  }
  return "None";
}

/**
 * Collect all passive effects from a participant's passive definitions.
 * Returns them as a flat array ready for hook dispatch.
 */
export function collectPassives(
  passives: PassiveEffectDef[] | undefined,
): PassiveEffectDef[] {
  return passives ?? [];
}

/**
 * Resolve passive effect definitions from a list of skill IDs.
 * Looks up each skill in the content registry and collects its passiveEffects.
 * Skills not found or without passive effects are silently skipped.
 */
export function resolvePassiveEffects(
  skillIds: string[],
): PassiveEffectDef[] {
  const effects: PassiveEffectDef[] = [];
  for (const skillId of skillIds) {
    try {
      const skill = getSkill(skillId);
      if (skill.passiveEffects != null && skill.passiveEffects.length > 0) {
        effects.push(...skill.passiveEffects);
      }
    } catch {
      // Skill not in registry, skip
    }
  }
  return effects;
}

/**
 * Apply all passive effects registered for the given hook.
 * Returns the modified context.
 */
export function applyPassivesAtHook(
  passives: PassiveEffectDef[],
  hook: PassiveHook,
  context: PassiveContext,
): PassiveContext {
  for (const p of passives) {
    if (p.hook !== hook) continue;
    if (!conditionMet(p, context)) continue;
    context = dispatchEffect(p, context);
  }
  return context;
}

/**
 * Build a modified affinity profile with passive nullify/resist applied.
 * Callers should merge this into the participant's base affinities.
 */
export function applyPassiveAffinities(
  passives: PassiveEffectDef[],
  base: BattleAffinityProfile,
): BattleAffinityProfile {
  const result: BattleAffinityProfile = {
    weak: base.weak,
    resist: base.resist,
    nullify: base.nullify,
    reflect: base.reflect,
    absorb: base.absorb,
  };

  for (const p of passives) {
    if (p.hook !== "on_damage_calc") continue;
    const bit = elementBit(p.element);
    if (bit === 0) continue;

    if (p.type === "element_nullify") {
      result.nullify |= bit;
      // Remove lower-priority affinity for same element
      result.resist &= ~bit;
    } else if (p.type === "element_resist") {
      // Only apply if not already nullified/reflected/absorbed
      if ((result.nullify | result.reflect | result.absorb) & bit) continue;
      result.resist |= bit;
    }
  }

  return result;
}

// ── Internal helpers ──

function conditionMet(p: PassiveEffectDef, context: PassiveContext): boolean {
  if (!p.condition) return true;

  // Only damage_calc hook supports conditions currently
  if (p.hook === "on_damage_calc" && p.condition.stat === "hp") {
    const ctx = context as DamageCalcContext;
    if (p.condition.operator === "below") {
      return ctx.actorHpPercent < p.condition.threshold;
    }
    if (p.condition.operator === "above") {
      return ctx.actorHpPercent > p.condition.threshold;
    }
  }

  return true;
}

function dispatchEffect(p: PassiveEffectDef, context: PassiveContext): PassiveContext {
  switch (p.hook) {
    case "on_damage_calc":
      return applyDamageCalcEffect(p, context as DamageCalcContext);
    case "on_turn_start":
      return applyTurnStartEffect(p, context as TurnStartContext);
    case "on_death_check":
      return applyDeathCheckEffect(p, context as DeathCheckContext);
    case "on_exp_calc":
      return applyExpCalcEffect(p, context as ExpCalcContext);
    case "on_status_chance":
      return applyStatusChanceEffect(p, context as StatusChanceContext);
    default:
      return context;
  }
}

function applyDamageCalcEffect(
  p: PassiveEffectDef,
  ctx: DamageCalcContext,
): DamageCalcContext {
  switch (p.type) {
    case "element_boost": {
      if (p.element && ctx.element === p.element) {
        ctx.damage = Math.round(ctx.damage * (1 + p.value / 100));
      }
      break;
    }
    case "element_resist": {
      if (p.element && ctx.element === p.element) {
        ctx.damage = Math.round(ctx.damage * (1 + p.value / 100));
      }
      break;
    }
    case "damage_boost": {
      // Already condition-checked above
      ctx.damage = Math.round(ctx.damage * (1 + p.value / 100));
      break;
    }
    case "crit_boost": {
      // crit_boost is handled by modifying combatStats.critRate
      // This hook only exists for documentation; actual crit rate change
      // is applied when building BattleParticipant.combatStats
      break;
    }
  }
  return ctx;
}

function applyTurnStartEffect(
  p: PassiveEffectDef,
  ctx: TurnStartContext,
): TurnStartContext {
  switch (p.type) {
    case "hp_regen": {
      const heal = Math.round(ctx.hpMax * p.value / 100);
      ctx.hpCurrent = Math.min(ctx.hpMax, ctx.hpCurrent + heal);
      break;
    }
    case "mp_regen": {
      const regen = Math.round(ctx.mpMax * p.value / 100);
      ctx.mpCurrent = Math.min(ctx.mpMax, ctx.mpCurrent + regen);
      break;
    }
  }
  return ctx;
}

function applyDeathCheckEffect(
  p: PassiveEffectDef,
  ctx: DeathCheckContext,
): DeathCheckContext {
  if (p.type === "endure" && !ctx.endureUsed && ctx.hpAfterDamage <= 0) {
    ctx.hpAfterDamage = p.value; // typically 1
    ctx.endureUsed = true;
  }
  return ctx;
}

function applyExpCalcEffect(
  p: PassiveEffectDef,
  ctx: ExpCalcContext,
): ExpCalcContext {
  if (p.type === "exp_boost") {
    ctx.exp = Math.round(ctx.exp * (1 + p.value / 100));
  }
  return ctx;
}

function applyStatusChanceEffect(
  p: PassiveEffectDef,
  ctx: StatusChanceContext,
): StatusChanceContext {
  if (p.type === "status_boost") {
    ctx.chance = Math.round(ctx.chance * (1 + p.value / 100));
  }
  return ctx;
}

function elementBit(name: string | undefined): BattleElement {
  if (!name) return 0;
  return ELEMENT_NAME_TO_BIT[name] ?? 0;
}
