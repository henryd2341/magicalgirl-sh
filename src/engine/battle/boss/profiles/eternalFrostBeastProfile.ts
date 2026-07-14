import type { BossProfile } from "@/engine/battle/boss/bossRegistry";
import type { BossActionIntent, BossContext, BossEffect, BossUtilityCandidate } from "@/engine/battle/boss/bossTypes";

const PROFILE_ID = "eternal-frost-beast";

function participantByEnemyId(context: BossContext, enemyId: string) {
  return context.snapshot.participants.find((participant) => participant.enemyId === enemyId && !participant.isDown);
}

function playerIds(context: BossContext): string[] {
  return context.snapshot.participants.filter((participant) => participant.side === "player" && participant.isActive && !participant.isDown).map((participant) => participant.id);
}

function skill(context: BossContext, actorId: string, skillId: string, all = false): BossActionIntent {
  const targets = playerIds(context);
  return { type: "use_skill", actorId, skillId, targetIds: all ? targets : targets.slice(0, 1), reason: "永冻编队决策" };
}

function firstKillType(context: BossContext): string | null {
  return context.runtime.lists["frost:firstKillType"]?.[0] ?? null;
}

export const eternalFrostBeastProfile: BossProfile = {
  id: PROFILE_ID,
  actorEnemyIds: ["101", "102", "103"],
  initialPhase: "fortified",
  skillIds: Array.from({ length: 10 }, (_, index) => String(264 + index)),
  reduceEvent(context, event): BossEffect[] {
    if (event.type === "round_started") {
      const effects: BossEffect[] = [];
      const crystal = participantByEnemyId(context, "102");
      const guard = participantByEnemyId(context, "103");
      const beast = participantByEnemyId(context, "101");
      const addCount = Number(crystal != null) + Number(guard != null);
      effects.push({ type: "set_counter", key: "frost:addReduction", value: addCount });
      if (beast != null && addCount > 0) effects.push({ type: "apply_status", actorId: beast.id, effectId: "defense_up", duration: 1, stacks: addCount });
      if (crystal != null) {
        const charge = (context.runtime.counters["frost:crystalCharge"] ?? 0) + 1;
        effects.push({ type: "set_counter", key: "frost:crystalCharge", value: charge });
        if (charge >= 2) {
          effects.push({ type: "enqueue_counter", actorId: crystal.id, skillId: "270" });
          effects.push({ type: "append_mechanic_log", summary: "寒霜棱晶蓄能完成", details: ["即将施放极寒棱爆"] });
        } else {
          effects.push({ type: "append_mechanic_log", summary: "寒霜棱晶开始蓄能", details: ["1 / 2"] });
        }
      }
      if (guard != null) {
        const target = context.snapshot.participants.filter((participant) => participant.side === "enemy" && participant.id !== guard.id && !participant.isDown).sort((a, b) => a.hp.current / a.hp.max - b.hp.current / b.hp.max)[0];
        if (target != null) effects.push({ type: "protect_target", protectorId: guard.id, targetId: target.id, duration: 1 });
      }
      if (event.turnCount >= 8 && beast != null && !context.runtime.flags["frost:enraged"]) {
        effects.push({ type: "set_flag", key: "frost:enraged", value: true });
        effects.push({ type: "apply_status", actorId: beast.id, effectId: "attack_up", duration: 99 });
        effects.push({ type: "append_mechanic_log", summary: "永冻巨兽陷入永冻狂怒" });
      }
      return effects;
    }
    if (event.type === "damage_applied") {
      const target = context.snapshot.participants.find((participant) => participant.id === event.targetId);
      if (target?.enemyId === "101" && target.hp.current / target.hp.max <= 0.6 && context.runtime.phaseByActorId[target.id] === "fortified") {
        return [
          { type: "set_phase", actorId: target.id, phase: "unbound" },
          { type: "append_mechanic_log", summary: "永冻巨兽挣脱冰层", details: ["随从获得强化，保护目标改变"] },
        ];
      }
    }
    if (event.type === "participant_down") {
      const down = context.snapshot.participants.find((participant) => participant.id === event.participantId);
      if ((down?.enemyId === "102" || down?.enemyId === "103") && firstKillType(context) == null) {
        return [
          { type: "set_list", key: "frost:firstKillType", values: [down.enemyId] },
          { type: "append_mechanic_log", summary: `${down.displayName}首先被击破`, details: ["巨兽会记住这一随从类型"] },
        ];
      }
    }
    if (event.type === "action_resolved") {
      if (event.actionId === "270") return [
        { type: "set_counter", key: "frost:crystalCharge", value: 0 },
        { type: "enqueue_counter", actorId: event.actorId, skillId: null },
      ];
      if (event.actionId === "268" && !context.runtime.flags["frost:resummoned"]) {
        const enemyId = firstKillType(context);
        if (enemyId != null) return [
          { type: "summon_enemy", enemyId, profileId: PROFILE_ID, phase: "add" },
          { type: "set_flag", key: "frost:resummoned", value: true },
          { type: "append_mechanic_log", summary: "冰层重新凝结", details: [`召回 ${enemyId === "102" ? "寒霜棱晶" : "冻甲守兽"}`] },
        ];
      }
    }
    return [];
  },
  selectPriorityIntent(context, priority) {
    if (priority !== "revival" || context.runtime.flags["frost:resummoned"] || firstKillType(context) == null) return null;
    const addsAlive = context.snapshot.participants.some((participant) => (participant.enemyId === "102" || participant.enemyId === "103") && !participant.isDown);
    const beast = participantByEnemyId(context, "101");
    return !addsAlive && beast != null ? { type: "use_skill", actorId: beast.id, skillId: "268", targetIds: [beast.id], reason: "一次性再结晶" } : null;
  },
  selectForcedIntent() { return null; },
  enumerateUtilityCandidates(context): BossUtilityCandidate[] {
    const actor = context.snapshot.participants.find((participant) => participant.id === context.actorId);
    if (actor == null) return [];
    const ids = actor.enemyId === "101" ? ["264", "265", "266"] : actor.enemyId === "102" ? ["269"] : ["271", "272"];
    return ids.map((id, order) => ({ intent: skill(context, actor.id, id, id === "265" || id === "266"), available: playerIds(context).length > 0, score: 8 - order, noise: 0.15, stableOrder: order }));
  },
};
