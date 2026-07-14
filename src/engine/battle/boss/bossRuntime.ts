import { createSummonedEnemyParticipant } from "@/engine/battle/battleSetup";
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
      case "set_mechanic_state":
        runtime.mechanicState[effect.key] = structuredClone(effect.value);
        break;
      case "set_affinities":
        next = {
          ...next,
          participants: next.participants.map((participant) =>
            participant.id === effect.actorId
              ? { ...participant, affinities: { ...effect.affinities } }
              : participant,
          ),
        };
        break;
      case "apply_status":
        next = {
          ...next,
          participants: next.participants.map((participant) =>
            participant.id === effect.actorId
              ? {
                  ...participant,
                  statusEffects: [
                    ...(participant.statusEffects ?? []).filter(
                      (status) => status.effectId !== effect.effectId,
                    ),
                    {
                      effectId: effect.effectId,
                      remainingDuration: effect.duration,
                      stacks: effect.stacks ?? 1,
                    },
                  ],
                }
              : participant,
          ),
        };
        break;
      case "summon_enemy": {
        const summoned = createSummonedEnemyParticipant(effect.enemyId, next.participants);
        next = { ...next, participants: [...next.participants, summoned] };
        runtime.profileIds[summoned.id] = effect.profileId;
        runtime.phaseByActorId[summoned.id] = effect.phase;
        runtime.queuedCounters[summoned.id] = null;
        break;
      }
      case "protect_target":
        runtime.mechanicState[`protection:${effect.targetId}`] = effect.protectorId;
        next = {
          ...next,
          participants: next.participants.map((participant) =>
            participant.id === effect.targetId
              ? {
                  ...participant,
                  statusEffects: [
                    ...(participant.statusEffects ?? []).filter((status) => status.effectId !== "defense_up"),
                    { effectId: "defense_up", remainingDuration: effect.duration, stacks: 1 },
                  ],
                }
              : participant,
          ),
        };
        break;
      case "adjust_hp":
        next = {
          ...next,
          participants: next.participants.map((participant) => {
            if (participant.id !== effect.actorId) return participant;
            const current = Math.max(0, Math.min(participant.hp.max, participant.hp.current + effect.amount));
            return { ...participant, hp: { ...participant.hp, current }, isDown: current === 0 };
          }),
        };
        break;
      case "revive_actor":
        next = {
          ...next,
          participants: next.participants.map((participant) =>
            participant.id === effect.actorId
              ? {
                  ...participant,
                  hp: { ...participant.hp, current: Math.max(1, Math.floor(participant.hp.max * effect.hpPercent / 100)) },
                  isDown: false,
                  canAct: true,
                }
              : participant,
          ),
        };
        break;
      case "increment_ailment_resistance":
        next = {
          ...next,
          participants: next.participants.map((participant) =>
            participant.id === effect.actorId
              ? {
                  ...participant,
                  bossAilmentSuccesses: {
                    ...(participant.bossAilmentSuccesses ?? {}),
                    [effect.effectId]: (participant.bossAilmentSuccesses?.[effect.effectId] ?? 0) + 1,
                  },
                }
              : participant,
          ),
        };
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
