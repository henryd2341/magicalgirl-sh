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
  computeDerivedCombatStats,
  resolveAffinityMultiplier,
  resolveAffinityOutcomeType,
  rollCrit,
  rollHit,
} from "@/engine/battle/formulaEngine";
import {
  getFormulaParams,
  getItem,
  getSkill,
} from "@/content/contentRegistry";
import type {
  BattleActionOutcome,
  BattleActionResolution,
  BattleLogEntry,
  BattleParticipant,
  BattleResult,
  BattleSnapshot,
} from "@/types/battle";

// ── Guard status effect ID (from content) ──

const GUARD_EFFECT_ID = "guarding";

// ── Participant cloning ──

function cloneParticipant(participant: BattleParticipant): BattleParticipant {
  const cloned: BattleParticipant = {
    ...participant,
    hp: { ...participant.hp },
    mp: { ...participant.mp },
    statusEffects: [...(participant.statusEffects ?? [])],
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

  const statusEffects = [
    ...new Set([
      ...(participant.statusEffects ?? []),
      ...(outcome.appliedStatusEffects ?? []),
    ]),
  ];

  return {
    ...participant,
    hp: { ...participant.hp, current: nextHpCurrent },
    mp: { ...participant.mp, current: nextMpCurrent },
    isDown: nextHpCurrent === 0,
    statusEffects,
  };
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
  return (participant.statusEffects ?? []).includes(GUARD_EFFECT_ID);
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
}

function buildAttackOutcomes(
  input: BuildAttackOutcomesInput,
): BattleActionOutcome[] {
  const params = getFormulaParams();
  const { actor, target, skillPower, skillElement, skillAccuracy, statDriver } = input;

  // Hit check
  const hitChance = calculateHitChance(
    skillAccuracy,
    actor.combatStats?.accuracy ?? 90,
    target.combatStats?.evasion ?? 80,
    params.hitRate,
  );

  if (!rollHit(hitChance)) {
    return [{
      type: "miss",
      tags: [],
      actorId: input.actorId,
      primaryTargetId: input.targetId,
      finalTargetId: input.targetId,
    }];
  }

  // Affinity check
  const affinityProfile = target.affinities ?? {
    weak: 0, resist: 0, nullify: 0, reflect: 0, absorb: 0,
  };
  const affinityOutcome = resolveAffinityOutcomeType(affinityProfile, skillElement);

  if (affinityOutcome.outcomeType != null) {
    return [{
      type: affinityOutcome.outcomeType,
      tags: [],
      actorId: input.actorId,
      primaryTargetId: input.targetId,
      finalTargetId: input.targetId,
      preventedBy: affinityOutcome.preventedBy,
    }];
  }

  // Affinity multiplier
  const affinityMult = resolveAffinityMultiplier(
    affinityProfile,
    skillElement,
    params.affinity,
  );

  // Damage
  const driverStat = statDriver === "attack" ? (actor.attack ?? 5) : (actor.intelligence ?? 5);
  const defenderDef = target.defense ?? 5;

  const damage = calculateDamage(
    driverStat,
    actor.level ?? 1,
    defenderDef,
    skillPower,
    affinityMult,
    params.damage,
  );

  // Crit check
  const critChance = actor.combatStats?.critRate ?? 5;
  const isCrit = rollCrit(critChance);

  // Determine tags
  const tags: BattleActionResolution["outcomes"][0]["tags"] = [];
  const affinityResult = resolveAffinityResult(affinityProfile, skillElement);

  if (affinityResult === "weak") tags.push("weak");
  if (isCrit) tags.push("critical");

  return [{
    type: "hit",
    tags,
    actorId: input.actorId,
    primaryTargetId: input.targetId,
    finalTargetId: input.targetId,
    hpDelta: -damage,
  }];
}

// ── Guard guard status clearing ──

function clearGuardStatusEffects(
  participants: BattleParticipant[],
): BattleParticipant[] {
  return participants.map((p) => ({
    ...p,
    statusEffects: (p.statusEffects ?? []).filter(
      (effect) => effect !== GUARD_EFFECT_ID,
    ),
  }));
}

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

  participants = clearGuardStatusEffects(participants);

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
      appliedStatusEffects: [GUARD_EFFECT_ID],
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
      const healOutcome: BattleActionOutcome = {
        type: "hit",
        tags: [],
        actorId,
        primaryTargetId: snapshot.selectedTargetId,
        finalTargetId: snapshot.selectedTargetId,
        hpDelta: skillContent.power,
      };
      const mpOutcome: BattleActionOutcome = {
        type: "hit",
        tags: [],
        actorId,
        primaryTargetId: actorId,
        finalTargetId: actorId,
        mpDelta: -skillContent.mpCost,
      };

      return {
        ...createPressTurnResolutionForOutcomes(snapshot, [healOutcome, mpOutcome]),
        actionId: definition.id,
        contentId,
        intendedTargetId: snapshot.selectedTargetId,
        verboseLog: [
          `${actorId} used ${skillContent.name} on ${snapshot.selectedTargetId}.`,
        ],
        summaryLog: [`${skillContent.name} used`],
      };
    }

    // Support skills (status effect application)
    if (skillContent.category === "support") {
      const outcomes: BattleActionOutcome[] = [];
      const appliedEffects: string[] = [];

      if (skillContent.statusEffects != null) {
        for (const se of skillContent.statusEffects) {
          if (Math.random() * 100 < se.chance) {
            appliedEffects.push(se.effectId);
          }
        }
      }

      if (appliedEffects.length > 0) {
        outcomes.push({
          type: "hit",
          tags: [],
          actorId,
          primaryTargetId: snapshot.selectedTargetId,
          finalTargetId: snapshot.selectedTargetId,
          appliedStatusEffects: appliedEffects,
        });
      }

      const mpOutcome: BattleActionOutcome = {
        type: "hit",
        tags: [],
        actorId,
        primaryTargetId: actorId,
        finalTargetId: actorId,
        mpDelta: -skillContent.mpCost,
      };
      outcomes.push(mpOutcome);

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

    const outcomes = buildAttackOutcomes({
      actorId,
      actor,
      targetId: snapshot.selectedTargetId,
      target,
      skillPower: skillContent.power,
      skillElement: skillContent.element,
      skillAccuracy: skillContent.accuracy,
      statDriver: skillContent.statDriver,
    });

    // MP cost outcome
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

  // Use the "attack" skill from content
  const attackSkill = getSkill("attack");
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
    skillPower: attackSkill.power,
    skillElement: attackSkill.element,
    skillAccuracy: attackSkill.accuracy,
    statDriver: attackSkill.statDriver,
  });

  return {
    ...createPressTurnResolutionForOutcomes(snapshot, outcomes),
    actionId: definition.id,
    contentId: "attack",
    intendedTargetId: snapshot.selectedTargetId,
    verboseLog: [
      `${actorId} used Attack on ${snapshot.selectedTargetId}.`,
    ],
    summaryLog: ["Attack hit"],
  };
}
