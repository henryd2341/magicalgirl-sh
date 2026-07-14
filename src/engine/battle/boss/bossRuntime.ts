import {
  getBossProfile,
} from "@/engine/battle/boss/bossRegistry";
import type {
  BossBattleEvent,
  BossContext,
  BossEffect,
} from "@/engine/battle/boss/bossTypes";
import { appendBattleLogs, createMechanicLogDraft } from "@/engine/battle/battleLogger";
import type { BattleSnapshot } from "@/types/battle";

function cloneRuntime(snapshot: BattleSnapshot): NonNullable<BattleSnapshot["bossRuntime"]> {
  const runtime = snapshot.bossRuntime;
  if (runtime == null) {
    throw new Error("Boss runtime is required");
  }

  return {
    profileIds: { ...runtime.profileIds },
    phaseByActorId: { ...runtime.phaseByActorId },
    cooldowns: { ...runtime.cooldowns },
    queuedCounters: { ...runtime.queuedCounters },
    flags: { ...runtime.flags },
    counters: { ...runtime.counters },
    lists: Object.fromEntries(
      Object.entries(runtime.lists).map(([key, value]) => [key, [...value]]),
    ),
    mechanicState: structuredClone(runtime.mechanicState),
    decisionSteps: runtime.decisionSteps,
  };
}

export function createBossContext(
  snapshot: BattleSnapshot,
  actorId?: string,
): BossContext {
  if (snapshot.bossRuntime == null) {
    throw new Error("Boss runtime is required");
  }
  return {
    snapshot,
    runtime: snapshot.bossRuntime,
    ...(actorId == null ? {} : { actorId }),
  };
}

export function applyBossEffects(
  snapshot: BattleSnapshot,
  effects: BossEffect[],
): BattleSnapshot {
  if (snapshot.bossRuntime == null) {
    return snapshot;
  }

  let next: BattleSnapshot = {
    ...snapshot,
    bossRuntime: cloneRuntime(snapshot),
  };
  const phaseTransitions = new Set<string>();

  for (const effect of effects) {
    const runtime = next.bossRuntime!;
    switch (effect.type) {
      case "set_phase":
        if (phaseTransitions.has(effect.actorId)) {
          throw new Error(
            `Boss phase transition repeated for actor "${effect.actorId}" in one event`,
          );
        }
        phaseTransitions.add(effect.actorId);
        runtime.phaseByActorId[effect.actorId] = effect.phase;
        break;
      case "set_counter":
        runtime.counters[effect.key] = effect.value;
        break;
      case "increment_counter":
        runtime.counters[effect.key] =
          (runtime.counters[effect.key] ?? 0) + effect.amount;
        break;
      case "set_flag":
        runtime.flags[effect.key] = effect.value;
        break;
      case "enqueue_counter":
        runtime.queuedCounters[effect.actorId] = effect.skillId;
        break;
      case "set_cooldown":
        runtime.cooldowns[effect.key] = Math.max(0, effect.turns);
        break;
      case "set_list":
        runtime.lists[effect.key] = [...effect.values];
        break;
      case "append_mechanic_log":
        next = {
          ...next,
          battleLog: appendBattleLogs(next, [
            createMechanicLogDraft(
              next.turnCount ?? 1,
              effect.summary,
              effect.details ?? [],
            ),
          ]),
        };
        break;
    }
  }

  return next;
}

function decrementCooldowns(snapshot: BattleSnapshot): BattleSnapshot {
  if (snapshot.bossRuntime == null) {
    return snapshot;
  }
  const runtime = cloneRuntime(snapshot);
  for (const [key, turns] of Object.entries(runtime.cooldowns)) {
    runtime.cooldowns[key] = Math.max(0, turns - 1);
  }
  return { ...snapshot, bossRuntime: runtime };
}

export function applyBossBattleEvent(
  snapshot: BattleSnapshot,
  event: BossBattleEvent,
): BattleSnapshot {
  if (snapshot.bossRuntime == null) {
    return snapshot;
  }

  const prepared =
    event.type === "round_started" ? decrementCooldowns(snapshot) : snapshot;
  const profileIds = [...new Set(Object.values(prepared.bossRuntime!.profileIds))];
  const effects: BossEffect[] = [];

  for (const profileId of profileIds) {
    const profile = getBossProfile(profileId);
    effects.push(
      ...profile.reduceEvent(createBossContext(prepared), event),
    );
  }

  return applyBossEffects(prepared, effects);
}
