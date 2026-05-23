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
import type {
  BattleActionOutcome,
  BattleActionResolution,
  BattleLogEntry,
  BattleParticipant,
  BattleResult,
  BattleSnapshot,
} from "@/types/battle";

const BASIC_SKILL_MP_COST = 3;
const BASIC_SKILL_DAMAGE = 2;
const BASIC_ITEM_HEAL = 2;
const GUARD_STATUS_EFFECT = "guarding";
const ENEMY_ATTACK_DAMAGE = 1;

function cloneParticipant(participant: BattleParticipant): BattleParticipant {
  const cloned: BattleParticipant = {
    ...participant,
    hp: {
      ...participant.hp,
    },
    mp: {
      ...participant.mp,
    },
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
    hp: {
      ...participant.hp,
      current: nextHpCurrent,
    },
    mp: {
      ...participant.mp,
      current: nextMpCurrent,
    },
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
      .filter((participant) => !participant.isDown)
      .map((participant) => participant.id),
    downParticipantIds: participants
      .filter((participant) => participant.isDown)
      .map((participant) => participant.id),
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
      .filter((participant) => !participant.isDown)
      .map((participant) => participant.id),
    downParticipantIds: participants
      .filter((participant) => participant.isDown)
      .map((participant) => participant.id),
  };
}

function getFirstAllowedTargetId(
  participants: BattleParticipant[],
  side: "player" | "enemy",
): string | null {
  return (
    participants.find(
      (participant) =>
        participant.side === side &&
        participant.isActive &&
        !participant.isDown &&
        participant.canAct !== false,
    )?.id ?? null
  );
}

function selectEnemyTurnTarget(
  participants: BattleParticipant[],
): BattleParticipant | undefined {
  return participants
    .filter(
      (participant) =>
        participant.side === "player" &&
        participant.isActive &&
        !participant.isDown &&
        participant.canAct !== false,
    )
    .reduce<BattleParticipant | undefined>((lowestHpTarget, participant) => {
      if (lowestHpTarget == null) {
        return participant;
      }

      return participant.hp.current < lowestHpTarget.hp.current
        ? participant
        : lowestHpTarget;
    }, undefined);
}

function hasGuardStatus(participant: BattleParticipant): boolean {
  return (participant.statusEffects ?? []).includes(GUARD_STATUS_EFFECT);
}

function calculateEnemyAttackDamage(target: BattleParticipant): number {
  return hasGuardStatus(target)
    ? Math.max(0, ENEMY_ATTACK_DAMAGE - 1)
    : ENEMY_ATTACK_DAMAGE;
}

function clearGuardStatusEffects(
  participants: BattleParticipant[],
): BattleParticipant[] {
  return participants.map((participant) => ({
    ...participant,
    statusEffects: (participant.statusEffects ?? []).filter(
      (statusEffect) => statusEffect !== GUARD_STATUS_EFFECT,
    ),
  }));
}

function validateSwapSelection(
  snapshot: BattleSnapshot,
):
  | { ok: true; swapOutId: string; swapInId: string | null }
  | { ok: false; error: BattleActionResolution["validationError"] } {
  if (snapshot.selectedSwapOutParticipantId == null) {
    return { ok: false, error: "swap_out_required" };
  }

  const playerParticipants = snapshot.participants.filter(
    (participant) => participant.side === "player",
  );
  const activePlayers = playerParticipants.filter(
    (participant) => participant.isActive,
  );
  const reservePlayers = playerParticipants.filter(
    (participant) => !participant.isActive,
  );

  if (activePlayers.length === 1 && reservePlayers.length === 0) {
    return { ok: false, error: "swap_unavailable" };
  }

  const swapOut = snapshot.participants.find(
    (participant) => participant.id === snapshot.selectedSwapOutParticipantId,
  );

  if (swapOut == null) {
    return { ok: false, error: "swap_out_not_found" };
  }

  if (!swapOut.isActive) {
    return { ok: false, error: "swap_out_not_active" };
  }

  if (snapshot.selectedSwapInParticipantId == null) {
    return {
      ok: true,
      swapOutId: swapOut.id,
      swapInId: null,
    };
  }

  const swapIn = snapshot.participants.find(
    (participant) => participant.id === snapshot.selectedSwapInParticipantId,
  );

  if (swapIn == null) {
    return { ok: false, error: "swap_in_not_found" };
  }

  if (swapIn.isActive) {
    return { ok: false, error: "swap_in_not_reserve" };
  }

  if (swapIn.isDown) {
    return { ok: false, error: "swap_in_down" };
  }

  return {
    ok: true,
    swapOutId: swapOut.id,
    swapInId: swapIn.id,
  };
}

function applySwapToParticipants(
  participants: BattleParticipant[],
  swapOutId: string,
  swapInId: string | null,
): BattleParticipant[] {
  return participants.map((participant) => {
    const clonedParticipant = cloneParticipant(participant);

    if (clonedParticipant.id === swapOutId) {
      return {
        ...clonedParticipant,
        isActive: false,
      };
    }

    if (swapInId != null && clonedParticipant.id === swapInId) {
      return {
        ...clonedParticipant,
        isActive: true,
      };
    }

    return clonedParticipant;
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

          if (!validation.ok) {
            return normalizedSnapshot.participants;
          }

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
    .filter((participant) => participant.side === "enemy")
    .every((participant) => participant.isDown);
  const allPlayersDefeated = participants
    .filter((participant) => participant.side === "player")
    .every((participant) => participant.isDown);
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

export function resolveEnemyTurn(snapshot: BattleSnapshot): BattleSnapshot {
  if (snapshot.phase !== "ENEMY_TURN") {
    return snapshot;
  }

  const turnCount = snapshot.turnCount ?? 1;
  const enemyActors = snapshot.participants.filter(
    (participant) =>
      participant.side === "enemy" &&
      participant.isActive &&
      !participant.isDown &&
      participant.canAct !== false,
  );

  if (enemyActors.length === 0) {
    const battleResult = createVictoryBattleResult(
      snapshot.participants,
      turnCount,
    );

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

    if (actor == null || target == null) {
      break;
    }

    const damage = calculateEnemyAttackDamage(target);
    const nextHp = Math.max(0, target.hp.current - damage);
    participants = participants.map((participant) =>
      participant.id === target.id
        ? {
            ...participant,
            hp: {
              ...participant.hp,
              current: nextHp,
            },
            isDown: nextHp === 0,
          }
        : participant,
    );
    logs.push(createEnemyAttackLogEntry(turnCount, actor, target, damage));
  }

  participants = clearGuardStatusEffects(participants);

  const allPlayersDefeated = participants
    .filter((participant) => participant.side === "player")
    .every((participant) => participant.isDown);

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

function createInsufficientMpResolution(
  snapshot: BattleSnapshot,
  actionId: BattleActionResolution["actionId"],
): BattleActionResolution {
  return {
    ok: false,
    validationError: "insufficient_mp",
    actorId: snapshot.currentActorId ?? "unknown-actor",
    actionId,
    intendedTargetId: snapshot.selectedTargetId,
    outcomes: [],
    verboseLog: [],
    summaryLog: [],
  };
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

  if (definition.resolutionKind === "swap") {
    return createSwapResolution(snapshot);
  }

  if (definition.resolutionKind === "guard") {
    const outcome: BattleActionOutcome = {
      type: "hit",
      tags: [],
      actorId,
      primaryTargetId: actorId,
      finalTargetId: actorId,
      appliedStatusEffects: [GUARD_STATUS_EFFECT],
    };

    return {
      ...createPressTurnResolutionForOutcomes(snapshot, [outcome]),
      actionId: definition.id,
      intendedTargetId: snapshot.selectedTargetId,
      verboseLog: [`${actorId} guarded.`],
      summaryLog: ["Guard used"],
    };
  }

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
    (participant) => participant.id === snapshot.selectedTargetId,
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

  if (definition.resolutionKind === "skill") {
    const actor = snapshot.participants.find(
      (participant) => participant.id === actorId,
    );

    if (actor == null || actor.mp.current < BASIC_SKILL_MP_COST) {
      return createInsufficientMpResolution(snapshot, definition.id);
    }

    const outcomes: BattleActionOutcome[] = [
      {
        type: "hit",
        tags: [],
        actorId,
        primaryTargetId: snapshot.selectedTargetId,
        finalTargetId: snapshot.selectedTargetId,
        hpDelta: -BASIC_SKILL_DAMAGE,
      },
      {
        type: "hit",
        tags: [],
        actorId,
        primaryTargetId: actorId,
        finalTargetId: actorId,
        mpDelta: -BASIC_SKILL_MP_COST,
      },
    ];

    return {
      ...createPressTurnResolutionForOutcomes(snapshot, outcomes),
      actionId: definition.id,
      intendedTargetId: snapshot.selectedTargetId,
      verboseLog: [
        `${actorId} used ${definition.id} on ${snapshot.selectedTargetId}.`,
      ],
      summaryLog: [`${definition.label} hit`],
    };
  }

  if (definition.resolutionKind === "item") {
    const outcome: BattleActionOutcome = {
      type: "hit",
      tags: [],
      actorId,
      primaryTargetId: snapshot.selectedTargetId,
      finalTargetId: snapshot.selectedTargetId,
      hpDelta: BASIC_ITEM_HEAL,
    };

    return {
      ...createPressTurnResolutionForOutcomes(snapshot, [outcome]),
      actionId: definition.id,
      intendedTargetId: snapshot.selectedTargetId,
      verboseLog: [
        `${actorId} used ${definition.id} on ${snapshot.selectedTargetId}.`,
      ],
      summaryLog: [`${definition.label} healed`],
    };
  }

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

  const outcome: BattleActionOutcome = {
    type: "hit",
    tags: [],
    actorId,
    primaryTargetId: snapshot.selectedTargetId,
    finalTargetId: snapshot.selectedTargetId,
    hpDelta: -1,
  };

  return {
    ...createPressTurnResolutionForOutcomes(snapshot, [outcome]),
    actionId: definition.id,
    intendedTargetId: snapshot.selectedTargetId,
    verboseLog: [
      `${actorId} used ${definition.id} on ${snapshot.selectedTargetId}.`,
    ],
    summaryLog: [`${definition.label} hit`],
  };
}
