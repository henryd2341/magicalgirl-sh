import { getBattleActionDefinition } from "@/engine/battle/battleActionCatalog";
import { aggregatePressTurnOutcome } from "@/engine/battle/battleOutcomeAggregation";
import {
  findNextEligibleActorId,
  normalizeCurrentActorId,
} from "@/engine/battle/battleTurnQueue";
import {
  isPressTurnExhausted,
  settlePassPressTurn,
  settlePressTurnResultByOutcome,
  settleSwapPressTurn,
} from "@/engine/battle/pressTurn";
import type {
  BattleActionOutcome,
  BattleActionResolution,
  BattleParticipant,
  BattleResult,
  BattleSnapshot,
} from "@/types/battle";

function cloneParticipant(participant: BattleParticipant): BattleParticipant {
  return {
    ...participant,
    hp: {
      ...participant.hp,
    },
    mp: {
      ...participant.mp,
    },
    statusEffects: [...(participant.statusEffects ?? [])],
    affinities:
      participant.affinities == null
        ? undefined
        : { ...participant.affinities },
    combatStats:
      participant.combatStats == null
        ? undefined
        : { ...participant.combatStats },
  };
}

function applyOutcomeToParticipant(
  participant: BattleParticipant,
  outcome: BattleActionOutcome,
): BattleParticipant {
  if (participant.id !== outcome.finalTargetId) {
    return participant;
  }

  const nextHpCurrent = Math.max(
    0,
    participant.hp.current + (outcome.hpDelta ?? 0),
  );
  const nextMpCurrent = Math.max(
    0,
    participant.mp.current + (outcome.mpDelta ?? 0),
  );

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
    statusEffects: [
      ...(participant.statusEffects ?? []),
      ...(outcome.appliedStatusEffects ?? []),
    ],
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

  return {
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
    battleResult: allEnemiesDefeated
      ? createVictoryBattleResult(
          participants,
          normalizedSnapshot.turnCount ?? 1,
        )
      : allPlayersDefeated
        ? createDefeatBattleResult(
            participants,
            normalizedSnapshot.turnCount ?? 1,
          )
        : normalizedSnapshot.battleResult,
    resultSummary: allEnemiesDefeated
      ? "Victory"
      : allPlayersDefeated
        ? "Defeat"
        : normalizedSnapshot.resultSummary,
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
