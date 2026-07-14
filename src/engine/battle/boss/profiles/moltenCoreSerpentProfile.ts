import type { BossProfile } from "@/engine/battle/boss/bossRegistry";
import type { BossActionIntent, BossContext, BossEffect, BossUtilityCandidate } from "@/engine/battle/boss/bossTypes";
import { BATTLE_ELEMENTS } from "@/types/battle";

const MOLTEN_AFFINITIES = {
  weak: BATTLE_ELEMENTS.Ice,
  resist: BATTLE_ELEMENTS.Fire,
  nullify: 0,
  reflect: 0,
  absorb: 0,
};

const STEAM_AFFINITIES = {
  weak: BATTLE_ELEMENTS.Electric,
  resist: 0,
  nullify: BATTLE_ELEMENTS.Ice,
  reflect: 0,
  absorb: BATTLE_ELEMENTS.Fire,
};

function livingPlayerIds(context: BossContext): string[] {
  return context.snapshot.participants
    .filter((participant) => participant.side === "player" && participant.isActive && !participant.isDown)
    .map((participant) => participant.id);
}

function actorId(context: BossContext): string | null {
  return context.actorId ?? Object.keys(context.runtime.profileIds).find(
    (id) => context.runtime.profileIds[id] === "molten-core-serpent",
  ) ?? null;
}

function skillIntent(context: BossContext, skillId: string, allTargets = false): BossActionIntent | null {
  const bossId = actorId(context);
  if (bossId == null) return null;
  const targets = livingPlayerIds(context);
  return {
    type: "use_skill",
    actorId: bossId,
    skillId,
    targetIds: allTargets ? targets : targets.slice(0, 1),
    reason: context.runtime.phaseByActorId[bossId] === "steam" ? "蒸汽形态效用" : "熔核形态效用",
  };
}

function utility(context: BossContext, skillId: string, score: number, order: number, allTargets = false): BossUtilityCandidate {
  return {
    intent: skillIntent(context, skillId, allTargets)!,
    available: livingPlayerIds(context).length > 0,
    score,
    noise: 0.15,
    stableOrder: order,
  };
}

export const moltenCoreSerpentProfile: BossProfile = {
  id: "molten-core-serpent",
  actorEnemyIds: ["100"],
  initialPhase: "molten",
  skillIds: ["255", "256", "257", "258", "259", "260", "261", "262", "263"],
  reduceEvent(context, event): BossEffect[] {
    if (event.type === "damage_applied") {
      const phase = context.runtime.phaseByActorId[event.targetId];
      if (phase === "molten" && event.element === BATTLE_ELEMENTS.Ice) {
        return [
          { type: "set_phase", actorId: event.targetId, phase: "steam" },
          { type: "set_affinities", actorId: event.targetId, affinities: STEAM_AFFINITIES },
          { type: "append_mechanic_log", summary: "冰击破熔核，幻蛇进入蒸汽形态", details: ["弱雷、冰无效、火焰吸收"] },
        ];
      }
      if (phase === "steam" && event.element === BATTLE_ELEMENTS.Electric) {
        return [
          { type: "set_phase", actorId: event.targetId, phase: "molten" },
          { type: "set_affinities", actorId: event.targetId, affinities: MOLTEN_AFFINITIES },
          { type: "apply_status", actorId: event.targetId, effectId: "defense_down", duration: 1 },
          { type: "append_mechanic_log", summary: "雷鸣崩解蒸汽，幻蛇回到熔核形态", details: ["防御下降 1 回合"] },
        ];
      }
    }
    if (event.type === "round_started" && event.turnCount > 0 && event.turnCount % 4 === 0) {
      return [
        { type: "set_flag", key: "molten:finisherTelegraphed", value: true },
        { type: "append_mechanic_log", summary: "熔核正在急剧膨胀", details: ["幻蛇下一次普通行动后将施放熔核爆裂"] },
      ];
    }
    if (event.type === "action_resolved" && event.actorId === actorId(context)) {
      if (event.actionId === "263") {
        return [
          { type: "set_flag", key: "molten:finisherTelegraphed", value: false },
          { type: "set_flag", key: "molten:finisherReady", value: false },
        ];
      }
      if (context.runtime.flags["molten:finisherTelegraphed"] && !context.runtime.flags["molten:finisherReady"]) {
        return [{ type: "set_flag", key: "molten:finisherReady", value: true }];
      }
    }
    return [];
  },
  selectForcedIntent(context) {
    if (!context.runtime.flags["molten:finisherReady"]) return null;
    return skillIntent(context, "263", true);
  },
  enumerateUtilityCandidates(context) {
    const bossId = actorId(context);
    if (bossId == null) return [];
    return context.runtime.phaseByActorId[bossId] === "steam"
      ? [utility(context, "260", 8, 0, true), utility(context, "261", 5, 1)]
      : [utility(context, "256", 8, 0, true), utility(context, "257", 7, 1), utility(context, "258", 5, 2, true)];
  },
};
