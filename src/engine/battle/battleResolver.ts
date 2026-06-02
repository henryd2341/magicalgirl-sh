import { resolveAffinityResult } from "@/engine/battle/battleAffinity";
import { getBattleActionDefinition } from "@/engine/battle/battleActionCatalog";
import {
  appendBattleLogs,
  createBattleResultLogEntry,
  createEnemyAttackLogEntry,
  createPlayerActionLogEntry,
  createPlayerRoundStartLogEntry,
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
  isDisabledByAilment,
  isParalyzed,
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
import type {
  ActiveStatusEffect,
  AppliedStatusEffectPayload,
  BattleActionOutcome,
  BattleActionResolution,
  BattleLogEntry,
  BattleParticipant,
  BattleResult,
  BattleSnapshot,
} from "@/types/battle";

// ── Guard status effect ID (from content) ──

const GUARD_EFFECT_ID = "guard";
const GUARD_EFFECT_DURATION = 1;

// ── Participant cloning ──

function cloneParticipant(participant: BattleParticipant): BattleParticipant {
  const cloned: BattleParticipant = {
    ...participant,
    hp: { ...participant.hp },
    mp: { ...participant.mp },
    statusEffects: (participant.statusEffects ?? []).map((e) => ({ ...e })),
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
): BattleParticipant {
  if (participant.id !== outcome.finalTargetId) {
    return participant;
  }

  const nextHpCurrent = Math.min(
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
      const content = effectMap.get(payload.effectId);
      if (content != null) {
        const result = applyStatusEffect(statusEffects, payload.effectId, payload.duration, content);
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

  // Endure check: intercept death via passive before marking isDown
  let finalHp = nextHpCurrent;
  let endureUsed = participant.endureUsed ?? false;
  if (finalHp <= 0 && !endureUsed) {
    const passives = collectPassives(participant.passiveEffects);
    const ctx = applyPassivesAtHook(passives, "on_death_check", {
      hpAfterDamage: finalHp,
      endureUsed,
    }) as { hpAfterDamage: number; endureUsed: boolean };
    finalHp = ctx.hpAfterDamage;
    endureUsed = ctx.endureUsed;
  }

  return {
    ...participant,
    hp: { ...participant.hp, current: finalHp },
    mp: { ...participant.mp, current: nextMpCurrent },
    isDown: finalHp <= 0,
    statusEffects,
    endureUsed,
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
): BattleParticipant[] {
  return participants.map((participant) => {
    const clonedParticipant = cloneParticipant(participant);
    return outcomes.reduce(
      (currentParticipant, outcome) =>
        applyOutcomeToParticipant(currentParticipant, outcome),
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

function hasGuardStatus(participant: BattleParticipant): boolean {
  return (participant.statusEffects ?? []).some((e) => e.effectId === GUARD_EFFECT_ID);
}

// ── Core attack outcome builder ──

interface BuildAttackOutcomesInput {
  actorId: string;
  actor: BattleParticipant;
  targetId: string;
  target: BattleParticipant;
  skillPower: number;
  skillElement: number;
  skillAccuracy: number;
  statDriver: "attack" | "intelligence";
  skillCritRate?: number;
  hitCount?: number;
  hitCountMax?: number;
  skillCategory?: "physical" | "magic" | "heal" | "support" | "passive";
}

function buildAttackOutcomes(
  input: BuildAttackOutcomesInput,
): BattleActionOutcome[] {
  const params = getFormulaParams();
  const { actor, target, skillPower, skillElement, skillAccuracy, statDriver } = input;

  const hitCount = input.hitCount ?? 1;
  const hitCountMax = input.hitCountMax ?? hitCount;
  const actualHits = hitCountMax > hitCount
    ? Math.floor(hitCount + Math.random() * (hitCountMax - hitCount + 0.999))
    : hitCount;

  const outcomes: BattleActionOutcome[] = [];

  const effectMap = getStatusEffectMap();

  for (let i = 0; i < actualHits; i++) {
    // Shield check (before hit roll — shields are absolute)
    if (i === 0) {
      const shieldResult = checkShield(target.statusEffects ?? [], skillElement);
      if (shieldResult.blocked && shieldResult.kind != null) {
        const outcomeType = shieldResult.kind === "nullify" ? "block" :
          shieldResult.kind === "reflect" ? "reflect" : "absorb";
        outcomes.push({
          type: outcomeType as "block" | "reflect" | "absorb",
          tags: [],
          actorId: input.actorId,
          primaryTargetId: input.targetId,
          finalTargetId: input.targetId,
          preventedBy: shieldResult.kind,
          consumedShieldEffectId: shieldResult.shieldEffectId,
        });
        break;
      }
    }

    // Hit check
    const hitChance = calculateHitChance(
      skillAccuracy,
      actor.combatStats?.accuracy ?? 90,
      target.combatStats?.evasion ?? 80,
      params.hitRate,
    );

    if (!rollHit(hitChance)) {
      outcomes.push({
        type: "miss",
        tags: [],
        actorId: input.actorId,
        primaryTargetId: input.targetId,
        finalTargetId: input.targetId,
      });
      break;
    }

    // Affinity check
    const affinityProfile = target.affinities ?? {
      weak: 0, resist: 0, nullify: 0, reflect: 0, absorb: 0,
    };
    // Merge passive affinity modifiers (nullify/resist)
    const targetPassives = collectPassives(target.passiveEffects);
    const mergedAffinities = applyPassiveAffinities(targetPassives, affinityProfile);
    const affinityOutcome = resolveAffinityOutcomeType(mergedAffinities, skillElement);

    if (affinityOutcome.outcomeType != null) {
      outcomes.push({
        type: affinityOutcome.outcomeType,
        tags: [],
        actorId: input.actorId,
        primaryTargetId: input.targetId,
        finalTargetId: input.targetId,
        preventedBy: affinityOutcome.preventedBy,
      });
      break;
    }

    // Affinity multiplier (using merged affinities for passive resist)
    const affinityMult = resolveAffinityMultiplier(
      mergedAffinities,
      skillElement,
      params.affinity,
    );

    // Effective stats (with buffs/debuffs)
    const effectiveStats = computeEffectiveStats(actor, actor.statusEffects ?? [], effectMap);
    const effectiveTargetStats = computeEffectiveStats(target, target.statusEffects ?? [], effectMap);

    // Damage
    const driverStat = (statDriver === "attack" ? effectiveStats.attack : effectiveStats.intelligence) ?? 5;
    const defenderDef = effectiveTargetStats.defense ?? 5;

    let damage = calculateDamage(
      driverStat,
      actor.level ?? 1,
      defenderDef,
      skillPower,
      affinityMult,
      params.damage,
    );

    // Charge/Chant/Focus multiplier (first hit only)
    let guaranteedCrit = false;
    if (i === 0 && input.skillCategory != null) {
      const ccResult = consumeChargeChantFocus(actor.statusEffects ?? [], input.skillCategory);
      if (ccResult.damageMultiplier !== 1) {
        damage = Math.floor(damage * ccResult.damageMultiplier);
      }
      guaranteedCrit = ccResult.guaranteedCrit;
      // Produce removal outcomes for consumed effects
      if (ccResult.effects.length < (actor.statusEffects ?? []).length) {
        const consumedIds = (actor.statusEffects ?? [])
          .filter((e) => !ccResult.effects.some((r) => r.effectId === e.effectId))
          .map((e) => e.effectId);
        if (consumedIds.length > 0) {
          outcomes.push({
            type: "hit",
            tags: [],
            actorId: input.actorId,
            primaryTargetId: input.actorId,
            finalTargetId: input.actorId,
            removedStatusEffectIds: consumedIds,
          });
        }
      }
    }

    // Passive: element boost / damage boost
    const actorHpPercent = actor.hp.max > 0 ? Math.round(actor.hp.current / actor.hp.max * 100) : 100;
    const passives = collectPassives(actor.passiveEffects);
    const dmgCtx = applyPassivesAtHook(passives, "on_damage_calc", {
      damage,
      element: elementBitToName(skillElement),
      actorHpPercent,
    }) as { damage: number; element: string; actorHpPercent: number };
    damage = dmgCtx.damage;

    // Crit check
    const baseCrit = actor.combatStats?.critRate ?? 5;
    const critChance = guaranteedCrit ? 100 : Math.min(params.critRate.max, Math.max(0, baseCrit + (input.skillCritRate ?? 0)));
    const isCrit = rollCrit(critChance);

    // Determine tags
    const tags: BattleActionResolution["outcomes"][0]["tags"] = [];
    const affinityResult = resolveAffinityResult(mergedAffinities, skillElement);

    if (affinityResult === "weak") tags.push("weak");
    if (isCrit) tags.push("critical");

    outcomes.push({
      type: "hit",
      tags,
      actorId: input.actorId,
      primaryTargetId: input.targetId,
      finalTargetId: input.targetId,
      hpDelta: -damage,
    });
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
        ? `${validation.swapOutId} withdrew from the frontline.`
        : `${validation.swapOutId} swapped out for ${validation.swapInId}.`,
    ],
    summaryLog: ["Swap used"],
  };
}

// ── Press turn resolution from outcomes ──

export function createPressTurnResolutionForOutcomes(
  snapshot: BattleSnapshot,
  outcomes: BattleActionOutcome[],
): BattleActionResolution {
  const aggregatedOutcome = aggregatePressTurnOutcome(outcomes);
  return {
    ok: true,
    actorId: snapshot.currentActorId ?? "unknown-actor",
    actionId: snapshot.selectedActionId ?? "attack",
    intendedTargetId: snapshot.selectedTargetId,
    outcomes,
    pressTurnResult:
      aggregatedOutcome == null
        ? undefined
        : settlePressTurnResultByOutcome(
            snapshot.pressTurn,
            aggregatedOutcome.outcomeType,
            aggregatedOutcome.tags,
          ),
    verboseLog: [],
    summaryLog: [],
  };
}

// ── Main action resolver ──

export function resolveSelectedBattleAction(
  snapshot: BattleSnapshot,
): BattleSnapshot {
  const queue = snapshot.pressTurnAllocation?.participantIds ?? [];
  const normalizedActorId = normalizeCurrentActorId(
    queue,
    snapshot.participants,
    snapshot.currentActorId,
  );
  const normalizedSnapshot = {
    ...snapshot,
    currentActorId: normalizedActorId,
  };
  const resolution =
    resolveSelectedBattleActionToResolution(normalizedSnapshot);

  if (!resolution.ok) {
    return normalizedSnapshot;
  }

  if (resolution.outcomes.length === 0 && resolution.pressTurnResult == null) {
    return normalizedSnapshot;
  }

  const participants =
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
        );
  const nextPressTurn =
    resolution.pressTurnResult?.after ?? normalizedSnapshot.pressTurn;
  const allEnemiesDefeated = participants
    .filter((p) => p.side === "enemy")
    .every((p) => p.isDown);
  const allPlayersDefeated = participants
    .filter((p) => p.side === "player")
    .every((p) => p.isDown);
  const playerTurnExhausted = isPressTurnExhausted(nextPressTurn);
  const nextActorId = playerTurnExhausted
    ? null
    : findNextEligibleActorId(
        queue,
        participants,
        normalizedSnapshot.currentActorId,
      );

  const turnCount = normalizedSnapshot.turnCount ?? 1;
  const battleResult = allEnemiesDefeated
    ? createVictoryBattleResult(participants, turnCount)
    : allPlayersDefeated
      ? createDefeatBattleResult(participants, turnCount)
      : normalizedSnapshot.battleResult;
  const actionLog = createPlayerActionLogEntry(resolution, turnCount);
  const resultLog =
    battleResult != null && (allEnemiesDefeated || allPlayersDefeated)
      ? [createBattleResultLogEntry(battleResult)]
      : [];

  const nextSnapshot: BattleSnapshot = {
    ...normalizedSnapshot,
    participants,
    pressTurn: nextPressTurn,
    currentActorId: nextActorId,
    lifecycleState:
      allEnemiesDefeated || allPlayersDefeated ? "RESOLVED" : "ACTIVE",
    phase:
      allEnemiesDefeated || allPlayersDefeated
        ? "RESULT"
        : playerTurnExhausted
          ? "ENEMY_TURN"
          : "PLAYER_COMMAND",
    battleLog: appendBattleLogs(normalizedSnapshot, [actionLog, ...resultLog]),
  };

  if (battleResult != null) {
    nextSnapshot.battleResult = battleResult;
  }

  if (allEnemiesDefeated) {
    nextSnapshot.resultSummary = "Victory";
  } else if (allPlayersDefeated) {
    nextSnapshot.resultSummary = "Defeat";
  } else if (normalizedSnapshot.resultSummary != null) {
    nextSnapshot.resultSummary = normalizedSnapshot.resultSummary;
  }

  return nextSnapshot;
}

// ── Enemy turn resolver ──

export function resolveEnemyTurn(snapshot: BattleSnapshot): BattleSnapshot {
  if (snapshot.phase !== "ENEMY_TURN") {
    return snapshot;
  }

  const params = getFormulaParams();
  const turnCount = snapshot.turnCount ?? 1;
  const enemyActors = snapshot.participants.filter(
    (p) =>
      p.side === "enemy" && p.isActive && !p.isDown && p.canAct !== false,
  );

  if (enemyActors.length === 0) {
    const battleResult = createVictoryBattleResult(snapshot.participants, turnCount);
    return {
      ...snapshot,
      lifecycleState: "RESOLVED",
      phase: "RESULT",
      currentActorId: null,
      battleResult,
      resultSummary: "Victory",
      battleLog: appendBattleLogs(snapshot, [
        createBattleResultLogEntry(battleResult),
      ]),
    };
  }

  let participants = snapshot.participants.map(cloneParticipant);
  const logs: BattleLogEntry[] = [];
  const attackCount = Math.max(
    1,
    snapshot.pressTurn.ownerSide === "enemy"
      ? snapshot.pressTurn.icons.length
      : enemyActors.length,
  );

  for (let index = 0; index < attackCount; index += 1) {
    const actor = enemyActors[index % enemyActors.length];
    const target = selectEnemyTurnTarget(participants);
    if (actor == null || target == null) break;

    // Use formula engine for enemy damage
    const actorAtk = actor.attack ?? 5;
    const targetDef = target.defense ?? 5;
    let damage = calculateDamage(
      actorAtk,
      actor.level ?? 1,
      targetDef,
      10, // basic attack power for enemies
      1.0, // neutral affinity
      params.damage,
    );

    // Apply guard reduction
    if (hasGuardStatus(target)) {
      damage = calculateGuardReduction(damage, params.guard);
    }

    const nextHp = Math.max(0, target.hp.current - damage);
    participants = participants.map((p) =>
      p.id === target.id
        ? {
            ...p,
            hp: { ...p.hp, current: nextHp },
            isDown: nextHp === 0,
          }
        : p,
    );
    logs.push(createEnemyAttackLogEntry(turnCount, actor, target, damage));
  }

  // Tick status effects at round boundary
  const effectMap = getStatusEffectMap();
  participants = participants.map((p) => {
    if (p.isDown) return p;
    const tickResult = tickStatusEffects(p.statusEffects ?? [], p.hp, effectMap);
    let nextHp = Math.max(0, Math.min(p.hp.max, p.hp.current + tickResult.hpDelta));
    let nextMp = p.mp.current;
    const updatedEffects = tickResult.updatedEffects;

    // Passive regen (hp_regen / mp_regen)
    const passives = collectPassives(p.passiveEffects);
    if (passives.length > 0) {
      const regenCtx = applyPassivesAtHook(passives, "on_turn_start", {
        hpMax: p.hp.max,
        mpMax: p.mp.max,
        hpCurrent: nextHp,
        mpCurrent: nextMp,
      }) as { hpMax: number; mpMax: number; hpCurrent: number; mpCurrent: number };
      nextHp = regenCtx.hpCurrent;
      nextMp = regenCtx.mpCurrent;
    }

    // Ailment: sleep/freeze disable action. Paralyze: 50% chance.
    const disabled = isDisabledByAilment(updatedEffects) || isParalyzed(updatedEffects);
    // Seal: disable skill MP-cost actions (checked during resolution via MP)
    return {
      ...p,
      statusEffects: updatedEffects,
      hp: { ...p.hp, current: nextHp },
      mp: { ...p.mp, current: nextMp },
      isDown: nextHp === 0,
      canAct: disabled ? false : (p.canAct ?? true),
    };
  });

  const allPlayersDefeated = participants
    .filter((p) => p.side === "player")
    .every((p) => p.isDown);

  if (allPlayersDefeated) {
    const battleResult = createDefeatBattleResult(participants, turnCount);
    return {
      ...snapshot,
      participants,
      lifecycleState: "RESOLVED",
      phase: "RESULT",
      currentActorId: null,
      battleResult,
      resultSummary: "Defeat",
      battleLog: appendBattleLogs(snapshot, [
        ...logs,
        createBattleResultLogEntry(battleResult),
      ]),
    };
  }

  const nextTurnCount = turnCount + 1;
  const playerActingParticipantIds = getActingParticipantIdsForSide(
    participants,
    "player",
  );

  return {
    ...snapshot,
    participants,
    lifecycleState: "ACTIVE",
    phase: "PLAYER_COMMAND",
    pressTurn: createPressTurnStateForSide(participants, "player"),
    pressTurnAllocation: {
      participantIds: playerActingParticipantIds,
      initialIconCount: playerActingParticipantIds.length,
    },
    turnCount: nextTurnCount,
    currentActorId: playerActingParticipantIds[0] ?? null,
    selectedActionId: null,
    selectedTargetId: getFirstAllowedTargetId(participants, "enemy"),
    selectedSwapOutParticipantId: null,
    selectedSwapInParticipantId: null,
    battleLog: appendBattleLogs(snapshot, [
      ...logs,
      createPlayerRoundStartLogEntry(nextTurnCount),
    ]),
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
        (p) => p.id === snapshot.selectedTargetId && p.side === "player" && !p.isDown,
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
    return {
      ok: true,
      actorId,
      actionId: definition.id,
      intendedTargetId: snapshot.selectedTargetId,
      outcomes: [],
      pressTurnResult: settlePassPressTurn(snapshot.pressTurn),
      verboseLog: [`${actorId} passed the turn.`],
      summaryLog: ["Pass used"],
    };
  }

  // Swap
  if (definition.resolutionKind === "swap") {
    return createSwapResolution(snapshot);
  }

  // Guard
  if (definition.resolutionKind === "guard") {
    const outcome: BattleActionOutcome = {
      type: "hit",
      tags: [],
      actorId,
      primaryTargetId: actorId,
      finalTargetId: actorId,
      appliedStatusEffects: [{ effectId: GUARD_EFFECT_ID, duration: GUARD_EFFECT_DURATION }],
    };

    return {
      ...createPressTurnResolutionForOutcomes(snapshot, [outcome]),
      actionId: definition.id,
      intendedTargetId: snapshot.selectedTargetId,
      verboseLog: [`${actorId} guarded.`],
      summaryLog: ["Guard used"],
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
          `${actorId} used basic-skill on ${snapshot.selectedTargetId}.`,
        ],
        summaryLog: ["Basic Skill hit"],
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

        outcomes.push({
          type: "hit" as const,
          tags: [],
          actorId,
          primaryTargetId: healTarget.id,
          finalTargetId: healTarget.id,
          hpDelta: reviveHp > 0 ? reviveHp : healAmount,
        });
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
          `${actorId} used ${skillContent.name}.`,
        ],
        summaryLog: [`${skillContent.name} used`],
      };
    }

    // Support skills (status effect application)
    if (skillContent.category === "support") {
      const outcomes: BattleActionOutcome[] = [];

      // Resolve targets for multi-target support skills
      const supportTargets = resolveTargets(
        snapshot,
        actor ?? { id: actorId } as BattleParticipant,
        skillContent.targetType,
      );

      // Build status effects to apply
      const appliedEffects: AppliedStatusEffectPayload[] = [];
      const effectMap = getStatusEffectMap();

      if (skillContent.statusEffects != null) {
        for (const se of skillContent.statusEffects) {
          // Apply status_boost passives to base chance
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
      }

      // Apply effects to each target
      if (appliedEffects.length > 0) {
        for (const supportTarget of supportTargets) {
          outcomes.push({
            type: "hit" as const,
            tags: [],
            actorId,
            primaryTargetId: supportTarget.id,
            finalTargetId: supportTarget.id,
            appliedStatusEffects: appliedEffects,
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
          `${actorId} used ${skillContent.name}.`,
        ],
        summaryLog: [`${skillContent.name} used`],
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
      const targetOutcomes = buildAttackOutcomes({
        actorId,
        actor,
        targetId: offenseTarget.id,
        target: offenseTarget,
        skillPower: skillContent.power,
        skillElement: skillContent.element,
        skillAccuracy: skillContent.accuracy,
        statDriver: skillContent.statDriver,
        skillCritRate: skillContent.critRate,
        hitCount: skillContent.hitCount,
        hitCountMax: skillContent.hitCountMax,
        skillCategory: skillContent.category,
      });
      outcomes.push(...targetOutcomes);
    }

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
        `${actorId} used ${skillContent.name}.`,
      ],
      summaryLog: [`${skillContent.name} used`],
    };
  }

  // ── Item resolution (content-driven) ──

  if (definition.resolutionKind === "item") {
    // Backward compat: if no contentId, use old hardcoded placeholder
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
          `${actorId} used basic-item on ${snapshot.selectedTargetId}.`,
        ],
        summaryLog: ["Basic Item healed"],
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

    const outcomes: BattleActionOutcome[] = [];

    if (itemContent.healHp != null) {
      outcomes.push({
        type: "hit",
        tags: [],
        actorId,
        primaryTargetId: snapshot.selectedTargetId,
        finalTargetId: snapshot.selectedTargetId,
        hpDelta: itemContent.healHp,
      });
    }
    if (itemContent.healMp != null) {
      outcomes.push({
        type: "hit",
        tags: [],
        actorId,
        primaryTargetId: snapshot.selectedTargetId,
        finalTargetId: snapshot.selectedTargetId,
        mpDelta: itemContent.healMp,
      });
    }

    return {
      ...createPressTurnResolutionForOutcomes(snapshot, outcomes),
      actionId: definition.id,
      contentId,
      intendedTargetId: snapshot.selectedTargetId,
      verboseLog: [
        `${actorId} used ${itemContent.name} on ${snapshot.selectedTargetId}.`,
      ],
      summaryLog: [`${itemContent.name} used`],
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
  });

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
      `${actorId} used ${skillContent.name} on ${snapshot.selectedTargetId}.`,
    ],
    summaryLog: [`${skillContent.name} used`],
  };
}
