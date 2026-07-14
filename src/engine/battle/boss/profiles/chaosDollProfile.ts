import { getStatusEffectMap } from "@/content/contentRegistry";
import type { BossProfile, BossIntentPriority } from "@/engine/battle/boss/bossRegistry";
import type { BossActionIntent, BossContext, BossEffect, BossUtilityCandidate } from "@/engine/battle/boss/bossTypes";
interface Integrity { blade: number; eye: number; core: number }
const INITIAL: Integrity = { blade: 1000, eye: 1000, core: 1000 };
const ORDER: Array<keyof Integrity> = ["blade", "eye", "core"];
function doll(context: BossContext) { return context.snapshot.participants.find((p) => p.enemyId === "106"); }
function current(context: BossContext): Integrity { return { ...INITIAL, ...((context.runtime.mechanicState["doll:integrity"] as Partial<Integrity> | undefined) ?? {}) }; }
function lowest(value: Integrity): keyof Integrity { return ORDER.reduce((best, part) => value[part] < value[best] ? part : best, "blade"); }
function players(context: BossContext) { return context.snapshot.participants.filter((p) => p.side === "player" && p.isActive && !p.isDown).map((p) => p.id); }
function intent(context: BossContext, skillId: string): BossActionIntent | null { const actor = doll(context); return actor == null ? null : { type: "use_skill", actorId: actor.id, skillId, targetIds: players(context), reason: "拼凑体阶段动作" }; }
export const chaosDollProfile: BossProfile = {
  id: "chaos-doll", actorEnemyIds: ["106"], initialPhase: "integrity", skillIds: Array.from({ length: 12 }, (_, i) => String(294 + i)),
  reduceEvent(context, event): BossEffect[] {
    const actor = doll(context); if (actor == null) return [];
    if (event.type === "round_started") {
      const effects: BossEffect[] = [];
      if (context.runtime.mechanicState["doll:integrity"] == null) effects.push({ type: "set_mechanic_state", key: "doll:integrity", value: INITIAL }, { type: "append_mechanic_log", summary: "拼接审视", details: ["刃肢 1000", "咒眼 1000", "缝合核 1000"] });
      if (context.runtime.phaseByActorId[actor.id] === "collapse") {
        const remaining = Math.max(0, (context.runtime.counters["doll:finalRounds"] ?? 4) - 1);
        effects.push({ type: "set_counter", key: "doll:finalRounds", value: remaining }, { type: "apply_status", actorId: actor.id, effectId: "defense_down", duration: 99, stacks: 1 }, { type: "append_mechanic_log", summary: `坍缩倒计时 ${remaining}`, details: ["解体脉冲威力上升"] });
      }
      return effects;
    }
    if (event.type === "damage_applied" && event.targetId === actor.id) {
      const integrity = current(context); const amount = Math.max(1, Math.ceil(event.amount / actor.hp.max * 1000));
      if (event.actionCategory === "physical") integrity.blade = Math.max(0, integrity.blade - amount);
      if (event.actionCategory === "magic") integrity.eye = Math.max(0, integrity.eye - amount);
      const effects: BossEffect[] = [{ type: "set_mechanic_state", key: "doll:integrity", value: integrity }];
      const ratio = actor.hp.current / actor.hp.max; const phase = context.runtime.phaseByActorId[actor.id];
      if (ratio <= 0.35 && phase === "recombined") effects.push({ type: "set_phase", actorId: actor.id, phase: "collapse" }, { type: "set_counter", key: "doll:finalRounds", value: 4 }, { type: "append_mechanic_log", summary: "坍缩序曲", details: ["四回合后混沌归零"] });
      else if (ratio <= 0.7 && phase === "integrity") { const broken = lowest(integrity); effects.push({ type: "set_phase", actorId: actor.id, phase: "recombined" }, { type: "set_mechanic_state", key: "doll:brokenPart", value: broken }, { type: "append_mechanic_log", summary: "部件崩坏", details: [`${broken} 永久崩坏`] }); }
      else effects.push({ type: "append_mechanic_log", summary: "部件完整度变化", details: [`刃肢 ${integrity.blade}`, `咒眼 ${integrity.eye}`, `缝合核 ${integrity.core}`] });
      return effects;
    }
    if (event.type === "status_applied" && event.targetId === actor.id && getStatusEffectMap().get(event.effectId)?.type === "debuff") {
      const integrity = current(context); integrity.core = Math.max(0, integrity.core - 200); return [{ type: "set_mechanic_state", key: "doll:integrity", value: integrity }, { type: "append_mechanic_log", summary: "缝合核受损", details: [`缝合核 ${integrity.core}`] }];
    }
    return [];
  },
  selectPriorityIntent(context, priority: BossIntentPriority) { return priority === "hard_defeat" && context.runtime.phaseByActorId[doll(context)?.id ?? ""] === "collapse" && (context.runtime.counters["doll:finalRounds"] ?? 1) <= 0 ? { type: "force_defeat", skillId: "305", reason: "混沌归零倒计时结束" } : null; },
  selectForcedIntent(context) {
    const actor = doll(context); if (actor == null) return null; const phase = context.runtime.phaseByActorId[actor.id];
    if (phase === "collapse") return intent(context, "304");
    if (phase === "recombined") { const broken = context.runtime.mechanicState["doll:brokenPart"]; return intent(context, broken === "blade" ? "301" : broken === "eye" ? "302" : "300"); }
    return null;
  },
  enumerateUtilityCandidates(context): BossUtilityCandidate[] { return ["295", "296", "297"].map((skillId, stableOrder) => ({ intent: intent(context, skillId)!, available: players(context).length > 0, score: 7 - stableOrder, noise: 0.15, stableOrder })); },
};
