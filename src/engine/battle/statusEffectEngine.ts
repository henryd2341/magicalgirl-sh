import type {
  ActiveStatusEffect,
  BattleElement,
  BattleParticipant,
} from "@/types/battle";
import type {
  StatusEffectContent,
} from "@/types/content";


// ── Shield effect → element + kind mapping ──

type ShieldKind = "nullify" | "reflect" | "absorb";

interface ShieldEntry {
  elementMask: BattleElement;
  kind: ShieldKind;
}

function buildShieldMap(): Record<string, ShieldEntry> {
  const elements: Record<string, BattleElement> = {
    fire: 4,       // Fire = 1 << 2
    ice: 8,        // Ice = 1 << 3
    wind: 32,      // Wind = 1 << 5
    electric: 16,  // Electric = 1 << 4
    earth: 64,     // Earth = 1 << 6
  };

  const map: Record<string, ShieldEntry> = {};

  for (const [key, mask] of Object.entries(elements)) {
    map[`${key}_null`] = { elementMask: mask, kind: "nullify" };
    map[`${key}_reflect`] = { elementMask: mask, kind: "reflect" };
    map[`${key}_absorb`] = { elementMask: mask, kind: "absorb" };
  }

  map["element_null"] = {
    elementMask: 4 | 8 | 16 | 32 | 64, // Fire | Ice | Electric | Wind | Earth
    kind: "nullify",
  };
  map["physical_null"] = { elementMask: 1, kind: "nullify" };
  map["physical_reflect"] = { elementMask: 1, kind: "reflect" };
  map["physical_absorb"] = { elementMask: 1, kind: "absorb" };

  return map;
}

let _shieldEffectMap: Record<string, ShieldEntry> | null = null;
function getShieldEffectMap(): Record<string, ShieldEntry> {
  if (_shieldEffectMap == null) _shieldEffectMap = buildShieldMap();
  return _shieldEffectMap;
}

// ── Shield check ──

export interface ShieldCheckResult {
  blocked: boolean;
  shieldEffectId?: string;
  kind?: ShieldKind;
}

export function checkShield(
  activeEffects: ActiveStatusEffect[],
  element: BattleElement,
): ShieldCheckResult {
  for (const effect of activeEffects) {
    const entry = getShieldEffectMap()[effect.effectId];
    if (entry != null && (entry.elementMask & element) === element) {
      return {
        blocked: true,
        shieldEffectId: effect.effectId,
        kind: entry.kind,
      };
    }
  }
  return { blocked: false };
}

// ── Effective stats computation ──

const STAT_MODIFIER_KEYS = ["attack", "defense", "agility", "intelligence"] as const;
const MAX_STAT_STACKS = 2;

export function computeEffectiveStats(
  base: Pick<BattleParticipant, "attack" | "defense" | "agility" | "intelligence">,
  activeEffects: ActiveStatusEffect[],
  effectMap: Map<string, StatusEffectContent>,
): Pick<BattleParticipant, "attack" | "defense" | "agility" | "intelligence"> {
  const result = {
    attack: base.attack ?? 5,
    defense: base.defense ?? 5,
    agility: base.agility ?? 5,
    intelligence: base.intelligence ?? 5,
  };

  for (const effect of activeEffects) {
    const content = effectMap.get(effect.effectId);
    if (content == null || content.statModifiers == null) continue;

    for (const key of STAT_MODIFIER_KEYS) {
      const mod = content.statModifiers[key];
      if (mod != null) {
        result[key] += mod * effect.stacks;
      }
    }
  }

  // Clamp to ±MAX_STAT_STACKS
  for (const key of STAT_MODIFIER_KEYS) {
    const baseVal = base[key] ?? 5;
    const delta = result[key] - baseVal;
    result[key] = baseVal + Math.max(-MAX_STAT_STACKS, Math.min(MAX_STAT_STACKS, delta));
  }

  return result;
}

// ── Status effect application ──

export function applyStatusEffect(
  effects: ActiveStatusEffect[],
  effectId: string,
  duration: number,
  effectContent: StatusEffectContent,
): { effects: ActiveStatusEffect[]; applied: boolean } {
  const existing = effects.find((e) => e.effectId === effectId);

  if (existing != null) {
    if (effectContent.stackable) {
      const newStacks = Math.min(MAX_STAT_STACKS, existing.stacks + 1);
      const updated = effects.map((e) =>
        e.effectId === effectId
          ? { ...e, stacks: newStacks, remainingDuration: Math.max(e.remainingDuration, duration) }
          : e,
      );
      return { effects: updated, applied: newStacks > existing.stacks };
    } else {
      // Non-stackable: refresh duration
      const updated = effects.map((e) =>
        e.effectId === effectId
          ? { ...e, remainingDuration: Math.max(e.remainingDuration, duration) }
          : e,
      );
      return { effects: updated, applied: true };
    }
  }

  // New effect
  return {
    effects: [...effects, { effectId, remainingDuration: duration, stacks: 1 }],
    applied: true,
  };
}

// ── Status effect ticking (round boundary) ──

export interface TickResult {
  updatedEffects: ActiveStatusEffect[];
  hpDelta: number;
  mpDelta: number;
  expiredEffectIds: string[];
}

export function tickStatusEffects(
  effects: ActiveStatusEffect[],
  participantHp: { current: number; max: number },
  effectMap: Map<string, StatusEffectContent>,
): TickResult {
  let hpDelta = 0;
  let mpDelta = 0;
  const expiredEffectIds: string[] = [];
  const updatedEffects: ActiveStatusEffect[] = [];

  for (const effect of effects) {
    const content = effectMap.get(effect.effectId);
    if (content == null) {
      // Unknown effect, keep it
      updatedEffects.push(effect);
      continue;
    }

    // Special: charge/chant/focus have duration 999 and don't tick
    if (content.duration >= 999) {
      updatedEffects.push(effect);
      continue;
    }

    const newDuration = effect.remainingDuration - 1;

    // DOT / HOT tick
    if (content.damagePercent != null) {
      hpDelta -= Math.floor(participantHp.max * (content.damagePercent / 100));
    }
    if (content.healPercent != null) {
      hpDelta += Math.floor(participantHp.max * (content.healPercent / 100));
    }

    // Instant death on expiry
    if (content.id === "instant_death" && newDuration <= 0) {
      hpDelta = -participantHp.current; // kill
    }

    if (newDuration <= 0) {
      expiredEffectIds.push(effect.effectId);
    } else {
      updatedEffects.push({ ...effect, remainingDuration: newDuration });
    }
  }

  return { updatedEffects, hpDelta, mpDelta, expiredEffectIds };
}

// ── Consume charge/chant/focus after attack ──

export function consumeChargeChantFocus(
  effects: ActiveStatusEffect[],
  skillCategory: "physical" | "magic" | "heal" | "support" | "passive",
): { effects: ActiveStatusEffect[]; damageMultiplier: number; guaranteedCrit: boolean } {
  let damageMultiplier = 1;
  let guaranteedCrit = false;

  const hasCharge = effects.some((e) => e.effectId === "charge");
  const hasChant = effects.some((e) => e.effectId === "chant");
  const hasFocus = effects.some((e) => e.effectId === "focus");

  // Charge: consumed by physical skills
  if (hasCharge && skillCategory === "physical") {
    damageMultiplier *= 2;
  }
  // Chant: consumed by magic skills
  if (hasChant && skillCategory === "magic") {
    damageMultiplier *= 2;
  }
  // Focus: consumed by any offensive skill, guarantees crit
  if (hasFocus && (skillCategory === "physical" || skillCategory === "magic")) {
    guaranteedCrit = true;
  }

  const removeIds: string[] = [];
  if (hasCharge && skillCategory === "physical") removeIds.push("charge");
  if (hasChant && skillCategory === "magic") removeIds.push("chant");
  if (hasFocus && (skillCategory === "physical" || skillCategory === "magic")) removeIds.push("focus");

  if (removeIds.length === 0) {
    return { effects, damageMultiplier, guaranteedCrit };
  }

  const updatedEffects = effects.filter((e) => !removeIds.includes(e.effectId));
  return { effects: updatedEffects, damageMultiplier, guaranteedCrit };
}

// ── Ailment disability check ──

export function isDisabledByAilment(
  effects: ActiveStatusEffect[],
): boolean {
  return effects.some((e) => e.effectId === "sleep" || e.effectId === "freeze");
}

// ── Paralyze random check ──

export function isParalyzed(effects: ActiveStatusEffect[]): boolean {
  if (!effects.some((e) => e.effectId === "paralyze")) return false;
  // 50% chance to be disabled
  return Math.random() < 0.5;
}

// ── Consume shield effects from a participant ──

export function consumeShieldEffect(
  effects: ActiveStatusEffect[],
  shieldEffectId: string,
): ActiveStatusEffect[] {
  return effects.filter((e) => e.effectId !== shieldEffectId);
}
