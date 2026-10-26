import { BATTLE_ELEMENTS, type BattleActionOutcome, type BattleActionTrace } from "@/types/battle";

export type EffectFamily = "slash" | "magic" | "area" | "heal" | "support" | "neutral";
export interface BattleEffectBeat {
  outcomes: BattleActionOutcome[];
}
export function effectFamily(action: BattleActionTrace): EffectFamily {
  if (action.category === "heal") return "heal";
  if (action.category === "support" || action.actionId === "guard") return "support";
  if (action.targetType === "all_enemies") return "area";
  if (action.category === "physical" || action.actionId === "attack") return "slash";
  if (action.category === "magic") return "magic";
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
  if (effectFamily(action) === "heal") return "#56efbd";
  if (effectFamily(action) === "support") return "#e6c767";
  switch (action.element) {
    case BATTLE_ELEMENTS.Fire: return "#ff936f";
    case BATTLE_ELEMENTS.Ice: return "#85e7ff";
    case BATTLE_ELEMENTS.Electric: return "#ffe388";
    case BATTLE_ELEMENTS.Wind: return "#83edb2";
    case BATTLE_ELEMENTS.Dark: return "#c09aff";
    case BATTLE_ELEMENTS.Light: return "#ffe7ae";
    default: return "#ed9bdf";
  }
}
