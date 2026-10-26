import { resolveAffinityResult } from "@/engine/battle/battleAffinity";
import { getBattleActionDefinition } from "@/engine/battle/battleActionCatalog";
import {
  appendBattleLogs,
  createBattleResultLogEntry,
  createEnemySkillLogEntry,
  createPlayerActionLogEntry,
  createPlayerRoundStartLogEntry,
  createMechanicLogDraft,
} from "@/engine/battle/battleLogger";
import { aggregatePressTurnOutcome } from "@/engine/battle/battleOutcomeAggregation";
import {
  findNextEligibleActorId,
  normalizeCurrentActorId,
} from "@/engine/battle/battleTurnQueue";
import {
  createPressTurnStateForSide,
  getActingParticipantIdsForSide,
  isPressTurnExhausted,
  settlePassPressTurn,
  settlePressTurnResultByOutcome,
  settleSwapPressTurn,
} from "@/engine/battle/pressTurn";
import {
  calculateDamage,
  calculateGuardReduction,
  calculateHitChance,
  resolveAffinityMultiplier,
  resolveAffinityOutcomeType,
  rollCrit,
  rollHit,
} from "@/engine/battle/formulaEngine";
import {
  applyStatusEffect,
  checkShield,
  computeEffectiveStats,
  consumeChargeChantFocus,
  consumeShieldEffect,
  expireSidePhase,
  hitRateMultiplier,
  isSkillSealed,
  isDisabledByAilment,
  refreshStatusEligibility,
  statusPhaseIndex,
  protectStatusPayloads,
  settleHpChange,
  resolveStatusImmunities,
  isStatusEffectImmune,
  tickStatusEffects,
} from "@/engine/battle/statusEffectEngine";
import {
  applyPassiveAffinities,
  applyPassivesAtHook,
  collectPassives,
  elementBitToName,
} from "@/engine/battle/passiveEffectEngine";
import {
  getFormulaParams,
  getItem,
  getSkill,
  getStatusEffectMap,
} from "@/content/contentRegistry";
import {
  buildEnemySkillAction,
  selectEnemyAction,
  type EnemyAction,
  type EnemyBehaviorType,
  type ScoredAction,
} from "@/engine/battle/enemyUtility";
import { selectBossActionIntent } from "@/engine/battle/boss/bossOrchestrator";
import {
  applyBossBattleEvent,
  applyBossEffects,
} from "@/engine/battle/boss/bossRuntime";
import type { BossBattleEvent } from "@/engine/battle/boss/bossTypes";
import { BATTLE_ELEMENTS } from "@/types/battle";
import type { CleansableStatusEffectType, SkillCategory, StatusEffectPayload } from "@/types/content";
import type {
  ActiveStatusEffect,
  AppliedStatusEffectPayload,
  BattleActionOutcome,
  BattleActionResolution,
  BattleTraceCollector,
  BattleLogDraft,
  BattleParticipant,
  BattleResult,
  BattleSnapshot,
  CombatantSide,
} from "@/types/battle";


// ── Guard status effect ID (from content) ──

const GUARD_EFFECT_ID = "guard";
const GUARD_EFFECT_DURATION = 1;

function participantIsStatusImmune(
  participant: BattleParticipant,
  effectId: string,
): boolean {
  return isStatusEffectImmune(participant, effectId);
}

function resolveCleansedStatusEffectIds(
  target: BattleParticipant,
  cleanseTypes: readonly CleansableStatusEffectType[] | undefined,
): string[] {
  if (cleanseTypes == null || cleanseTypes.length === 0) return [];
  const effectMap = getStatusEffectMap();
  return (target.statusEffects ?? [])
    .filter((status) => {
      const type = effectMap.get(status.effectId)?.type;
      return type != null && cleanseTypes.some((cleanseType) => cleanseType === type);
    })
    .map((status) => status.effectId);
}
function statusChanceForTarget(
  target: BattleParticipant,
  effectId: string,
  baseChance: number,
): number {
  if (participantIsStatusImmune(target, effectId)) return 0;
  const priorSuccesses = target.bossAilmentSuccesses?.[effectId];
  return priorSuccesses == null
    ? baseChance
    : Math.max(5, baseChance - 25 * priorSuccesses);
}

// ── Participant cloning ──

function cloneParticipant(participant: BattleParticipant): BattleParticipant {
  const statusImmunities = resolveStatusImmunities(participant);
  const cloned: BattleParticipant = {
    ...participant,
    hp: { ...participant.hp },
    mp: { ...participant.mp },
    statusEffects: (participant.statusEffects ?? []).map((e) => ({ ...e })),
    ...(statusImmunities == null ? {} : { statusImmunities: [...statusImmunities] }),
    passiveEffects: participant.passiveEffects,
    endureUsed: participant.endureUsed,
  };

  if (participant.affinities != null) {
    cloned.affinities = { ...participant.affinities };
  }

  if (participant.combatStats != null) {
    cloned.combatStats = { ...participant.combatStats };
  }

  return cloned;
}

function applyOutcomeToParticipant(
  participant: BattleParticipant,
  outcome: BattleActionOutcome,
  phase?: number,
): BattleParticipant {
  if (participant.id !== outcome.finalTargetId) {
    return participant;
  }

  let nextHpCurrent = Math.min(
    participant.hp.max,
    Math.max(0, participant.hp.current + (outcome.hpDelta ?? 0)),
  );
  const nextMpCurrent = Math.min(
    participant.mp.max,
    Math.max(0, participant.mp.current + (outcome.mpDelta ?? 0)),
  );

  let statusEffects = (participant.statusEffects ?? []).map((e) => ({ ...e }));

  // Apply new status effects
  if (outcome.appliedStatusEffects != null && outcome.appliedStatusEffects.length > 0) {
    const effectMap = getStatusEffectMap();
    for (const payload of outcome.appliedStatusEffects) {
      if (participantIsStatusImmune(participant, payload.effectId)) continue;
      if (payload.effectId === "instant_death") {
        nextHpCurrent = 0;
        continue;
      }
      const content = effectMap.get(payload.effectId);
      if (content != null) {
        const result = applyStatusEffect(statusEffects, payload.effectId, payload.duration, content, phase);
        statusEffects = result.effects;
      } else {
        // Unknown effect: still add it
        statusEffects = applyRawEffect(statusEffects, payload.effectId, payload.duration);
      }
    }
  }

  // Consume shield effect if one was consumed
  if (outcome.consumedShieldEffectId != null) {
    statusEffects = consumeShieldEffect(statusEffects, outcome.consumedShieldEffectId);
  }

  // Remove status effects (charge/chant/focus consumption)
  if (outcome.removedStatusEffectIds != null) {
    statusEffects = statusEffects.filter(
      (e) => !outcome.removedStatusEffectIds!.includes(e.effectId),
    );
  }

  return {
    ...participant,
    ...settleHpChange(participant, nextHpCurrent - participant.hp.current),
    mp: { ...participant.mp, current: nextMpCurrent },
    statusEffects,
  };
}

function applyRawEffect(
  effects: ActiveStatusEffect[],
  effectId: string,
  duration: number,
): ActiveStatusEffect[] {
  const existing = effects.find((e) => e.effectId === effectId);
  if (existing != null) {
    return effects.map((e) =>
      e.effectId === effectId
        ? { ...e, remainingDuration: Math.max(e.remainingDuration, duration) }
        : e,
    );
  }
  return [...effects, { effectId, remainingDuration: duration, stacks: 1 }];
}

function applyBattleOutcomes(
  participants: BattleParticipant[],
  outcomes: BattleActionOutcome[],
  phase?: number,
): BattleParticipant[] {
  return participants.map((participant) => {
    const clonedParticipant = cloneParticipant(participant);
    return outcomes.reduce(
      (currentParticipant, outcome) =>
        applyOutcomeToParticipant(currentParticipant, outcome, phase),
      clonedParticipant,
    );
  });
}

// ── Battle result factories ──

function createVictoryBattleResult(
  participants: BattleParticipant[],
  turnCount: number,
): BattleResult {
  return {
    outcome: "victory",
    winningSide: "player",
    endReason: "all_enemies_down",
    turnCount,
    survivingParticipantIds: participants
      .filter((p) => !p.isDown)
      .map((p) => p.id),
    downParticipantIds: participants
      .filter((p) => p.isDown)
      .map((p) => p.id),
  };
}

function createDefeatBattleResult(
  participants: BattleParticipant[],
  turnCount: number,
): BattleResult {
  return {
    outcome: "defeat",
    winningSide: "enemy",
    endReason: "all_players_down",
    turnCount,
    survivingParticipantIds: participants
      .filter((p) => !p.isDown)
      .map((p) => p.id),
    downParticipantIds: participants
      .filter((p) => p.isDown)
      .map((p) => p.id),
  };
}

function getFirstAllowedTargetId(
  participants: BattleParticipant[],
  side: "player" | "enemy",
): string | null {
  return (
    participants.find(
      (p) =>
        p.side === side && p.isActive && !p.isDown && p.canAct !== false,
    )?.id ?? null
  );
}

// ── Enemy turn target selection ──

function selectEnemyTurnTarget(
  participants: BattleParticipant[],
): BattleParticipant | undefined {
  return participants
    .filter(
      (p) =>
        p.side === "player" && p.isActive && !p.isDown && p.canAct !== false,
    )
    .reduce<BattleParticipant | undefined>((lowest, p) => {
      if (lowest == null) return p;
      return p.hp.current < lowest.hp.current ? p : lowest;
    }, undefined);
}

function triggersEnemyTurnInterruption(
  target: BattleParticipant,
  outcomes: readonly BattleActionOutcome[],
): boolean {
  return target.accessoryEffects?.includes("miss_consume_all") === true
    && outcomes.some((outcome) => outcome.type === "miss" || outcome.type === "block");
}

// ── Core attack outcome builder ──

export interface BuildAttackOutcomesInput {
  actorId: string;
  actor: BattleParticipant;
  targetId: string;
  target: BattleParticipant;
  skillPower: number;
  skillElement: number;
  skillAccuracy: number;
  pierceResistanceWhenCharged?: boolean;
  statDriver: "attack" | "intelligence";
  skillCritRate?: number;
  hitCount?: number;
  hitCountMax?: number;
  skillCategory?: "physical" | "magic" | "heal" | "support" | "passive";
}

export function buildAttackOutcomes(
  input: BuildAttackOutcomesInput,
): BattleActionOutcome[] {
  const params = getFormulaParams();
  const { actor, target, skillPower, skillElement, skillAccuracy, statDriver } = input;
  const hitCount = input.hitCount ?? 1;
  const hitCountMax = input.hitCountMax ?? hitCount;
  const actualHits = hitCountMax > hitCount
    ? Math.floor(hitCount + Math.random() * (hitCountMax - hitCount + 0.999))
    : hitCount;
  const effectMap = getStatusEffectMap();
  const effectiveStats = computeEffectiveStats(actor, actor.statusEffects ?? [], effectMap);
  const effectiveTargetStats = computeEffectiveStats(target, target.statusEffects ?? [], effectMap);
  const boosts = consumeChargeChantFocus(actor.statusEffects ?? [], input.skillCategory ?? "physical");
  const isGuarding = (target.statusEffects ?? []).some((effect) => effect.effectId === GUARD_EFFECT_ID);
  const mergedAffinities = applyPassiveAffinities(collectPassives(target.passiveEffects), target.affinities ?? {
    weak: 0, resist: 0, nullify: 0, reflect: 0, absorb: 0,
  });
  const isPiercing = input.pierceResistanceWhenCharged && actor.statusEffects?.some((effect) => effect.effectId === "charge");
  if (isPiercing) {
    mergedAffinities.resist &= ~skillElement;
    mergedAffinities.nullify &= ~skillElement;
    mergedAffinities.reflect &= ~skillElement;
    mergedAffinities.absorb &= ~skillElement;
  }
  const affinityResult = resolveAffinityResult(mergedAffinities, skillElement);
  const baseOutcome = {
    actorId: input.actorId, primaryTargetId: input.targetId, finalTargetId: input.targetId,
  };
  const damageForHit = (affinityMultiplier: number): { damage: number; critical: boolean } => {
    let damage = skillPower <= 0 ? 0 : calculateDamage(
      (statDriver === "attack" ? effectiveStats.attack : effectiveStats.intelligence) ?? 5,
      actor.level ?? 1, effectiveTargetStats.defense ?? 5, skillPower, affinityMultiplier, params.damage,
    );
    damage = Math.floor(damage * boosts.damageMultiplier);
    const actorHpPercent = actor.hp.max > 0 ? Math.round(actor.hp.current / actor.hp.max * 100) : 100;
    damage = (applyPassivesAtHook(collectPassives(actor.passiveEffects), "on_damage_calc", {
      damage, element: elementBitToName(skillElement), actorHpPercent,
    }) as { damage: number }).damage;
    if (isGuarding) damage = calculateGuardReduction(damage, params.guard);
    const critChance = boosts.guaranteedCrit ? 100 : Math.min(params.critRate.max,
      Math.max(0, (actor.combatStats?.critRate ?? 5) + (input.skillCritRate ?? 0)));
    const critical = skillPower > 0 && rollCrit(critChance);
    if (critical) damage = Math.floor(damage * params.critRate.damageMultiplier);
    return { damage, critical };
  };

  // Piercing bypasses shields without consuming them; ordinary interception precedes accuracy.
  const shield: ReturnType<typeof checkShield> = skillPower > 0 && !isPiercing ? checkShield(target.statusEffects ?? [], skillElement) : { blocked: false };
  if (shield.blocked && shield.kind != null) {
    let nominalDamage = 0;
    const nominalAffinity = ["nullify", "reflect", "absorb"].includes(affinityResult) ||
      (isGuarding && affinityResult === "weak")
      ? params.affinity.normal
      : resolveAffinityMultiplier(mergedAffinities, skillElement, params.affinity);
    if (shield.kind !== "nullify") {
      for (let hit = 0; hit < actualHits; hit++) nominalDamage += damageForHit(nominalAffinity).damage;
    }
    const outcomes: BattleActionOutcome[] = [{
      ...baseOutcome, type: shield.kind === "nullify" ? "block" : shield.kind, tags: [],
      preventedBy: shield.kind, consumedShieldEffectId: shield.shieldEffectId,
      ...(shield.kind === "absorb" && !target.isDown ? { hpDelta: nominalDamage } : {}),
    }];
    if (shield.kind === "reflect" && nominalDamage > 0) outcomes.push({
      ...baseOutcome, type: "reflect", tags: [], finalTargetId: actor.id, hpDelta: -nominalDamage,
      preventedBy: "reflect",
    });
    return outcomes;
  }

  const outcomes: BattleActionOutcome[] = [];
  for (let hit = 0; hit < actualHits; hit++) {
    const hitChance = calculateHitChance(skillAccuracy, effectiveStats.agility ?? 5,
      effectiveTargetStats.agility ?? 5, params.hitRate, hitRateMultiplier(actor.statusEffects ?? [], effectMap));
    if (!rollHit(hitChance)) {
      outcomes.push({ ...baseOutcome, type: "miss", tags: [] });
      break;
    }
    const affinityOutcome = resolveAffinityOutcomeType(mergedAffinities, skillElement);
    if (affinityOutcome.outcomeType != null) {
      outcomes.push({ ...baseOutcome, type: affinityOutcome.outcomeType, tags: [], preventedBy: affinityOutcome.preventedBy });
      break;
    }
    const multiplier = isGuarding && affinityResult === "weak" ? params.affinity.normal
      : resolveAffinityMultiplier(mergedAffinities, skillElement, params.affinity);
    const { damage, critical } = damageForHit(multiplier);
    const tags: BattleActionOutcome["tags"] = [];
    if (affinityResult === "weak" && !isGuarding) tags.push("weak");
    if (critical) tags.push("critical");
    outcomes.push({ ...baseOutcome, type: "hit", tags, hpDelta: -damage });
  }
  return outcomes;
}

// ── Guard guard status clearing ──


// ── Swap validation ──

function validateSwapSelection(
  snapshot: BattleSnapshot,
):
  | { ok: true; swapOutId: string; swapInId: string | null }
  | { ok: false; error: BattleActionResolution["validationError"] } {
  if (snapshot.selectedSwapOutParticipantId == null) {
    return { ok: false, error: "swap_out_required" };
  }

  const playerParticipants = snapshot.participants.filter(
    (p) => p.side === "player",
  );
  const activePlayers = playerParticipants.filter((p) => p.isActive);
  const reservePlayers = playerParticipants.filter((p) => !p.isActive);

  if (activePlayers.length === 1 && reservePlayers.length === 0) {
    return { ok: false, error: "swap_unavailable" };
  }

  const swapOut = snapshot.participants.find(
    (p) => p.id === snapshot.selectedSwapOutParticipantId,
  );
  if (swapOut == null) return { ok: false, error: "swap_out_not_found" };
  if (!swapOut.isActive) return { ok: false, error: "swap_out_not_active" };

  if (snapshot.selectedSwapInParticipantId == null) {
    return { ok: true, swapOutId: swapOut.id, swapInId: null };
  }

  const swapIn = snapshot.participants.find(
    (p) => p.id === snapshot.selectedSwapInParticipantId,
  );
  if (swapIn == null) return { ok: false, error: "swap_in_not_found" };
  if (swapIn.isActive) return { ok: false, error: "swap_in_not_reserve" };
  if (swapIn.isDown) return { ok: false, error: "swap_in_down" };

  return { ok: true, swapOutId: swapOut.id, swapInId: swapIn.id };
}

function applySwapToParticipants(
  participants: BattleParticipant[],
  swapOutId: string,
  swapInId: string | null,
): BattleParticipant[] {
  return participants.map((p) => {
    const cloned = cloneParticipant(p);
    if (cloned.id === swapOutId) return { ...cloned, isActive: false };
    if (swapInId != null && cloned.id === swapInId) return { ...cloned, isActive: true };
    return cloned;
  });
}

function createSwapResolution(
  snapshot: BattleSnapshot,
): BattleActionResolution {
  const validation = validateSwapSelection(snapshot);
  if (!validation.ok) {
    return {
      ok: false,
      validationError: validation.error,
      actorId: snapshot.currentActorId ?? "unknown-actor",
      actionId: snapshot.selectedActionId ?? "swap",
      intendedTargetId: snapshot.selectedTargetId,
      outcomes: [],
      verboseLog: [],
      summaryLog: [],
    };
  }

  return {
    ok: true,
    actorId: snapshot.currentActorId ?? "unknown-actor",
    actionId: snapshot.selectedActionId ?? "swap",
    intendedTargetId: snapshot.selectedTargetId,
    outcomes: [],
    pressTurnResult: settleSwapPressTurn(snapshot.pressTurn),
    verboseLog: [
      validation.swapInId == null
        ? `${validation.swapOutId}退出前排。`
        : `${validation.swapOutId}换下，${validation.swapInId}上场。`,
    ],
    summaryLog: ["换人"],
  };
}

// ── Press turn resolution from outcomes ──

export function createPressTurnResolutionForOutcomes(
  snapshot: BattleSnapshot,
  outcomes: BattleActionOutcome[],
): BattleActionResolution {
  outcomes = protectStatusOutcomes(snapshot.participants, outcomes);
  const aggregatedOutcome = aggregatePressTurnOutcome(outcomes);
  const actor = snapshot.participants.find(
    (participant) => participant.id === snapshot.currentActorId,
  );
  const ignoresPenalty = actor?.accessoryEffects?.includes("no_press_penalty") === true;
  const settledOutcome = ignoresPenalty && aggregatedOutcome != null && [
    "miss", "block", "reflect", "absorb",
  ].includes(aggregatedOutcome.outcomeType)
    ? { outcomeType: "hit" as const, tags: [] }
    : aggregatedOutcome;
  return {
    ok: true,
    actorId: snapshot.currentActorId ?? "unknown-actor",
    actionId: snapshot.selectedActionId ?? "attack",
    intendedTargetId: snapshot.selectedTargetId,
    outcomes,
    pressTurnResult:
      settledOutcome == null
        ? undefined
        : settlePressTurnResultByOutcome(
            snapshot.pressTurn,
            settledOutcome.outcomeType,
            settledOutcome.tags,
          ),
    verboseLog: [],
    summaryLog: [],
  };
}

function initializeTurnForSide(
  snapshot: BattleSnapshot,
  participants: BattleParticipant[],
  side: CombatantSide,
): BattleSnapshot {
  const refreshed = refreshBattleStatus({
    ...snapshot, participants, phase: side === "player" ? "PLAYER_COMMAND" : "ENEMY_TURN",
  });
  participants = refreshed.participants;
  const eligibleIds = getActingParticipantIdsForSide(participants, side);
  const pressTurn = createPressTurnStateForSide(participants, side, refreshed.bossRuntime);
  const participantIds = participants.filter((participant) =>
    participant.side === side && participant.isActive && !participant.isDown &&
    (participant.canAct !== false || participant.canActBeforeStatus != null)).map((participant) => participant.id);
  return {
    ...refreshed,
    participants,
    pressTurn,
    pressTurnAllocation: {
      participantIds,
      initialIconCount: pressTurn.icons.length,
    },
    currentActorId: eligibleIds[0] ?? null,
  };
}

export function refreshBattleStatus(snapshot: BattleSnapshot): BattleSnapshot {
  const phase = statusPhaseIndex(snapshot);
  const side = snapshot.phase === "ENEMY_TURN" ? "enemy" : "player";
  return {
    ...snapshot,
    participants: snapshot.participants.map((participant) => {
      // Old snapshots stored a derived canAct flag without its original value.
      const legacyControl = participant.canActBeforeStatus == null &&
        (participant.statusEffects ?? []).some((effect) => effect.firstTickPhase == null &&
          ["sleep", "freeze", "paralyze"].includes(effect.effectId));
      const restored = legacyControl ? {
        ...participant,
        canAct: true,
        statusEffects: participant.statusEffects?.map((effect) =>
          effect.effectId === "paralyze" && effect.paralysisPhase == null &&
          effect.paralysisBlocked == null && participant.canAct != null
            ? { ...effect, paralysisPhase: phase, paralysisBlocked: participant.canAct === false }
            : effect),
      } : participant;
      return refreshStatusEligibility(restored, phase, side);
    }),
  };
}

function endSidePhase(snapshot: BattleSnapshot): BattleParticipant[] {
  const phase = statusPhaseIndex(snapshot);
  const side = snapshot.phase === "ENEMY_TURN" ? "enemy" : "player";
  return snapshot.participants.map((participant) =>
    refreshStatusEligibility(expireSidePhase(participant, phase, side), phase, side));
}

function rollStatusPayloads(
  actor: BattleParticipant | undefined,
  target: BattleParticipant,
  payloads: StatusEffectPayload[] | undefined,
): AppliedStatusEffectPayload[] {
  const effectMap = getStatusEffectMap();
  return (payloads ?? []).flatMap((status) => {
    const context = applyPassivesAtHook(collectPassives(actor?.passiveEffects), "on_status_chance", {
      chance: status.chance,
    }) as { chance: number };
    return Math.random() * 100 < statusChanceForTarget(target, status.effectId, context.chance)
      ? [{ effectId: status.effectId, duration: effectMap.get(status.effectId)?.duration ?? 3 }]
      : [];
  });
}

function protectStatusOutcomes(
  participants: BattleParticipant[],
  outcomes: BattleActionOutcome[],
): BattleActionOutcome[] {
  const effectMap = getStatusEffectMap();
  const shieldedTargets = new Set<string>();
  const consumedTargets = new Set(outcomes.filter((outcome) => outcome.consumedShieldEffectId != null)
    .map((outcome) => outcome.primaryTargetId));
  return outcomes.map((outcome) => {
    if (outcome.appliedStatusEffects == null) return outcome;
    const target = participants.find((participant) => participant.id === outcome.finalTargetId);
    const actor = participants.find((participant) => participant.id === outcome.actorId);
    if (target == null) return outcome;
    const protection = protectStatusPayloads({
      ...target,
      statusImmunities: resolveStatusImmunities(target),
      statusEffects: consumedTargets.has(target.id) && !shieldedTargets.has(target.id)
        ? target.statusEffects?.filter((effect) => effect.effectId !== "ailment_null")
        : target.statusEffects,
    }, outcome.appliedStatusEffects, effectMap, actor?.side !== target.side);
    const blocked = protection.blocked;
    const consume = blocked && !shieldedTargets.has(target.id);
    if (blocked) shieldedTargets.add(target.id);
    const appliedStatusEffects = protection.payloads;
    return {
      ...outcome,
      ...(consume ? { consumedShieldEffectId: "ailment_null" } : {}),
      appliedStatusEffects,
      ...(blocked && appliedStatusEffects.length === 0 && outcome.hpDelta == null &&
        !outcomes.some((hit) => hit.finalTargetId === target.id && hit.type === "hit" && (hit.hpDelta ?? 0) < 0)
        ? { type: "block" as const, preventedBy: "nullify" as const } : {}),
    };
  });
}

function appendBoostConsumption(
  actor: BattleParticipant,
  category: SkillCategory,
  outcomes: BattleActionOutcome[],
): void {
  if (!outcomes.some((outcome) => outcome.type === "hit" &&
    outcome.finalTargetId === outcome.primaryTargetId && outcome.finalTargetId !== actor.id &&
    (outcome.hpDelta ?? 0) < 0)) return;
  const remaining = consumeChargeChantFocus(actor.statusEffects ?? [], category).effects;
  const removedStatusEffectIds = (actor.statusEffects ?? [])
    .filter((effect) => !remaining.includes(effect)).map((effect) => effect.effectId);
  if (removedStatusEffectIds.length > 0) outcomes.push({
    type: "hit", tags: [], actorId: actor.id, primaryTargetId: actor.id, finalTargetId: actor.id,
    removedStatusEffectIds,
  });
}
export function advanceEmptyPlayerPhase(snapshot: BattleSnapshot): BattleSnapshot {
  if (snapshot.phase !== "PLAYER_COMMAND") return snapshot;
  snapshot = refreshBattleStatus(snapshot);
  if (snapshot.participants.filter((participant) => participant.side === "player").every((participant) => participant.isDown)) {
    return createImmediateEnemyResult(snapshot, "defeat");
  }
  if (!isPressTurnExhausted(snapshot.pressTurn) &&
    getActingParticipantIdsForSide(snapshot.participants, "player").length > 0) return snapshot;
  return settleBossTurnBoundary(initializeTurnForSide({
    ...snapshot, selectedActionId: null, selectedContentId: null,
    selectedTargetId: null, currentMenuNodeId: null,
  }, endSidePhase(snapshot), "enemy"), {
    type: "round_started", turnCount: snapshot.turnCount ?? 1,
  });
}

// ── Main action resolver ──

export function resolveSelectedBattleAction(
  snapshot: BattleSnapshot,
  trace?: BattleTraceCollector,
): BattleSnapshot {
  if (trace) trace.action = undefined;
  if (snapshot.phase !== "PLAYER_COMMAND") return snapshot;
  if (snapshot.selectedActionId == null) return snapshot;
  snapshot = refreshBattleStatus(snapshot);
  if (snapshot.participants.filter((participant) => participant.side === "player").every((participant) => participant.isDown)) {
    return createImmediateEnemyResult(snapshot, "defeat");
  }
  const queue = [...(snapshot.pressTurnAllocation?.participantIds ?? [])];
  const normalizedActorId = normalizeCurrentActorId(
    queue,
    snapshot.participants,
    snapshot.currentActorId,
  );
  const normalizedSnapshot = {
    ...snapshot,
    pressTurnAllocation: {
      participantIds: queue,
      initialIconCount: snapshot.pressTurnAllocation?.initialIconCount ?? snapshot.pressTurn.icons.length,
    },
    currentActorId: normalizedActorId,
  };
  if (normalizedActorId == null || isPressTurnExhausted(snapshot.pressTurn)) {
    return advanceEmptyPlayerPhase(normalizedSnapshot);
  }
  const resolution =
    resolveSelectedBattleActionToResolution(normalizedSnapshot);

  if (!resolution.ok) {
    return normalizedSnapshot;
  }

  if (resolution.outcomes.length === 0 && resolution.pressTurnResult == null) {
    return normalizedSnapshot;
  }

  if (trace) {
    const content = resolution.contentId == null ? null
      : resolution.actionId === "basic-item" ? getItem(resolution.contentId) : getSkill(resolution.contentId);
    trace.action = {
      actorId: resolution.actorId, actionId: resolution.actionId, contentId: resolution.contentId,
      name: content?.name ?? getBattleActionDefinition(resolution.actionId).label,
      ...(content && "category" in content ? { category: content.category } : {}),
      ...(content && "element" in content && content.element != null ? {
        element: typeof content.element === "number" ? content.element
          : BATTLE_ELEMENTS[content.element as keyof typeof BATTLE_ELEMENTS] ?? BATTLE_ELEMENTS.None,
      } : {}),
      targetType: content?.targetType,
      outcomes: resolution.outcomes,
    };
  }

  let participants =
    resolution.actionId === "swap"
      ? (() => {
          const validation = validateSwapSelection(normalizedSnapshot);
          if (!validation.ok) return normalizedSnapshot.participants;
          return applySwapToParticipants(
            normalizedSnapshot.participants,
            validation.swapOutId,
            validation.swapInId,
          );
        })()
      : applyBattleOutcomes(
          normalizedSnapshot.participants,
          resolution.outcomes,
          statusPhaseIndex(normalizedSnapshot),
        );
  participants = refreshBattleStatus({ ...normalizedSnapshot, participants }).participants;
  const turnCount = normalizedSnapshot.turnCount ?? 1;
  const nextPressTurn =
    resolution.pressTurnResult?.after ?? normalizedSnapshot.pressTurn;
  const actionId = resolution.contentId ?? resolution.actionId;
  const emittedSnapshot = emitBossActionEvents({
    ...normalizedSnapshot,
    participants,
    pressTurn: nextPressTurn,
    battleLog: appendBattleLogs(normalizedSnapshot, [
      createPlayerActionLogEntry(resolution, turnCount, participants),
    ]),
  }, resolution.actorId, actionId, resolveBossEventActionMetadata(actionId).element,
  resolution.outcomes, participants, normalizedSnapshot.participants);
  participants = emittedSnapshot.participants;

  for (const participant of participants) {
    const previous = normalizedSnapshot.participants.find((entry) => entry.id === participant.id);
    if (participant.side === "player" && participant.isActive && !participant.isDown &&
      participant.canAct !== false && previous?.canActBeforeStatus != null && !queue.includes(participant.id)) {
      queue.push(participant.id);
    }
  }
  const allEnemiesDefeated = participants
    .filter((p) => p.side === "enemy")
    .every((p) => p.isDown);
  const allPlayersDefeated = participants
    .filter((p) => p.side === "player")
    .every((p) => p.isDown);
  const playerTurnExhausted = isPressTurnExhausted(nextPressTurn) ||
    normalizeCurrentActorId(queue, participants, normalizedActorId) == null;
  const nextActorId = playerTurnExhausted
    ? null
    : findNextEligibleActorId(
        queue,
        participants,
        normalizedSnapshot.currentActorId,
      );

  const battleResult = allEnemiesDefeated
    ? createVictoryBattleResult(participants, turnCount)
    : allPlayersDefeated
      ? createDefeatBattleResult(participants, turnCount)
      : normalizedSnapshot.battleResult;
  const resultLog =
    battleResult != null && (allEnemiesDefeated || allPlayersDefeated)
      ? [createBattleResultLogEntry(battleResult)]
      : [];

  const nextSnapshot: BattleSnapshot = {
    ...emittedSnapshot,
    participants,
    pressTurn: nextPressTurn,
    pressTurnAllocation: resolution.actionId === "swap"
      ? {
          participantIds: participants
            .filter(p => p.side === "player" && p.isActive && !p.isDown)
            .map(p => p.id),
          initialIconCount: normalizedSnapshot.pressTurnAllocation?.initialIconCount ?? 1,
        }
      : normalizedSnapshot.pressTurnAllocation,
    currentActorId: nextActorId,
    lifecycleState:
      allEnemiesDefeated || allPlayersDefeated ? "RESOLVED" : "ACTIVE",
    phase:
      allEnemiesDefeated || allPlayersDefeated
        ? "RESULT"
        : playerTurnExhausted
          ? "ENEMY_TURN"
          : "PLAYER_COMMAND",
    battleLog: appendBattleLogs(emittedSnapshot, resultLog),
    consumedItemId: resolution.consumedItemId ?? null,
  };

  if (battleResult != null) {
    nextSnapshot.battleResult = battleResult;
  }

  if (allEnemiesDefeated) {
    nextSnapshot.resultSummary = "胜利";
  } else if (allPlayersDefeated) {
    nextSnapshot.resultSummary = "失败";
  } else if (normalizedSnapshot.resultSummary != null) {
    nextSnapshot.resultSummary = normalizedSnapshot.resultSummary;
  }

  if (
    nextSnapshot.phase === "ENEMY_TURN" &&
    nextSnapshot.lifecycleState === "ACTIVE"
  ) {
    Object.assign(
      nextSnapshot,
      initializeTurnForSide(nextSnapshot, endSidePhase({ ...emittedSnapshot, participants }), "enemy"),
      {
        selectedActionId: null,
        selectedContentId: null,
        selectedTargetId: null,
        currentMenuNodeId: null,
        selectedSwapOutParticipantId: null,
        selectedSwapInParticipantId: null,
        swapPhase: "idle",
        _targetTypeHint: null,
      },
    );
  }

  return nextSnapshot.phase === "ENEMY_TURN" &&
    nextSnapshot.lifecycleState === "ACTIVE"
    ? settleBossTurnBoundary(nextSnapshot, {
        type: "round_started",
        turnCount,
      })
    : nextSnapshot;
}
// ── Enemy turn resolver ──

function resolveBossEventActionMetadata(actionId: string): {
  element: number;
  actionCategory?: "physical" | "magic" | "heal" | "support" | "passive";
} {
  try {
    const skill = getSkill(actionId);
    return { element: skill.element, actionCategory: skill.category };
  } catch {
    return {
      element: actionId === "attack" ? BATTLE_ELEMENTS.Physical : BATTLE_ELEMENTS.None,
      ...(actionId === "attack" ? { actionCategory: "physical" as const } : {}),
    };
  }
}

function emitBossActionEvents(
  snapshot: BattleSnapshot,
  actorId: string,
  actionId: string,
  element: number,
  outcomes: BattleActionOutcome[],
  participants: BattleParticipant[],
  previousParticipants?: readonly BattleParticipant[],
): BattleSnapshot {
  const metadata = resolveBossEventActionMetadata(actionId);
  const targetIds = [
    ...new Set(
      outcomes
        .map((outcome) => outcome.finalTargetId ?? outcome.primaryTargetId)
        .filter((targetId): targetId is string => targetId != null),
    ),
  ];
  let next = applyBossBattleEvent(snapshot, {
    type: "action_resolved",
    actorId,
    actionId,
    targetIds,
  });
  const emittedDamage = new Map<string, number>();
  const emittedHealing = new Map<string, number>();
  const emittedDown = new Set<string>();

  for (const outcome of outcomes) {
    const targetId = outcome.finalTargetId ?? outcome.primaryTargetId;
    if (targetId == null) continue;

    if ((outcome.hpDelta ?? 0) < 0 || outcome.appliedStatusEffects?.some((status) => status.effectId === "instant_death")) {
      const previousHp = previousParticipants?.find((participant) => participant.id === targetId)?.hp.current;
      const currentHp = participants.find((participant) => participant.id === targetId)?.hp.current;
      const totalDamage = previousHp != null && currentHp != null
        ? Math.max(0, previousHp - currentHp)
        : Math.abs(outcome.hpDelta ?? 0);
      const remaining = Math.max(0, totalDamage - (emittedDamage.get(targetId) ?? 0));
      const actualDamage = Math.min(remaining,
        outcome.appliedStatusEffects?.some((status) => status.effectId === "instant_death")
          ? remaining : Math.abs(outcome.hpDelta ?? 0));
      emittedDamage.set(targetId, (emittedDamage.get(targetId) ?? 0) + actualDamage);
      if (actualDamage > 0) next = applyBossBattleEvent(next, {
        type: "damage_applied",
        sourceId: outcome.type === "reflect" && targetId === actorId
          ? outcome.primaryTargetId ?? actorId : actorId,
        targetId,
        amount: actualDamage,
        element,
        actionCategory: metadata.actionCategory,
      });
    }
    if ((outcome.hpDelta ?? 0) > 0) {
      const previousHp = previousParticipants?.find((participant) => participant.id === targetId)?.hp.current;
      const currentHp = participants.find((participant) => participant.id === targetId)?.hp.current;
      const totalHealing = previousHp != null && currentHp != null
        ? Math.max(0, currentHp - previousHp)
        : Math.max(0, outcome.hpDelta ?? 0);
      const actualHealing = Math.min(Math.max(0, outcome.hpDelta ?? 0),
        Math.max(0, totalHealing - (emittedHealing.get(targetId) ?? 0)));
      emittedHealing.set(targetId, (emittedHealing.get(targetId) ?? 0) + actualHealing);
      if (actualHealing > 0) next = applyBossBattleEvent(next, {
        type: "healing_applied",
        sourceId: actorId,
        targetId,
        amount: actualHealing,
      });
    }
    for (const status of outcome.appliedStatusEffects ?? []) {
      const target = participants.find((participant) => participant.id === targetId);
      if (target != null && participantIsStatusImmune(target, status.effectId)) continue;
      next = applyBossBattleEvent(next, {
        type: "status_applied",
        sourceId: actorId,
        targetId,
        effectId: status.effectId,
      });
    }
    if (!emittedDown.has(targetId) && participants.find((participant) => participant.id === targetId)?.isDown &&
      previousParticipants?.find((participant) => participant.id === targetId)?.isDown !== true) {
      emittedDown.add(targetId);
      next = applyBossBattleEvent(next, {
        type: "participant_down",
        participantId: targetId,
      });
    }
  }

  return next;
}

function resolveEnemyActionTargets(
  participants: readonly BattleParticipant[],
  actor: BattleParticipant,
  action: EnemyAction,
  selectedTarget: BattleParticipant,
): BattleParticipant[] {
  const isEligibleAlly = (participant: BattleParticipant) =>
    participant.side === actor.side &&
    participant.isActive &&
    (action.revives === true ? participant.isDown : !participant.isDown);
  const isEligibleEnemy = (participant: BattleParticipant) =>
    participant.side !== actor.side && participant.isActive && !participant.isDown;

  switch (action.targetType) {
    case "all_allies":
      return participants.filter(isEligibleAlly);
    case "all_enemies":
      return participants.filter(isEligibleEnemy);
    case "single_ally":
      return isEligibleAlly(selectedTarget) ? [selectedTarget] : [];
    case "single_enemy":
      return isEligibleEnemy(selectedTarget) ? [selectedTarget] : [];
    case "self":
      return actor.isActive && !actor.isDown ? [actor] : [];
  }
}

function buildEnemyRecoveryOutcomes(
  actor: BattleParticipant,
  target: BattleParticipant,
  action: EnemyAction,
): BattleActionOutcome[] {
  const appliedStatusEffects = rollStatusPayloads(actor, target, action.statusEffects);

  const removedStatusEffectIds = resolveCleansedStatusEffectIds(target, action.cleanses);

  let hpDelta: number | undefined;
  if (action.category === "heal") {
    const healAmount = action.healPercent != null
      ? Math.round(target.hp.max * action.healPercent / 100)
      : action.basePower;
    hpDelta = Math.min(healAmount, target.hp.max - target.hp.current);
  }

  return [{
    type: "hit",
    tags: [],
    actorId: actor.id,
    primaryTargetId: target.id,
    finalTargetId: target.id,
    ...(hpDelta == null ? {} : { hpDelta }),
    ...(appliedStatusEffects.length === 0 ? {} : { appliedStatusEffects }),
    ...(removedStatusEffectIds.length === 0 ? {} : { removedStatusEffectIds }),
  }];
}
function finishEnemyTurn(snapshot: BattleSnapshot): BattleSnapshot {
  const turnCount = snapshot.turnCount ?? 1;
  snapshot = refreshBattleStatus(snapshot);
  let participants = endSidePhase(snapshot).map(cloneParticipant);
  const logs: BattleLogDraft[] = [];
  const bossState = snapshot;
  // Tick status effects at round boundary
  const effectMap = getStatusEffectMap();
  const participantsBeforeTick = participants.map(cloneParticipant);
  participants = participants.map((p) => {
    if (p.isDown) return p;
    const tickableEffects = (p.statusEffects ?? []).filter(
      (effect) => !participantIsStatusImmune(p, effect.effectId),
    );
    const tickResult = tickStatusEffects(tickableEffects, p.hp, effectMap);
    const settled = applyOutcomeToParticipant({ ...p, statusEffects: tickResult.updatedEffects }, {
      type: "hit", tags: [], actorId: p.id, finalTargetId: p.id,
      hpDelta: tickResult.hpDelta, mpDelta: tickResult.mpDelta,
    });
    if (settled.isDown) return settled;
    const regenCtx = applyPassivesAtHook(collectPassives(p.passiveEffects), "on_turn_start", {
      hpMax: p.hp.max, mpMax: p.mp.max, hpCurrent: settled.hp.current, mpCurrent: settled.mp.current,
    }) as { hpCurrent: number; mpCurrent: number };
    return {
      ...settled,
      hp: { ...settled.hp, current: Math.min(p.hp.max, regenCtx.hpCurrent) },
      mp: { ...settled.mp, current: Math.min(p.mp.max, regenCtx.mpCurrent) },
    };
  });

  for (const participant of participants) {
    const before = participantsBeforeTick.find((candidate) => candidate.id === participant.id);
    if (before == null) continue;
    const hpChange = participant.hp.current - before.hp.current;
    const mpChange = participant.mp.current - before.mp.current;
    if (hpChange < 0) {
      logs.push(createMechanicLogDraft(turnCount, `${participant.displayName}受到 ${Math.abs(hpChange)} 点持续伤害`, [`HP ${participant.hp.current}/${participant.hp.max}`]));
    } else if (hpChange > 0) {
      logs.push(createMechanicLogDraft(turnCount, `${participant.displayName}每回合恢复 ${hpChange} HP`, [`HP ${participant.hp.current}/${participant.hp.max}`]));
    }
    if (mpChange > 0) {
      logs.push(createMechanicLogDraft(turnCount, `${participant.displayName}每回合恢复 ${mpChange} MP`, [`MP ${participant.mp.current}/${participant.mp.max}`]));
    }
  }

  let postTickBossState: BattleSnapshot = { ...bossState, participants };
  const playerDotSourceId = participants.find(
    (participant) => participant.side === "player" && participant.isActive,
  )?.id;
  if (playerDotSourceId != null) {
    for (const participant of participants) {
      if (participant.side !== "enemy") continue;
      const before = bossState.participants.find(
        (candidate) => candidate.id === participant.id,
      );
      const actualDamage = before == null
        ? 0
        : Math.max(0, before.hp.current - participant.hp.current);
      if (actualDamage === 0) continue;
      postTickBossState = applyBossBattleEvent(postTickBossState, {
        type: "damage_applied",
        sourceId: playerDotSourceId,
        targetId: participant.id,
        amount: actualDamage,
        element: BATTLE_ELEMENTS.Ailment,
        actionCategory: "support",
      });
    }
  }
  for (const participant of participants) {
    const before = bossState.participants.find((candidate) => candidate.id === participant.id);
    if (participant.isDown && before?.isDown === false) {
      postTickBossState = applyBossBattleEvent(postTickBossState, {
        type: "participant_down", participantId: participant.id,
      });
    }
  }
  participants = postTickBossState.participants;

  const allPlayersDefeated = participants
    .filter((p) => p.side === "player")
    .every((p) => p.isDown);

  if (allPlayersDefeated) {
    const battleResult = createDefeatBattleResult(participants, turnCount);
    return {
      ...postTickBossState,
      participants,
      lifecycleState: "RESOLVED",
      phase: "RESULT",
      currentActorId: null,
      battleResult,
      resultSummary: "失败",
      battleLog: appendBattleLogs(postTickBossState, [
        ...logs,
        createBattleResultLogEntry(battleResult),
      ]),
    };
  }

  if (participants.filter((participant) => participant.side === "enemy").every((participant) => participant.isDown)) {
    return createImmediateEnemyResult({
      ...postTickBossState, participants, battleLog: appendBattleLogs(postTickBossState, logs),
    }, "victory");
  }
  const nextTurnCount = turnCount + 1;
  const roundEndedBossState = settleBossTurnBoundary(
    { ...postTickBossState, participants, battleLog: appendBattleLogs(postTickBossState, logs) },
    { type: "round_ended", turnCount },
  );
  if (roundEndedBossState.phase === "RESULT") return roundEndedBossState;
  const next = initializeTurnForSide({
    ...roundEndedBossState,
    lifecycleState: "ACTIVE",
    turnCount: nextTurnCount,
    selectedActionId: null,
    selectedTargetId: getFirstAllowedTargetId(participants, "enemy"),
    selectedSwapOutParticipantId: null,
    selectedSwapInParticipantId: null,
    battleLog: appendBattleLogs(roundEndedBossState, [
      createPlayerRoundStartLogEntry(nextTurnCount),
    ]),
  }, roundEndedBossState.participants, "player");
  // An entirely controlled phase still completes, without creating action icons.
  return next.currentActorId == null
    ? settleBossTurnBoundary(initializeTurnForSide(next, endSidePhase(next), "enemy"), {
        type: "round_started", turnCount: nextTurnCount,
      })
    : next;
}

function ensureEnemyTurnInitialized(snapshot: BattleSnapshot): BattleSnapshot {
  if (snapshot.phase !== "ENEMY_TURN") return snapshot;

  const allocation = snapshot.pressTurnAllocation?.participantIds ?? [];
  const hasEnemyAllocation = snapshot.pressTurnAllocation != null
    && allocation.every((participantId) =>
      snapshot.participants.some(
        (participant) =>
          participant.id === participantId && participant.side === "enemy",
      ),
    );
  if (snapshot.pressTurn.ownerSide === "enemy" && hasEnemyAllocation) {
    return snapshot;
  }

  const initialized = initializeTurnForSide(
    snapshot,
    snapshot.participants.map(cloneParticipant),
    "enemy",
  );
  return settleBossTurnBoundary(
    { ...initialized, phase: "ENEMY_TURN" },
    { type: "round_started", turnCount: snapshot.turnCount ?? 1 },
  );
}

function createImmediateEnemyResult(
  snapshot: BattleSnapshot,
  outcome: "victory" | "defeat",
): BattleSnapshot {
  const turnCount = snapshot.turnCount ?? 1;
  const battleResult = outcome === "victory"
    ? createVictoryBattleResult(snapshot.participants, turnCount)
    : createDefeatBattleResult(snapshot.participants, turnCount);
  return {
    ...snapshot,
    lifecycleState: "RESOLVED",
    phase: "RESULT",
    currentActorId: null,
    battleResult,
    resultSummary: outcome === "victory" ? "胜利" : "失败",
    battleLog: appendBattleLogs(snapshot, [
      createBattleResultLogEntry(battleResult),
    ]),
  };
}

function settleBossTurnBoundary(
  snapshot: BattleSnapshot,
  event: Extract<BossBattleEvent, { type: "round_started" | "round_ended" | "before_enemy_action" }>,
): BattleSnapshot {
  const next = refreshBattleStatus(applyBossBattleEvent(snapshot, event));
  if (next.participants.filter((participant) => participant.side === "player").every((participant) => participant.isDown)) {
    return createImmediateEnemyResult(next, "defeat");
  }
  if (next.participants.filter((participant) => participant.side === "enemy").every((participant) => participant.isDown)) {
    return createImmediateEnemyResult(next, "victory");
  }
  return next;
}

function settleEnemyPass(
  snapshot: BattleSnapshot,
  actor: BattleParticipant,
): BattleSnapshot {
  const settlement = settlePassPressTurn(snapshot.pressTurn);
  const next = {
    ...snapshot,
    pressTurn: settlement.after,
    battleLog: appendBattleLogs(snapshot, [{
      turnCount: snapshot.turnCount ?? 1,
      side: "enemy",
      kind: "action",
      visibility: "both",
      actorId: actor.id,
      actionId: "pass",
      targetIds: [actor.id],
      summary: actor.displayName + "传递了行动。",
    }]),
  };
  if (isPressTurnExhausted(next.pressTurn)) {
    return finishEnemyTurn(next);
  }

  const queue = next.pressTurnAllocation?.participantIds ?? [];
  const nextActorId = findNextEligibleActorId(
    queue,
    next.participants,
    actor.id,
  );
  return nextActorId == null
    ? finishEnemyTurn(next)
    : { ...next, currentActorId: nextActorId };
}

export function resolveNextEnemyAction(
  snapshot: BattleSnapshot,
  trace?: BattleTraceCollector,
): BattleSnapshot {
  if (trace) trace.action = undefined;
  if (snapshot.phase !== "ENEMY_TURN") return snapshot;

  let working = refreshBattleStatus(ensureEnemyTurnInitialized(snapshot));
  if (working.phase === "RESULT") return working;
  const livingEnemies = working.participants.filter(
    (participant) =>
      participant.side === "enemy" &&
      participant.isActive &&
      !participant.isDown,
  );
  if (livingEnemies.length === 0) {
    return createImmediateEnemyResult(working, "victory");
  }
  if (isPressTurnExhausted(working.pressTurn)) {
    return finishEnemyTurn(working);
  }

  const queue = [...(working.pressTurnAllocation?.participantIds ?? [])];
  for (const participant of working.participants) {
    if (participant.side === "enemy" && participant.isActive && !participant.isDown &&
      participant.canActBeforeStatus != null && !queue.includes(participant.id)) {
      queue.push(participant.id);
    }
  }
  working = {
    ...working,
    pressTurnAllocation: {
      participantIds: queue,
      initialIconCount: working.pressTurnAllocation?.initialIconCount ?? working.pressTurn.icons.length,
    },
  };
  const actorId = normalizeCurrentActorId(
    queue,
    working.participants,
    working.currentActorId,
  );
  if (actorId == null) {
    return finishEnemyTurn(working);
  }

  working = settleBossTurnBoundary(working, {
    type: "before_enemy_action",
    actorId,
  });
  if (working.phase === "RESULT") return working;
  let participants = working.participants.map(cloneParticipant);
  const actor = participants.find(
    (participant) => participant.id === actorId,
  );
  if (actor == null || actor.isDown || actor.canAct === false) {
    return finishEnemyTurn({ ...working, participants });
  }

  const bossIntent = selectBossActionIntent(working, actor.id, Math.random);
  if (bossIntent?.type === "force_defeat") {
    participants = participants.map((participant) =>
      participant.side === "player"
        ? {
            ...participant,
            hp: { ...participant.hp, current: 0 },
            isDown: true,
          }
        : participant,
    );
    const defeatBase: BattleSnapshot = {
      ...working,
      participants,
      battleLog: appendBattleLogs(working, [
        createMechanicLogDraft(
          working.turnCount ?? 1,
          bossIntent.reason,
          ["Skill " + bossIntent.skillId + ": 9999 damage to all players."],
        ),
      ]),
    };
    return createImmediateEnemyResult(defeatBase, "defeat");
  }
  if (bossIntent?.type === "pass") {
    return settleEnemyPass({ ...working, participants }, actor);
  }
  if (
    bossIntent?.type === "use_skill" &&
    bossIntent.reason === "queued counter"
  ) {
    working = applyBossEffects(working, [
      { type: "enqueue_counter", actorId: actor.id, skillId: null },
    ]);
  }

  let scored: ScoredAction | null;
  const execution = bossIntent?.type === "execute_players" ? bossIntent : null;
  if (bossIntent?.type === "use_skill" || bossIntent?.type === "execute_players") {
    const action = buildEnemySkillAction(bossIntent.skillId);
    const target = participants.find(
      (participant) => bossIntent.type === "execute_players"
        ? participant.side === "player" && !participant.isDown
        : participant.id === bossIntent.targetIds[0],
    );
    scored = action == null || target == null
      ? null
      : { action, target, score: Number.POSITIVE_INFINITY };
  } else {
    scored = selectEnemyAction(actor, participants, "aggressive");
  }
  if (scored == null) {
    return settleEnemyPass({ ...working, participants }, actor);
  }

  const { action, target } = scored;
  const actionTargets = execution != null
    ? participants.filter((participant) => participant.side === "player" && !participant.isDown)
    : resolveEnemyActionTargets(
    participants,
    actor,
    action,
    target,
  );
  if (actionTargets.length === 0) {
    return settleEnemyPass({ ...working, participants }, actor);
  }

  if (isSkillSealed(actor, action.mpCost ?? 0) || actor.mp.current < (action.mpCost ?? 0)) {
    return settleEnemyPass({ ...working, participants }, actor);
  }
  const participantsBeforeAction = participants.map(cloneParticipant);
  let actionOutcomes: BattleActionOutcome[] = [];
  for (const actionTarget of actionTargets) {
    if (execution != null) {
      actionOutcomes.push({
        type: "hit", tags: [], actorId: actor.id,
        primaryTargetId: actionTarget.id, finalTargetId: actionTarget.id,
        hpDelta: -actionTarget.hp.current,
      });
      continue;
    }
    if (action.skillId === "102" && !(actionTarget.statusEffects ?? []).some((effect) => effect.effectId === "sleep")) {
      actionOutcomes.push({ type: "status_no_effect", tags: [], actorId: actor.id, finalTargetId: actionTarget.id });
      continue;
    }
    const outcomes = action.category === "heal" || action.category === "support"
      ? buildEnemyRecoveryOutcomes(actor, actionTarget, action)
      : buildAttackOutcomes({
          actorId: actor.id, actor, targetId: actionTarget.id, target: actionTarget,
          skillPower: action.basePower, skillElement: action.element, skillAccuracy: action.accuracy,
          statDriver: action.statDriver, skillCategory: action.category, skillCritRate: action.critRate,
          hitCount: action.hitCount, hitCountMax: action.hitCountMax,
          pierceResistanceWhenCharged: action.pierceResistanceWhenCharged,
        });
    if ((action.category === "physical" || action.category === "magic") &&
      outcomes.some((outcome) => outcome.type === "hit" && outcome.finalTargetId === actionTarget.id)) {
      const appliedStatusEffects = rollStatusPayloads(actor, actionTarget, action.statusEffects);
      if (appliedStatusEffects.length > 0) outcomes.push({
        type: "hit", tags: [], actorId: actor.id, primaryTargetId: actionTarget.id,
        finalTargetId: actionTarget.id, appliedStatusEffects,
      });
    }
    actionOutcomes.push(...outcomes);
  }
  if (execution == null) appendBoostConsumption(actor, action.category, actionOutcomes);
  if ((action.mpCost ?? 0) > 0) actionOutcomes.push({
    type: "hit", tags: [], actorId: actor.id, finalTargetId: actor.id, mpDelta: -action.mpCost!,
  });
  actionOutcomes = protectStatusOutcomes(participants, actionOutcomes);
  participants = refreshBattleStatus({
    ...working, participants: applyBattleOutcomes(participants, actionOutcomes, statusPhaseIndex(working)),
  }).participants;

  if (execution != null) {
    // Report settled HP loss, including Endure, rather than the lethal request.
    actionOutcomes = actionOutcomes.map((outcome) => ({
      ...outcome,
      hpDelta: participants.find((participant) => participant.id === outcome.finalTargetId)!.hp.current
        - participantsBeforeAction.find((participant) => participant.id === outcome.finalTargetId)!.hp.current,
    }));
    working = applyBossBattleEvent({ ...working, participants }, {
      type: "hidden_execution_resolved", failure: execution.failure,
    });
  }

  if (trace) trace.action = {
    actorId: actor.id, actionId: "basic-skill", contentId: action.skillId,
    name: action.name, category: action.category, element: action.element,
    targetType: action.targetType, outcomes: actionOutcomes,
  };
  const actionLog = createEnemySkillLogEntry(
    working.turnCount ?? 1,
    actor,
    actionTargets[0]!,
    action.name,
    actionOutcomes,
    participants,
  );
  let actionSnapshot: BattleSnapshot = {
    ...working,
    participants,
    battleLog: appendBattleLogs(working, [actionLog]),
  };
  actionSnapshot = emitBossActionEvents(
    actionSnapshot,
    actor.id,
    action.skillId ?? "enemy_attack",
    action.element,
    actionOutcomes,
    participants,
    participantsBeforeAction,
  );
  participants = actionSnapshot.participants.map(cloneParticipant);
  actionSnapshot = { ...actionSnapshot, participants };

  const allPlayersDefeated = participants
    .filter((participant) => participant.side === "player")
    .every((participant) => participant.isDown);
  if (allPlayersDefeated) {
    return createImmediateEnemyResult(actionSnapshot, "defeat");
  }
  const allEnemiesDefeated = participants
    .filter((participant) => participant.side === "enemy")
    .every((participant) => participant.isDown);
  if (allEnemiesDefeated) {
    return createImmediateEnemyResult(actionSnapshot, "victory");
  }

  const aggregate = aggregatePressTurnOutcome(actionOutcomes) ?? {
    outcomeType: "hit" as const,
    tags: [],
  };
  const settlement = settlePressTurnResultByOutcome(
    actionSnapshot.pressTurn,
    aggregate.outcomeType,
    aggregate.tags,
  );
  const settledSnapshot = {
    ...actionSnapshot,
    pressTurn: settlement.after,
  };
  if (isPressTurnExhausted(settledSnapshot.pressTurn)) {
    return finishEnemyTurn(settledSnapshot);
  }

  const nextActorId = findNextEligibleActorId(
    queue,
    participants,
    actor.id,
  );
  return nextActorId == null
    ? finishEnemyTurn(settledSnapshot)
    : {
        ...settledSnapshot,
        lifecycleState: "ACTIVE",
        phase: "ENEMY_TURN",
        currentActorId: nextActorId,
      };
}

// ── Detailed action resolution ──

/**
 * Resolve target participants based on the skill's targetType.
 * For single-target types, returns the selected target.
 * For multi-target types, returns all matching non-down participants.
 * For self-target, returns the actor.
 */
function resolveTargets(
  snapshot: BattleSnapshot,
  actor: BattleParticipant,
  targetType: import("@/types/content").SkillTargetType,
): BattleParticipant[] {
  switch (targetType) {
    case "single_enemy": {
      const singleEnemy = snapshot.participants.find(
        (p) => p.id === snapshot.selectedTargetId && p.side === "enemy" && !p.isDown,
      );
      return singleEnemy != null ? [singleEnemy] : [];
    }
    case "single_ally": {
      const singleAlly = snapshot.participants.find(
        (p) => p.id === snapshot.selectedTargetId && p.side === "player" && p.isActive && !p.isDown,
      );
      return singleAlly != null ? [singleAlly] : [];
    }
    case "all_enemies": {
      return snapshot.participants.filter(
        (p) => p.side === "enemy" && p.isActive && !p.isDown,
      );
    }
    case "all_allies": {
      return snapshot.participants.filter(
        (p) => p.side === "player" && p.isActive && !p.isDown,
      );
    }
    case "self": {
      return [actor];
    }
    default:
      return [];
  }
}

export function resolveSelectedBattleActionToResolution(
  snapshot: BattleSnapshot,
): BattleActionResolution {
  const actorId = snapshot.currentActorId ?? "unknown-actor";
  const actionId = snapshot.selectedActionId ?? "attack";
  const selectedActor = snapshot.participants.find((participant) => participant.id === actorId);
  if (selectedActor != null && (selectedActor.isDown || selectedActor.canAct === false ||
    isDisabledByAilment(selectedActor.statusEffects ?? []) ||
    (selectedActor.statusEffects ?? []).some((effect) => effect.effectId === "paralyze" && effect.paralysisBlocked))) {
    return {
      ok: false, validationError: "actor_disabled", actorId, actionId,
      outcomes: [], verboseLog: [], summaryLog: [],
    };
  }

  if (snapshot.phase !== "PLAYER_COMMAND") {
    return {
      ok: false,
      validationError: "phase_invalid",
      actorId,
      actionId,
      intendedTargetId: snapshot.selectedTargetId,
      outcomes: [],
      verboseLog: [],
      summaryLog: [],
    };
  }

  if (snapshot.selectedActionId == null) {
    return {
      ok: false,
      validationError: "action_not_found",
      actorId,
      actionId,
      intendedTargetId: snapshot.selectedTargetId,
      outcomes: [],
      verboseLog: [],
      summaryLog: [],
    };
  }

  const definition = getBattleActionDefinition(snapshot.selectedActionId);

  // Pass
  if (definition.resolutionKind === "pass") {
    const actor = snapshot.participants.find((participant) => participant.id === actorId);
    const passResult = actor?.accessoryEffects?.includes("pass_free") === true
      ? {
          kind: "no_change" as const,
          reason: "pass" as const,
          before: { ...snapshot.pressTurn, icons: snapshot.pressTurn.icons.map((icon) => ({ ...icon })) },
          after: { ...snapshot.pressTurn, icons: snapshot.pressTurn.icons.map((icon) => ({ ...icon })) },
        }
      : settlePassPressTurn(snapshot.pressTurn);
    return {
      ok: true,
      actorId,
      actionId: definition.id,
      intendedTargetId: snapshot.selectedTargetId,
      outcomes: [],
      pressTurnResult: passResult,
      verboseLog: [`${actorId}传递了行动。`],
      summaryLog: ["传递行动"],
    };
  }

  // Swap
  if (definition.resolutionKind === "swap") {
    return createSwapResolution(snapshot);
  }

  // Guard
  if (definition.resolutionKind === "guard") {
    // Route through skill pipeline, default to skill "130" (防御)
    const contentId = snapshot.selectedContentId ?? "130";
    let guardSkill: ReturnType<typeof getSkill>;
    try {
      guardSkill = getSkill(contentId);
    } catch {
      return {
        ok: false,
        validationError: "action_not_found",
        actorId,
        actionId: definition.id,
        contentId,
        intendedTargetId: snapshot.selectedTargetId,
        outcomes: [],
        verboseLog: [],
        summaryLog: [],
      };
    }

    const guardActor = snapshot.participants.find((p) => p.id === actorId);

    if (guardActor != null && guardActor.mp.current < guardSkill.mpCost) {
      return {
        ok: false,
        validationError: "insufficient_mp",
        actorId,
        actionId: definition.id,
        contentId,
        intendedTargetId: snapshot.selectedTargetId,
        outcomes: [],
        verboseLog: [],
        summaryLog: [],
      };
    }

    const guardOutcome: BattleActionOutcome = {
      type: "hit",
      tags: [],
      actorId,
      primaryTargetId: actorId,
      finalTargetId: actorId,
    };

    if (guardSkill.statusEffects != null && guardSkill.statusEffects.length > 0) {
      guardOutcome.appliedStatusEffects = guardSkill.statusEffects.map((se) => ({
        effectId: se.effectId,
        duration: getStatusEffectMap().get(se.effectId)?.duration ?? GUARD_EFFECT_DURATION,
      }));
    }

    return {
      ...createPressTurnResolutionForOutcomes(snapshot, [guardOutcome]),
      actionId: definition.id,
      contentId,
      intendedTargetId: snapshot.selectedTargetId,
      verboseLog: [`${actorId}采取防御。`],
      summaryLog: ["防御"],
    };
  }

  // No selection mode action
  if (definition.selectionMode === "none") {
    return {
      ok: true,
      actorId,
      actionId: definition.id,
      intendedTargetId: snapshot.selectedTargetId,
      outcomes: [],
      verboseLog: [],
      summaryLog: [],
    };
  }

  // Target validation
  if (snapshot.selectedTargetId == null) {
    return {
      ok: false,
      validationError: "target_required",
      actorId,
      actionId: definition.id,
      intendedTargetId: snapshot.selectedTargetId,
      outcomes: [],
      verboseLog: [],
      summaryLog: [],
    };
  }

  const target = snapshot.participants.find(
    (p) => p.id === snapshot.selectedTargetId,
  );
  if (target == null) {
    return {
      ok: false,
      validationError: "target_not_found",
      actorId,
      actionId: definition.id,
      intendedTargetId: snapshot.selectedTargetId,
      outcomes: [],
      verboseLog: [],
      summaryLog: [],
    };
  }

  if (!definition.allowedSides.includes(target.side) || target.isDown) {
    // Allow downed targets for revive skills
    let isReviveTarget = false;
    if (target.isDown && definition.resolutionKind === "skill" && snapshot.selectedContentId != null) {
      try {
        const maybeReviveSkill = getSkill(snapshot.selectedContentId);
        isReviveTarget = maybeReviveSkill.revives === true;
      } catch {
        // Skill not found, not a revive target
      }
    }
    // Allow downed targets for revive items
    if (target.isDown && definition.resolutionKind === "item" && snapshot.selectedContentId != null) {
      try {
        const maybeReviveItem = getItem(snapshot.selectedContentId);
        isReviveTarget = maybeReviveItem.revivePercent != null;
      } catch {
        // Item not found, not a revive target
      }
    }

    if (!isReviveTarget) {
      return {
        ok: false,
        validationError: "target_not_allowed",
        actorId,
        actionId: definition.id,
        intendedTargetId: snapshot.selectedTargetId,
        outcomes: [],
        verboseLog: [],
        summaryLog: [],
      };
    }
  }

  const actor = snapshot.participants.find((p) => p.id === actorId);

  // ── Skill resolution (content-driven) ──

  if (definition.resolutionKind === "skill") {
    // Backward compat: if no contentId, use old hardcoded placeholder behavior
    if (snapshot.selectedContentId == null) {
      if (actor != null && isSkillSealed(actor, 3)) {
        return { ok: false, validationError: "skill_sealed", actorId, actionId, outcomes: [], verboseLog: [], summaryLog: [] };
      }
      // Old placeholder: fixed 2 damage, 3 MP cost
      if (actor != null && actor.mp.current < 3) {
        return {
          ok: false,
          validationError: "insufficient_mp",
          actorId,
          actionId: definition.id,
          intendedTargetId: snapshot.selectedTargetId,
          outcomes: [],
          verboseLog: [],
          summaryLog: [],
        };
      }

      const outcome: BattleActionOutcome = {
        type: "hit",
        tags: [],
        actorId,
        primaryTargetId: snapshot.selectedTargetId,
        finalTargetId: snapshot.selectedTargetId,
        hpDelta: -2,
      };
      const mpOutcome: BattleActionOutcome = {
        type: "hit",
        tags: [],
        actorId,
        primaryTargetId: actorId,
        finalTargetId: actorId,
        mpDelta: -3,
      };

      return {
        ...createPressTurnResolutionForOutcomes(snapshot, [outcome, mpOutcome]),
        actionId: definition.id,
        intendedTargetId: snapshot.selectedTargetId,
        verboseLog: [
          `${actorId}对${snapshot.selectedTargetId}使用基础技能。`,
        ],
        summaryLog: ["使用基础技能"],
      };
    }

    const contentId = snapshot.selectedContentId;
    let skillContent: ReturnType<typeof getSkill>;

    try {
      skillContent = getSkill(contentId);
    } catch {
      return {
        ok: false,
        validationError: "action_not_found",
        actorId,
        actionId: definition.id,
        contentId,
        intendedTargetId: snapshot.selectedTargetId,
        outcomes: [],
        verboseLog: [],
        summaryLog: [],
      };
    }

    if (actor != null && isSkillSealed(actor, skillContent.mpCost)) {
      return { ok: false, validationError: "skill_sealed", actorId, actionId, outcomes: [], verboseLog: [], summaryLog: [] };
    }
    // MP check
    if (actor != null && actor.mp.current < skillContent.mpCost) {
      return {
        ok: false,
        validationError: "insufficient_mp",
        actorId,
        actionId: definition.id,
        contentId,
        intendedTargetId: snapshot.selectedTargetId,
        outcomes: [],
        verboseLog: [],
        summaryLog: [],
      };
    }

    // Heal skills
    if (skillContent.category === "heal") {
      const outcomes: BattleActionOutcome[] = [];
      const targets = skillContent.revives
        // For revive skills, look up the selected target directly (may be down)
        ? (snapshot.participants.filter((p) => p.id === snapshot.selectedTargetId))
        : resolveTargets(snapshot, actor ?? { id: actorId } as BattleParticipant, skillContent.targetType);

      // Guard: no valid targets — skip MP cost and press turn consumption
      if (targets.length === 0) {
        return {
          ok: false,
          validationError: "no_valid_targets",
          actorId,
          actionId,
          outcomes: [],
          verboseLog: [`${actorId}使用${skillContent.name}时没有有效目标。`],
          summaryLog: [],
        };
      }

      for (const healTarget of targets) {
        // Calculate heal amount
        const healAmount = skillContent.healPercent != null
          ? Math.round(healTarget.hp.max * skillContent.healPercent / 100)
          : skillContent.power;

        // Revive: if target is down and skill has revives, revive them
        let reviveHp = 0;
        if (skillContent.revives && healTarget.isDown) {
          reviveHp = healAmount;
        }

        const removedStatusEffectIds = resolveCleansedStatusEffectIds(
          healTarget,
          skillContent.cleanses,
        );
        outcomes.push({
          type: "hit" as const,
          tags: [],
          actorId,
          primaryTargetId: healTarget.id,
          finalTargetId: healTarget.id,
          hpDelta: reviveHp > 0 ? reviveHp : healAmount,
          ...(removedStatusEffectIds.length === 0 ? {} : { removedStatusEffectIds }),
        });
      }

      // Status effects (buff/debuff for heal skills)
      if (skillContent.statusEffects != null && skillContent.statusEffects.length > 0) {
        const appliedEffects: AppliedStatusEffectPayload[] = [];
        const effectMap = getStatusEffectMap();

        for (const se of skillContent.statusEffects) {
          const actorPassives = collectPassives(actor?.passiveEffects);
          const chanceCtx = applyPassivesAtHook(actorPassives, "on_status_chance", {
            chance: se.chance,
          }) as { chance: number };
          if (Math.random() * 100 < chanceCtx.chance) {
            const effectContent = effectMap.get(se.effectId);
            const duration = effectContent?.duration ?? 3;
            appliedEffects.push({ effectId: se.effectId, duration });
          }
        }

        if (appliedEffects.length > 0) {
          for (const healTarget of targets) {
            if (!healTarget.isDown) {
              outcomes.push({
                type: "hit" as const,
                tags: [],
                actorId,
                primaryTargetId: healTarget.id,
                finalTargetId: healTarget.id,
                appliedStatusEffects: appliedEffects,
              });
            }
          }
        }
      }

      // MP cost applied once
      if (skillContent.mpCost > 0) {
        outcomes.push({
          type: "hit" as const,
          tags: [],
          actorId,
          primaryTargetId: actorId,
          finalTargetId: actorId,
          mpDelta: -skillContent.mpCost,
        });
      }

      return {
        ...createPressTurnResolutionForOutcomes(snapshot, outcomes),
        actionId: definition.id,
        contentId,
        intendedTargetId: snapshot.selectedTargetId,
        verboseLog: [
          `${actorId}使用${skillContent.name}。`,
        ],
        summaryLog: [`使用${skillContent.name}`],
      };
    }

    // Support skills (status effect application)
    if (skillContent.category === "support") {
      if (!actor) {
        return {
          ok: false,
          validationError: "actor_not_found",
          actorId,
          actionId: definition.id,
          contentId,
          intendedTargetId: snapshot.selectedTargetId,
          outcomes: [],
          verboseLog: [`[BATTLE] 未找到行动者 ${actorId}`],
          summaryLog: [],
        };
      }

      const outcomes: BattleActionOutcome[] = [];

      // Resolve targets for multi-target support skills
      const supportTargets = resolveTargets(
        snapshot,
        actor,
        skillContent.targetType,
      );

      // Guard: no valid targets — skip MP cost and press turn consumption
      if (supportTargets.length === 0 && skillContent.targetType !== "self") {
        return {
          ok: false,
          validationError: "no_valid_targets",
          actorId,
          actionId,
          outcomes: [],
          verboseLog: [`${actorId}使用${skillContent.name}时没有有效目标。`],
          summaryLog: [],
        };
      }

      for (const supportTarget of supportTargets) {
        const appliedEffects = rollStatusPayloads(actor, supportTarget, skillContent.statusEffects);
        const removedStatusEffectIds = resolveCleansedStatusEffectIds(
          supportTarget,
          skillContent.cleanses,
        );
        if (appliedEffects.length > 0 || removedStatusEffectIds.length > 0) {
          outcomes.push({
            type: "hit" as const,
            tags: [],
            actorId,
            primaryTargetId: supportTarget.id,
            finalTargetId: supportTarget.id,
            ...(appliedEffects.length === 0 ? {} : { appliedStatusEffects: appliedEffects }),
            ...(removedStatusEffectIds.length === 0 ? {} : { removedStatusEffectIds }),
          });
        }
      }

      // MP cost applied once
      if (skillContent.mpCost > 0) {
        outcomes.push({
          type: "hit" as const,
          tags: [],
          actorId,
          primaryTargetId: actorId,
          finalTargetId: actorId,
          mpDelta: -skillContent.mpCost,
        });
      }

      return {
        ...createPressTurnResolutionForOutcomes(snapshot, outcomes),
        actionId: definition.id,
        contentId,
        intendedTargetId: snapshot.selectedTargetId,
        verboseLog: [
          `${actorId}使用${skillContent.name}。`,
        ],
        summaryLog: [`使用${skillContent.name}`],
      };
    }

    // Offensive skills (physical / magic)
    if (actor == null) {
      return {
        ok: false,
        validationError: "action_not_found",
        actorId,
        actionId: definition.id,
        contentId,
        intendedTargetId: snapshot.selectedTargetId,
        outcomes: [],
        verboseLog: [],
        summaryLog: [],
      };
    }

    // Resolve targets for multi-target offensive skills
    const offensiveTargets = resolveTargets(snapshot, actor, skillContent.targetType);
    const outcomes: BattleActionOutcome[] = [];

    for (const offenseTarget of offensiveTargets) {
      if (contentId === "102" && !(offenseTarget.statusEffects ?? []).some((effect) => effect.effectId === "sleep")) {
        outcomes.push({ type: "status_no_effect", tags: [], actorId, finalTargetId: offenseTarget.id });
        continue;
      }
      const appliedEffects = rollStatusPayloads(actor, offenseTarget, skillContent.statusEffects);
      const targetOutcomes = buildAttackOutcomes({
        actorId,
        actor,
        targetId: offenseTarget.id,
        target: offenseTarget,
        skillPower: skillContent.mpDrainAmount != null ? 1 : skillContent.power,
        skillElement: skillContent.element,
        skillAccuracy: skillContent.accuracy,
        pierceResistanceWhenCharged: skillContent.pierceResistanceWhenCharged,
        statDriver: skillContent.statDriver,
        skillCritRate: skillContent.critRate,
        hitCount: skillContent.hitCount,
        hitCountMax: skillContent.hitCountMax,
        skillCategory: skillContent.category,
      });

      if (skillContent.mpDrainAmount != null) {
        const landed = targetOutcomes.some(
          (outcome) => outcome.type === "hit" && (outcome.hpDelta ?? 0) < 0,
        );
        outcomes.push(...targetOutcomes.filter((outcome) => (outcome.hpDelta ?? 0) >= 0));
        if (landed) {
          const casterMpAfterCost = Math.max(0, actor.mp.current - skillContent.mpCost);
          const transfer = Math.min(
            skillContent.mpDrainAmount,
            offenseTarget.mp.current,
            Math.max(0, actor.mp.max - casterMpAfterCost),
          );
          if (transfer > 0) {
            outcomes.push(
              {
                type: "hit", tags: [], actorId,
                primaryTargetId: offenseTarget.id, finalTargetId: offenseTarget.id,
                mpDelta: -transfer,
              },
              {
                type: "hit", tags: [], actorId,
                primaryTargetId: actorId, finalTargetId: actorId,
                mpDelta: transfer,
              },
            );
          }
        }
        continue;
      }

      outcomes.push(...targetOutcomes);
      if (skillContent.hpDrainPercent != null) {
        const actualDamage = Math.min(
          offenseTarget.hp.current,
          targetOutcomes.reduce(
            (total, outcome) => total + (outcome.finalTargetId === offenseTarget.id && outcome.type === "hit"
              ? Math.max(0, -(outcome.hpDelta ?? 0)) : 0),
            0,
          ),
        );
        const healing = Math.min(
          Math.max(0, actor.hp.max - actor.hp.current),
          Math.floor(actualDamage * skillContent.hpDrainPercent / 100),
        );
        if (healing > 0) {
          outcomes.push({
            type: "hit", tags: [], actorId,
            primaryTargetId: actorId, finalTargetId: actorId,
            hpDelta: healing,
          });
        }
      }

      // Apply status effects if the target was damaged
      if (appliedEffects.length > 0 && !offenseTarget.isDown) {
        const wasDamaged = targetOutcomes.some(
          (o) => o.type === "hit" && o.finalTargetId === offenseTarget.id,
        );
        if (wasDamaged) {
          outcomes.push({
            type: "hit" as const,
            tags: [],
            actorId,
            primaryTargetId: offenseTarget.id,
            finalTargetId: offenseTarget.id,
            appliedStatusEffects: appliedEffects,
          });
        }
      }
    }

    appendBoostConsumption(actor, skillContent.category, outcomes);

    // MP cost outcome (applied once, not per target)
    if (skillContent.mpCost > 0) {
      outcomes.push({
        type: "hit" as const,
        tags: [],
        actorId,
        primaryTargetId: actorId,
        finalTargetId: actorId,
        mpDelta: -skillContent.mpCost,
      });
    }

    return {
      ...createPressTurnResolutionForOutcomes(snapshot, outcomes),
      actionId: definition.id,
      contentId,
      intendedTargetId: snapshot.selectedTargetId,
      verboseLog: [
        `${actorId}使用${skillContent.name}。`,
      ],
      summaryLog: [`使用${skillContent.name}`],
    };
  }

    // ── Item resolution (content-driven) ──

  if (definition.resolutionKind === "item") {
    if (snapshot.selectedContentId == null) {
      const outcome: BattleActionOutcome = {
        type: "hit",
        tags: [],
        actorId,
        primaryTargetId: snapshot.selectedTargetId,
        finalTargetId: snapshot.selectedTargetId,
        hpDelta: 2,
      };

      return {
        ...createPressTurnResolutionForOutcomes(snapshot, [outcome]),
        actionId: definition.id,
        intendedTargetId: snapshot.selectedTargetId,
        verboseLog: [
          `${actorId}对${snapshot.selectedTargetId}使用基础道具。`,
        ],
        summaryLog: ["使用基础道具"],
      };
    }

    const contentId = snapshot.selectedContentId;
    let itemContent: ReturnType<typeof getItem>;

    try {
      itemContent = getItem(contentId);
    } catch {
      return {
        ok: false,
        validationError: "action_not_found",
        actorId,
        actionId: definition.id,
        contentId,
        intendedTargetId: snapshot.selectedTargetId,
        outcomes: [],
        verboseLog: [],
        summaryLog: [],
      };
    }

    const target = snapshot.participants.find(
      (p) => p.id === snapshot.selectedTargetId,
    );
    if (target == null) {
      return {
        ok: false,
        validationError: "target_not_found",
        actorId,
        actionId: definition.id,
        contentId,
        intendedTargetId: snapshot.selectedTargetId,
        outcomes: [],
        verboseLog: [],
        summaryLog: [],
      };
    }

    const outcomes: BattleActionOutcome[] = [];

    // Revive
    if (itemContent.revivePercent != null) {
      if (target.isDown) {
        const reviveAmount = Math.round(target.hp.max * itemContent.revivePercent / 100);
        outcomes.push({
          type: "hit" as const,
          tags: [],
          actorId,
          primaryTargetId: target.id,
          finalTargetId: target.id,
          hpDelta: reviveAmount,
        });
      }
    }

    // Heal HP (skip if target is down unless revived above)
    if (itemContent.healHp != null && !target.isDown) {
      outcomes.push({
        type: "hit" as const,
        tags: [],
        actorId,
        primaryTargetId: target.id,
        finalTargetId: target.id,
        hpDelta: itemContent.healHp,
      });
    }

    // Heal MP
    if (itemContent.healMp != null && !target.isDown) {
      outcomes.push({
        type: "hit" as const,
        tags: [],
        actorId,
        primaryTargetId: target.id,
        finalTargetId: target.id,
        mpDelta: itemContent.healMp,
      });
    }

    // Remove status effects
    if (itemContent.removeStatus != null && itemContent.removeStatus.length > 0 && !target.isDown) {
      outcomes.push({
        type: "hit" as const,
        tags: [],
        actorId,
        primaryTargetId: target.id,
        finalTargetId: target.id,
        removedStatusEffectIds: itemContent.removeStatus,
      });
    }

    // Fixed bases skip ATK/INT scaling, not shields or guard.
    if (itemContent.damageFixed != null) {
      const element = itemContent.element == null ? BATTLE_ELEMENTS.None
        : BATTLE_ELEMENTS[itemContent.element as keyof typeof BATTLE_ELEMENTS] ?? BATTLE_ELEMENTS.None;
      const params = getFormulaParams();
      const guarding = (target.statusEffects ?? []).some((effect) => effect.effectId === "guard");
      const guardDamage = (damage: number) => guarding ? calculateGuardReduction(damage, params.guard) : damage;
      const affinities = applyPassiveAffinities(collectPassives(target.passiveEffects), target.affinities ?? {
        weak: 0, resist: 0, nullify: 0, reflect: 0, absorb: 0,
      });
      const affinity = resolveAffinityResult(affinities, element);
      const shield = checkShield(target.statusEffects ?? [], element);
      const base = { actorId, primaryTargetId: target.id, finalTargetId: target.id };
      if (shield.blocked && shield.kind != null) {
        const nominalAffinity = ["nullify", "reflect", "absorb"].includes(affinity) || (guarding && affinity === "weak")
          ? params.affinity.normal : resolveAffinityMultiplier(affinities, element, params.affinity);
        const nominalDamage = guardDamage(Math.round(itemContent.damageFixed * nominalAffinity));
        outcomes.push({
          ...base, type: shield.kind === "nullify" ? "block" : shield.kind, tags: [],
          preventedBy: shield.kind, consumedShieldEffectId: shield.shieldEffectId,
          ...(shield.kind === "absorb" && !target.isDown ? { hpDelta: nominalDamage } : {}),
        });
        if (shield.kind === "reflect") outcomes.push({
          ...base, type: "reflect", tags: [], finalTargetId: actorId, hpDelta: -nominalDamage, preventedBy: "reflect",
        });
      } else {
        const affinityOutcome = element === BATTLE_ELEMENTS.None ? { outcomeType: null }
          : resolveAffinityOutcomeType(affinities, element);
        if (affinityOutcome.outcomeType != null) {
          outcomes.push({ ...base, type: affinityOutcome.outcomeType, tags: [], preventedBy: affinityOutcome.preventedBy });
        } else {
          const multiplier = element === BATTLE_ELEMENTS.None || (guarding && affinity === "weak")
            ? params.affinity.normal : resolveAffinityMultiplier(affinities, element, params.affinity);
          outcomes.push({ ...base, type: "hit", tags: [], hpDelta: -guardDamage(Math.round(itemContent.damageFixed * multiplier)) });
        }
      }
    }

    // Status effects (buff/debuff)
    if (itemContent.statusEffects != null && itemContent.statusEffects.length > 0 && !target.isDown) {
      const appliedEffects: AppliedStatusEffectPayload[] = [];
      const effectMap = getStatusEffectMap();

      for (const se of itemContent.statusEffects) {
        if (Math.random() * 100 < statusChanceForTarget(target, se.effectId, se.chance)) {
          const effectContent = effectMap.get(se.effectId);
          const duration = effectContent?.duration ?? 3;
          appliedEffects.push({ effectId: se.effectId, duration });
        }
      }

      if (appliedEffects.length > 0) {
        outcomes.push({
          type: "hit" as const,
          tags: [],
          actorId,
          primaryTargetId: target.id,
          finalTargetId: target.id,
          appliedStatusEffects: appliedEffects,
        });
      }
    }

    return {
      ...createPressTurnResolutionForOutcomes(snapshot, outcomes),
      actionId: definition.id,
      contentId,
      intendedTargetId: snapshot.selectedTargetId,
      consumedItemId: contentId,
      verboseLog: [
        `${actorId}对${snapshot.selectedTargetId}使用${itemContent.name}。`,
      ],
      summaryLog: [`使用${itemContent.name}`],
    };
  }

// ── Attack resolution (content-driven) ──

  if (definition.resolutionKind !== "attack") {
    return {
      ok: true,
      actorId,
      actionId: definition.id,
      intendedTargetId: snapshot.selectedTargetId,
      outcomes: [],
      verboseLog: [],
      summaryLog: [],
    };
  }

  // Route "attack" through the skill pipeline with default contentId
  const contentId = snapshot.selectedContentId ?? "0";
  let skillContent: ReturnType<typeof getSkill>;
  try {
    skillContent = getSkill(contentId);
  } catch {
    return {
      ok: false,
      validationError: "action_not_found",
      actorId,
      actionId: definition.id,
      contentId,
      intendedTargetId: snapshot.selectedTargetId,
      outcomes: [],
      verboseLog: [],
      summaryLog: [],
    };
  }

  if (actor != null && actor.mp.current < skillContent.mpCost) {
    return {
      ok: false,
      validationError: "insufficient_mp",
      actorId,
      actionId: definition.id,
      contentId,
      intendedTargetId: snapshot.selectedTargetId,
      outcomes: [],
      verboseLog: [],
      summaryLog: [],
    };
  }

  const outcomes = buildAttackOutcomes({
    actorId,
    actor: actor ?? {
      id: actorId,
      side: "player" as const,
      displayName: actorId,
      level: 1,
      hp: { current: 1, max: 1 },
      mp: { current: 0, max: 0 },
      isDown: false,
      isActive: true,
    },
    targetId: snapshot.selectedTargetId,
    target,
    skillPower: skillContent.power,
    skillElement: skillContent.element,
    skillAccuracy: skillContent.accuracy,
    statDriver: skillContent.statDriver,
    skillCritRate: skillContent.critRate,
    hitCount: skillContent.hitCount,
    hitCountMax: skillContent.hitCountMax,
    skillCategory: skillContent.category,
  });

  // Status effects (buff/debuff for attack skills)
  if (skillContent.statusEffects != null && skillContent.statusEffects.length > 0 && !target.isDown) {
    const wasDamaged = outcomes.some(
      (o) => o.type === "hit" && o.finalTargetId === target.id,
    );
    if (wasDamaged) {
      const appliedEffects: AppliedStatusEffectPayload[] = [];
      const effectMap = getStatusEffectMap();

      for (const se of skillContent.statusEffects) {
        const actorPassives = collectPassives(actor?.passiveEffects);
        const chanceCtx = applyPassivesAtHook(actorPassives, "on_status_chance", {
          chance: se.chance,
        }) as { chance: number };
        if (Math.random() * 100 < statusChanceForTarget(target, se.effectId, chanceCtx.chance)) {
          const effectContent = effectMap.get(se.effectId);
          const duration = effectContent?.duration ?? 3;
          appliedEffects.push({ effectId: se.effectId, duration });
        }
      }

      if (appliedEffects.length > 0) {
        outcomes.push({
          type: "hit" as const,
          tags: [],
          actorId,
          primaryTargetId: target.id,
          finalTargetId: target.id,
          appliedStatusEffects: appliedEffects,
        });
      }
    }
  }

  if (actor != null) appendBoostConsumption(actor, skillContent.category, outcomes);

  if (skillContent.mpCost > 0) {
    outcomes.push({
      type: "hit",
      tags: [],
      actorId,
      primaryTargetId: actorId,
      finalTargetId: actorId,
      mpDelta: -skillContent.mpCost,
    });
  }

  return {
    ...createPressTurnResolutionForOutcomes(snapshot, outcomes),
    actionId: definition.id,
    contentId,
    intendedTargetId: snapshot.selectedTargetId,
    verboseLog: [
      `${actorId}对${snapshot.selectedTargetId}使用${skillContent.name}。`,
    ],
    summaryLog: [`使用${skillContent.name}`],
  };
}
