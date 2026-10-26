import { BATTLE_ELEMENTS, type BattleActionOutcome, type BattleActionTrace } from "@/types/battle";

export type EffectFamily = "slash" | "magic" | "area" | "heal" | "support" | "neutral";
export interface BattleEffectBeat {
  outcomes: BattleActionOutcome[];
}
export const ELEMENT_PROFILES = {
  [BATTLE_ELEMENTS.Physical]: { texture: "slash", color: "#ed9bdf" },
  [BATTLE_ELEMENTS.Gun]: { texture: "projectile", color: "#e5ba9a" },
  [BATTLE_ELEMENTS.Fire]: { texture: "fire", color: "#ff936f" },
  [BATTLE_ELEMENTS.Ice]: { texture: "icewater", color: "#85e7ff" },
  [BATTLE_ELEMENTS.Electric]: { texture: "bolt", color: "#ffe388" },
  [BATTLE_ELEMENTS.Wind]: { texture: "wind", color: "#83edb2" },
  [BATTLE_ELEMENTS.Earth]: { texture: "earth", color: "#d5ac7d" },
  [BATTLE_ELEMENTS.Light]: { texture: "star", color: "#c28a19" },
  [BATTLE_ELEMENTS.Dark]: { texture: "dark", color: "#c09aff" },
  [BATTLE_ELEMENTS.Almighty]: { texture: "almighty", color: "#e0bfff" },
  [BATTLE_ELEMENTS.Heal]: { texture: "heart", color: "#56efbd" },
  [BATTLE_ELEMENTS.Ailment]: { texture: "ailment", color: "#d6a2e9" },
} as const;
const protection = { texture: "magic", color: "#e6c767" } as const;
const neutral = { texture: null, color: "#ed9bdf" };
export type ElementProfile = typeof ELEMENT_PROFILES[keyof typeof ELEMENT_PROFILES] | typeof protection | typeof neutral;

export function effectProfile(action: BattleActionTrace, outcome?: BattleActionOutcome): ElementProfile {
  if (outcome?.type === "absorb" || (outcome?.hpDelta ?? 0) > 0) return ELEMENT_PROFILES[BATTLE_ELEMENTS.Heal];
  if (outcome?.type === "reflect" && (outcome.hpDelta ?? 0) >= 0) return protection;
  const element = action.element ?? (action.actionId === "attack" ? BATTLE_ELEMENTS.Physical : BATTLE_ELEMENTS.None);
  if (element !== BATTLE_ELEMENTS.None && element in ELEMENT_PROFILES) return ELEMENT_PROFILES[element as keyof typeof ELEMENT_PROFILES];
  if (action.category === "heal" || action.outcomes.some(o => (o.hpDelta ?? 0) > 0)) return ELEMENT_PROFILES[BATTLE_ELEMENTS.Heal];
  if (action.category === "support" || action.actionId === "guard" || outcome?.appliedStatusEffects?.length || action.outcomes.some(o => o.appliedStatusEffects?.length)) return protection;
  return neutral;
}
export function effectFamily(action: BattleActionTrace): EffectFamily {
  if (action.category === "heal") return "heal";
  if (action.category === "support" || action.actionId === "guard") return "support";
  if (action.targetType === "all_enemies") return "area";
  if (action.category === "physical" || action.actionId === "attack") return "slash";
  if (action.category === "magic") return "magic";
  if (action.element === BATTLE_ELEMENTS.Physical || action.element === BATTLE_ELEMENTS.Gun) return "slash";
  if (action.element === BATTLE_ELEMENTS.Heal) return "heal";
  if (action.element === BATTLE_ELEMENTS.Ailment) return "support";
  if (action.element != null && action.element in ELEMENT_PROFILES) return "magic";
  if (action.outcomes.some(o => (o.hpDelta ?? 0) > 0)) return "heal";
  if (action.outcomes.some(o => o.appliedStatusEffects?.length)) return "support";
  return "neutral";
}

export function impactBeats(action: BattleActionTrace): BattleEffectBeat[] {
  const counts = new Map<string, number>();
  const beats: BattleEffectBeat[] = [];
  for (const outcome of action.outcomes) {
    // Costs and status riders are not additional strikes. Reflect interception and
    // its receiving-actor record share one beat; no invented per-hit breakdown.
    if (outcome.type === "hit" && outcome.hpDelta == null) continue;
    const target = outcome.finalTargetId ?? outcome.primaryTargetId;
    if (!target) continue;
    const ordinal = counts.get(target) ?? 0;
    counts.set(target, ordinal + 1);
    (beats[ordinal] ??= { outcomes: [] }).outcomes.push(outcome);
  }
  if (!beats.length) beats.push({ outcomes: action.outcomes.filter(o =>
    o.appliedStatusEffects?.length || o.removedStatusEffectIds?.length || (o.mpDelta ?? 0) > 0) });
  return beats;
}

export function outcomeLabel(outcome: BattleActionOutcome): string {
  if (outcome.type === "miss") return "未命中";
  if (outcome.type === "block") return "无效";
  if (outcome.type === "reflect") return (outcome.hpDelta ?? 0) < 0 ? "反射受击" : "反射";
  if (outcome.type === "absorb") return "吸收";
  if (outcome.type === "status_no_effect") return "未生效";
  if ((outcome.hpDelta ?? 0) > 0) return "恢复";
  if ((outcome.hpDelta ?? 0) < 0) return outcome.tags.includes("critical") ? "会心" : outcome.tags.includes("weak") ? "弱点" : "命中";
  return "状态变化";
}

export function effectColor(action: BattleActionTrace): string {
  return effectProfile(action).color;
}
