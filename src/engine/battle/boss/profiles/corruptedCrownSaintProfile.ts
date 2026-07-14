import { getStatusEffectMap } from "@/content/contentRegistry";
import type { BossProfile } from "@/engine/battle/boss/bossRegistry";
import type { BossActionIntent, BossContext, BossEffect, BossUtilityCandidate } from "@/engine/battle/boss/bossTypes";

function saint(context: BossContext) { return context.snapshot.participants.find((participant) => participant.enemyId === "104"); }
function players(context: BossContext) { return context.snapshot.participants.filter((participant) => participant.side === "player" && participant.isActive && !participant.isDown); }
function existingSeedCount(context: BossContext): number {
  const statusMap = getStatusEffectMap();
  return players(context).reduce((total, participant) => total + (participant.statusEffects ?? []).filter((status) => {
    const type = statusMap.get(status.effectId)?.type;
    return type === "ailment" || type === "dot";
  }).length, 0);
}
function debuffCount(context: BossContext): number {
  const statusMap = getStatusEffectMap();
  return (saint(context)?.statusEffects ?? []).filter((status) => statusMap.get(status.effectId)?.type === "debuff").length;
}
function intent(context: BossContext, skillId: string): BossActionIntent | null {
  const actor = saint(context); if (actor == null) return null;
  const targetIds = players(context).map((player) => player.id);
  return { type: "use_skill", actorId: actor.id, skillId, targetIds, reason: "腐种循环" };
}
export const corruptedCrownSaintProfile: BossProfile = {
  id: "corrupted-crown-saint", actorEnemyIds: ["104"], initialPhase: "sow",
  skillIds: Array.from({ length: 10 }, (_, index) => String(274 + index)),
  reduceEvent(context, event): BossEffect[] {
    const actor = saint(context);
    if (event.type === "before_enemy_action" && actor?.id === event.actorId) return [{ type: "set_counter", key: "crown:seedCount", value: existingSeedCount(context) }];
    if (event.type === "round_started") {
      const effects: BossEffect[] = [];
      if (event.turnCount >= 10 && !context.runtime.flags["crown:earlyBloom"]) effects.push(
        { type: "set_flag", key: "crown:earlyBloom", value: true },
        { type: "append_mechanic_log", summary: "花期缩短", details: ["播种后将直接收割"] },
      );
      if (actor != null && context.runtime.flags["crown:backlash"]) effects.push(
        { type: "adjust_hp", actorId: actor.id, amount: -Math.ceil(actor.hp.max * 0.05) },
        { type: "set_flag", key: "crown:backlash", value: false },
        { type: "append_mechanic_log", summary: "病花遭到燃烧或毒素反噬" },
      );
      return effects;
    }
    if (event.type === "damage_applied" && actor?.id === event.targetId) {
      const ratio = actor.hp.current / actor.hp.max; const effects: BossEffect[] = [];
      if (ratio <= 0.65 && !context.runtime.flags["crown:expandedSow"]) effects.push({ type: "set_flag", key: "crown:expandedSow", value: true }, { type: "append_mechanic_log", summary: "病花盛放", details: ["播种目标增加"] });
      if (ratio <= 0.35 && !context.runtime.flags["crown:reverseCrown"]) effects.push({ type: "set_flag", key: "crown:reverseCrown", value: true }, { type: "append_mechanic_log", summary: "逆植王冠苏醒", details: ["周期性转化自身减益"] });
      return effects;
    }
    if (event.type === "status_applied" && actor?.id === event.targetId && (event.effectId === "burn" || event.effectId === "poison")) return [{ type: "set_flag", key: "crown:backlash", value: true }];
    if (event.type === "action_resolved" && actor?.id === event.actorId) {
      if (event.actionId === "274") return [{ type: "set_phase", actorId: actor.id, phase: context.runtime.flags["crown:earlyBloom"] ? "harvest" : "grow" }];
      if (event.actionId === "278") return [{ type: "set_phase", actorId: actor.id, phase: "harvest" }];
      if (event.actionId === "279" || event.actionId === "280") {
        const effects: BossEffect[] = [{ type: "set_phase", actorId: actor.id, phase: "sow" }];
        if (event.actionId === "279") effects.push({ type: "adjust_hp", actorId: actor.id, amount: Math.ceil(actor.hp.max * Math.min(0.2, existingSeedCount(context) * 0.02)) });
        return effects;
      }
    }
    return [];
  },
  selectForcedIntent(context) {
    const actor = saint(context); if (actor == null) return null;
    const phase = context.runtime.phaseByActorId[actor.id];
    return intent(context, phase === "sow" ? "274" : phase === "grow" ? "278" : debuffCount(context) >= 3 ? "280" : "279");
  },
  enumerateUtilityCandidates(context): BossUtilityCandidate[] {
    return ["275", "276", "277"].map((skillId, stableOrder) => ({ intent: intent(context, skillId)!, available: players(context).length > 0, score: 5, noise: 0.1, stableOrder }));
  },
};
