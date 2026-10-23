import { createSummonedEnemyParticipant } from "@/engine/battle/battleSetup";
import { cloneBossStateValue } from "@/engine/battle/boss/bossStateClone";
import {
  getBossProfile,
} from "@/engine/battle/boss/bossRegistry";
import type {
  BossBattleEvent,
  BossContext,
  BossEffect,
  BossPublicSignal,
} from "@/engine/battle/boss/bossTypes";
import { appendBattleLogs, createMechanicLogDraft } from "@/engine/battle/battleLogger";
import type { BattleSnapshot } from "@/types/battle";
import { getStatusEffectMap } from "@/content/contentRegistry";
import {
  applyStatusEffect,
  protectStatusPayloads,
  refreshStatusEligibility,
  settleHpChange,
  statusPhaseIndex,
} from "@/engine/battle/statusEffectEngine";

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
    mechanicState: cloneBossStateValue(runtime.mechanicState),
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
  const ailmentProtectedActors = new Set<string>();

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
        runtime.mechanicState[effect.key] = cloneBossStateValue(effect.value);
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
            participants: next.participants.map((participant) => {
              if (participant.id !== effect.actorId) return participant;
              const effectMap = getStatusEffectMap();
              const protection = protectStatusPayloads(ailmentProtectedActors.has(participant.id)
                ? { ...participant, statusEffects: [...(participant.statusEffects ?? []),
                    { effectId: "ailment_null", remainingDuration: 1, stacks: 1 }] }
                : participant, [{
                effectId: effect.effectId, duration: effect.duration,
              }], effectMap, true);
              if (protection.blocked) {
                ailmentProtectedActors.add(participant.id);
                return {
                  ...participant,
                  statusEffects: participant.statusEffects?.filter((status) => status.effectId !== "ailment_null"),
                };
              }
              if (protection.payloads.length === 0) return participant;
              if (effect.effectId === "instant_death") return {
                ...participant, ...settleHpChange(participant, -participant.hp.current),
              };
              const definition = effectMap.get(effect.effectId);
              const phase = statusPhaseIndex(next);
              const statusEffects = definition == null
                ? [...(participant.statusEffects ?? []).filter((status) => status.effectId !== effect.effectId),
                    { effectId: effect.effectId, remainingDuration: effect.duration, stacks: effect.stacks ?? 1 }]
                : applyStatusEffect(
                    participant.statusEffects ?? [],
                    effect.effectId, effect.duration, definition, phase,
                  ).effects
                    .map((status) => status.effectId === effect.effectId
                      ? { ...status, remainingDuration: effect.duration, stacks: effect.stacks ?? 1 } : status);
              return refreshStatusEligibility(
                { ...participant, statusEffects }, phase, next.phase === "ENEMY_TURN" ? "enemy" : "player",
              );
            }),
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
  return reduceBossBattleEvent(snapshot, event, new Set<string>());
}

function reduceBossBattleEvent(
  snapshot: BattleSnapshot,
  event: BossBattleEvent,
  emittedDown: Set<string>,
): BattleSnapshot {
  if (snapshot.bossRuntime == null) {
    return snapshot;
  }
  if (event.type === "participant_down") emittedDown.add(event.participantId);

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

  let next = applyBossEffects(prepared, effects);
  const newlyDown = next.participants.filter((participant) => participant.isDown &&
    prepared.participants.some((before) => before.id === participant.id && !before.isDown));
  for (const participant of newlyDown) {
    if (emittedDown.has(participant.id)) continue;
    emittedDown.add(participant.id);
    next = reduceBossBattleEvent(next, {
      type: "participant_down", participantId: participant.id,
    }, emittedDown);
  }
  return next;
}


function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function deriveBossSignals(snapshot: BattleSnapshot): BossPublicSignal[] {
  const runtime = snapshot.bossRuntime;
  if (runtime == null) return [];
  const signals: BossPublicSignal[] = [];
  const phaseEntries = Object.entries(runtime.phaseByActorId);
  const phases = [...new Set(phaseEntries.map(([, phase]) => phase))];
  if (phases.length > 0) {
    signals.push({ id: "boss:phase", label: "当前阶段", value: phases.join(" / "), urgency: "normal" });
  }

  for (const [actorId, skillId] of Object.entries(runtime.queuedCounters)) {
    if (skillId == null) continue;
    const actor = snapshot.participants.find(participant => participant.id === actorId);
    signals.push({
      id: `boss:counter:${actorId}`,
      label: `${actor?.displayName ?? "Boss"}反制`,
      value: `技能 ${skillId} 已就绪`,
      urgency: "warning",
    });
  }

  const crystalCharge = runtime.counters["frost:crystalCharge"];
  if (crystalCharge != null && crystalCharge > 0) {
    signals.push({ id: "frost:charge", label: "寒霜棱晶蓄能", value: `${crystalCharge} / 2`, urgency: crystalCharge >= 2 ? "danger" : "warning" });
  }
  const seedCount = runtime.counters["crown:seedCount"];
  if (seedCount != null && seedCount > 0) {
    signals.push({ id: "crown:seeds", label: "腐种", value: `${seedCount} 个待收割`, urgency: "warning" });
  }
  const finalRounds = runtime.counters["doll:finalRounds"];
  if (finalRounds != null) {
    signals.push({ id: "doll:final", label: "坍缩倒计时", value: `${finalRounds} 回合`, urgency: "danger" });
  }
  const integrity = runtime.mechanicState["doll:integrity"];
  if (isRecord(integrity)) {
    signals.push({ id: "doll:integrity", label: "部件完整度", value: `刃肢 ${integrity.blade ?? "-"} · 咒眼 ${integrity.eye ?? "-"} · 缝合核 ${integrity.core ?? "-"}`, urgency: "normal" });
  }
  const archives = runtime.mechanicState["echo:archives"];
  if (Array.isArray(archives) && archives.length > 0 && isRecord(archives.at(-1))) {
    const latest = archives.at(-1)!;
    signals.push({ id: "echo:archive", label: "当前回声档案", value: `属性 ${latest.element ?? "无"} · 行动 ${latest.actionCategory ?? "无"} · 剩余 ${latest.remainingRounds ?? 0} 回合`, urgency: "warning" });
  }
  const pair = runtime.mechanicState["hidden:pair"];
  if (isRecord(pair)) {
    const damage = typeof pair.bigWindowDamage === "number" ? pair.bigWindowDamage : 0;
    const start = typeof pair.bigWindowStartRound === "number" ? pair.bigWindowStartRound : 1;
    const elapsed = Math.max(0, (snapshot.turnCount ?? 1) - start + 1);
    signals.push({ id: "hidden:big-dps", label: "大 DPS 检定", value: `${damage} / 2000 · 剩余 ${Math.max(0, 8 - elapsed)} 回合`, urgency: elapsed >= 6 ? "danger" : "warning" });
    if (isRecord(pair.smallWindow)) {
      signals.push({ id: "hidden:small-dps", label: "小 DPS 检定", value: `${pair.smallWindow.damage ?? 0} / 800 · 剩余 ${pair.smallWindow.remainingPlayerRounds ?? 0} 回合`, urgency: "danger" });
    }
    if (typeof pair.reviveTargetActorId === "string") {
      signals.push({ id: "hidden:revive", label: "复苏脉动", value: "下一实际行动", urgency: "danger" });
    }
    if (typeof pair.finalPlayerRoundsRemaining === "number") {
      signals.push({ id: "hidden:final", label: "终景倒计时", value: `${pair.finalPlayerRoundsRemaining} 回合`, urgency: "danger" });
    }
  }
  return signals;
}
