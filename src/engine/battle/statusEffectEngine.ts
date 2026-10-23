import type {
  ActiveStatusEffect,
  BattleElement,
  BattleParticipant,
  BattleSnapshot,
  CombatantSide,
  AppliedStatusEffectPayload,
} from "@/types/battle";
import type { StatusEffectContent } from "@/types/content";
import { applyPassivesAtHook, collectPassives } from "@/engine/battle/passiveEffectEngine";
import { getEnemy } from "@/content/contentRegistry";

// ── Shield effect → element + kind mapping ──

type ShieldKind = "nullify" | "reflect" | "absorb";

interface ShieldEntry {
  elementMask: BattleElement;
  kind: ShieldKind;
}

function buildShieldMap(): Record<string, ShieldEntry> {
  const elements: Record<string, BattleElement> = {
    fire: 4, // Fire = 1 << 2
    ice: 8, // Ice = 1 << 3
    wind: 32, // Wind = 1 << 5
    electric: 16, // Electric = 1 << 4
    earth: 64, // Earth = 1 << 6
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
  map["physical_null"] = { elementMask: 1 | 2, kind: "nullify" };
  map["physical_reflect"] = { elementMask: 1 | 2, kind: "reflect" };
  map["physical_absorb"] = { elementMask: 1 | 2, kind: "absorb" };

  // Ailment shield (Ailment = 1 << 11)
  map["ailment_null"] = { elementMask: 1 << 11, kind: "nullify" };

  return map;
}

let _shieldEffectMap: Record<string, ShieldEntry> | null = null;
function getShieldEffectMap(): Record<string, ShieldEntry> {
  if (_shieldEffectMap == null) _shieldEffectMap = buildShieldMap();
  return _shieldEffectMap;
}

export function isShieldStatusEffect(effectId: string): boolean {
  return getShieldEffectMap()[effectId] != null;
}

const CONTROL_EFFECTS = new Set(["sleep", "freeze", "paralyze", "seal", "blind"]);

export function usesSidePhase(effectId: string): boolean {
  return CONTROL_EFFECTS.has(effectId) || effectId === "guard" || isShieldStatusEffect(effectId);
}

export function statusPhaseIndex(snapshot: Pick<BattleSnapshot, "turnCount" | "phase">): number {
  return ((snapshot.turnCount ?? 1) - 1) * 2 + (snapshot.phase === "ENEMY_TURN" ? 1 : 0);
}

export function isSkillSealed(participant: BattleParticipant, mpCost: number): boolean {
  return mpCost > 0 && (participant.statusEffects ?? []).some((effect) => effect.effectId === "seal");
}

export function hitRateMultiplier(
  effects: ActiveStatusEffect[],
  effectMap: Map<string, StatusEffectContent>,
): number {
  return [...new Set(effects.map((effect) => effect.effectId))]
    .reduce((multiplier, id) => multiplier * (effectMap.get(id)?.hitRateMultiplier ?? 1), 1);
}

export function refreshStatusEligibility(
  participant: BattleParticipant,
  phase: number,
  side: CombatantSide,
): BattleParticipant {
  const statusEffects = (participant.statusEffects ?? []).map((effect) => {
    let next = usesSidePhase(effect.effectId) && effect.firstTickPhase == null
      ? { ...effect, firstTickPhase: phase + 1 }
      : effect;
    if (effect.effectId === "paralyze" && participant.side === side && effect.paralysisPhase !== phase) {
      next = {
        ...next,
        paralysisPhase: phase,
        paralysisBlocked: effect.paralysisPhase == null && effect.paralysisBlocked != null
          ? effect.paralysisBlocked
          : Math.random() < 0.5,
      };
    }
    return next;
  });
  const disabled = isDisabledByAilment(statusEffects) ||
    statusEffects.some((effect) => effect.effectId === "paralyze" && effect.paralysisBlocked === true);
  const baseCanAct = participant.canActBeforeStatus ?? participant.canAct ?? true;
  const next = { ...participant, statusEffects, canAct: baseCanAct && !disabled && !participant.isDown };
  if (disabled || participant.isDown) {
    next.canActBeforeStatus = baseCanAct;
  } else {
    delete next.canActBeforeStatus;
  }
  return next;
}

export function expireSidePhase(
  participant: BattleParticipant,
  phase: number,
  side: CombatantSide,
): BattleParticipant {
  return {
    ...participant,
    statusEffects: (participant.statusEffects ?? []).flatMap((effect) => {
      if (!usesSidePhase(effect.effectId) || phase < (effect.firstTickPhase ?? phase + 1)) return [effect];
      const tickingSide = CONTROL_EFFECTS.has(effect.effectId)
        ? participant.side
        : participant.side === "player" ? "enemy" : "player";
      if (side !== tickingSide) return [effect];
      return effect.remainingDuration > 1
        ? [{ ...effect, remainingDuration: effect.remainingDuration - 1 }]
        : [];
    }),
  };
}

export function isStatusEffectImmune(
  participant: Pick<BattleParticipant, "statusImmunities" | "enemyId">,
  effectId: string,
): boolean {
  return resolveStatusImmunities(participant)?.includes(effectId) ?? false;
}

export function resolveStatusImmunities(
  participant: Pick<BattleParticipant, "statusImmunities" | "enemyId">,
): string[] | undefined {
  if (participant.statusImmunities != null) return participant.statusImmunities;
  if (participant.enemyId == null) return undefined;
  try {
    return getEnemy(participant.enemyId).statusImmunities;
  } catch {
    return undefined;
  }
}

export function protectStatusPayloads(
  participant: BattleParticipant,
  payloads: AppliedStatusEffectPayload[],
  effectMap: Map<string, StatusEffectContent>,
  hostile: boolean,
): { payloads: AppliedStatusEffectPayload[]; blocked: boolean } {
  const eligible = payloads.filter((payload) => !isStatusEffectImmune(participant, payload.effectId));
  const harmful = (payload: AppliedStatusEffectPayload) =>
    ["ailment", "dot"].includes(effectMap.get(payload.effectId)?.type ?? "");
  const blocked = hostile && eligible.some(harmful) &&
    (participant.statusEffects ?? []).some((effect) => effect.effectId === "ailment_null");
  return { payloads: blocked ? eligible.filter((payload) => !harmful(payload)) : eligible, blocked };
}

export function settleHpChange(
  participant: BattleParticipant,
  hpDelta: number,
): Pick<BattleParticipant, "hp" | "isDown" | "endureUsed"> {
  let hpAfterDamage = Math.max(0, Math.min(participant.hp.max, participant.hp.current + hpDelta));
  let endureUsed = participant.endureUsed ?? false;
  if (hpAfterDamage <= 0 && !participant.isDown && !endureUsed) {
    ({ hpAfterDamage, endureUsed } = applyPassivesAtHook(
      collectPassives(participant.passiveEffects), "on_death_check", { hpAfterDamage, endureUsed },
    ) as { hpAfterDamage: number; endureUsed: boolean });
  }
  return { hp: { ...participant.hp, current: hpAfterDamage }, isDown: hpAfterDamage <= 0, endureUsed };
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
    if (element !== 0 && entry != null && (entry.elementMask & element) === element) {
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

const STAT_MODIFIER_KEYS = [
  "attack",
  "defense",
  "agility",
  "intelligence",
] as const;
const MAX_STAT_STACKS = 2;

export function computeEffectiveStats(
  base: Pick<
    BattleParticipant,
    "attack" | "defense" | "agility" | "intelligence"
  >,
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
        // Multiplicative stacking: buffs use 1.25^n, debuffs use 0.8^n
        if (mod > 0) {
          result[key] = Math.round(result[key] * Math.pow(1.25, effect.stacks));
        } else if (mod < 0) {
          result[key] = Math.round(result[key] * Math.pow(0.8, effect.stacks));
        }
      }
    }
  }

  return result;
}

// ── Status effect application ──

export function applyStatusEffect(
  effects: ActiveStatusEffect[],
  effectId: string,
  duration: number,
  effectContent: StatusEffectContent,
  phase?: number,
): { effects: ActiveStatusEffect[]; applied: boolean } {
  const existing = effects.find((e) => e.effectId === effectId);

  if (existing != null) {
    if (effectContent.stackable) {
      const newStacks = Math.min(MAX_STAT_STACKS, existing.stacks + 1);
      const updated = effects.map((e) =>
        e.effectId === effectId
          ? {
              ...e,
              stacks: newStacks,
              remainingDuration: Math.max(e.remainingDuration, duration),
            }
          : e,
      );
      return { effects: updated, applied: newStacks > existing.stacks };
    } else {
      // Non-stackable: refresh duration
      const updated = effects.map((e) =>
        e.effectId === effectId
          ? {
              ...e,
              remainingDuration: Math.max(e.remainingDuration, duration),
              ...(phase != null && usesSidePhase(effectId) ? { firstTickPhase: phase + 1 } : {}),
            }
          : e,
      );
      return { effects: updated, applied: true };
    }
  }

  // New effect
  return {
    effects: [...effects, {
      effectId, remainingDuration: duration, stacks: 1,
      ...(phase != null && usesSidePhase(effectId) ? { firstTickPhase: phase + 1 } : {}),
    }],
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
  let instantDeath = false;
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
    if (content.duration >= 999 || usesSidePhase(effect.effectId)) {
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
      instantDeath = true;
    }

    if (newDuration <= 0) {
      expiredEffectIds.push(effect.effectId);
    } else {
      updatedEffects.push({ ...effect, remainingDuration: newDuration });
    }
  }

  return { updatedEffects, hpDelta: instantDeath ? -participantHp.current : hpDelta, mpDelta, expiredEffectIds };
}

// ── Consume charge/chant/focus after attack ──

export function consumeChargeChantFocus(
  effects: ActiveStatusEffect[],
  skillCategory: "physical" | "magic" | "heal" | "support" | "passive",
): {
  effects: ActiveStatusEffect[];
  damageMultiplier: number;
  guaranteedCrit: boolean;
} {
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
  // Focus follows the physical action category, not its element.
  if (hasFocus && skillCategory === "physical") {
    guaranteedCrit = true;
  }

  const removeIds: string[] = [];
  if (hasCharge && skillCategory === "physical") removeIds.push("charge");
  if (hasChant && skillCategory === "magic") removeIds.push("chant");
  if (hasFocus && skillCategory === "physical")
    removeIds.push("focus");

  if (removeIds.length === 0) {
    return { effects, damageMultiplier, guaranteedCrit };
  }

  const updatedEffects = effects.filter((e) => !removeIds.includes(e.effectId));
  return { effects: updatedEffects, damageMultiplier, guaranteedCrit };
}

// ── Ailment disability check ──

export function isDisabledByAilment(effects: ActiveStatusEffect[]): boolean {
  return effects.some((e) => e.effectId === "sleep" || e.effectId === "freeze");
}

// ── Consume shield effects from a participant ──

export function consumeShieldEffect(
  effects: ActiveStatusEffect[],
  shieldEffectId: string,
): ActiveStatusEffect[] {
  return effects.filter((e) => e.effectId !== shieldEffectId);
}
