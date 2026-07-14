import {
  BOSS_INTENT_PRIORITIES,
  getBossProfile,
} from "@/engine/battle/boss/bossRegistry";
import { createBossContext } from "@/engine/battle/boss/bossRuntime";
import { selectBossUtilityCandidate } from "@/engine/battle/boss/bossUtility";
import type { BossActionIntent } from "@/engine/battle/boss/bossTypes";
import type { BattleSnapshot } from "@/types/battle";

export const MAX_BOSS_DECISION_STEPS = 32;

function queuedCounterIntent(
  snapshot: BattleSnapshot,
  actorId: string,
): BossActionIntent | null {
  const skillId = snapshot.bossRuntime?.queuedCounters[actorId];
  if (skillId == null) {
    return null;
  }

  const targetIds = snapshot.participants
    .filter(
      (participant) =>
        participant.side === "player" &&
        participant.isActive &&
        !participant.isDown,
    )
    .map((participant) => participant.id);

  return {
    type: "use_skill",
    actorId,
    skillId,
    targetIds: targetIds.slice(0, 1),
    reason: "queued counter",
  };
}

export function selectBossActionIntent(
  snapshot: BattleSnapshot,
  actorId: string,
  random: () => number,
): BossActionIntent | null {
  const profileId = snapshot.bossRuntime?.profileIds[actorId];
  if (profileId == null) {
    return null;
  }

  const profile = getBossProfile(profileId);
  const context = createBossContext(snapshot, actorId);
  let decisionSteps = 0;

  for (const priority of BOSS_INTENT_PRIORITIES) {
    decisionSteps += 1;
    if (decisionSteps > MAX_BOSS_DECISION_STEPS) {
      return { type: "pass", actorId, reason: "decision step limit" };
    }

    if (priority === "dps") {
      const counter = queuedCounterIntent(snapshot, actorId);
      if (counter != null) {
        return counter;
      }
    }

    const priorityIntent = profile.selectPriorityIntent?.(context, priority);
    if (priorityIntent != null) {
      return priorityIntent;
    }
  }

  decisionSteps += 1;
  if (decisionSteps > MAX_BOSS_DECISION_STEPS) {
    return { type: "pass", actorId, reason: "decision step limit" };
  }
  const forced = profile.selectForcedIntent(context);
  if (forced != null) {
    return forced;
  }

  decisionSteps += 1;
  if (decisionSteps > MAX_BOSS_DECISION_STEPS) {
    return { type: "pass", actorId, reason: "decision step limit" };
  }
  return (
    selectBossUtilityCandidate(
      profile.enumerateUtilityCandidates(context),
      random,
      snapshot.bossRuntime?.cooldowns ?? {},
    )?.intent ?? null
  );
}
