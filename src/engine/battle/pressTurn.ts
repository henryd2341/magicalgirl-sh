import type {
  BattleActionOutcomeTag,
  BattleActionOutcomeType,
  BattleParticipant,
  CombatantSide,
  PressTurnIcon,
  PressTurnSettlementKind,
  PressTurnSettlementResult,
  PressTurnState,
} from "@/types/battle";

function cloneIcons(icons: PressTurnIcon[]): PressTurnIcon[] {
  return icons.map((icon) => ({ ...icon }));
}

function createSettlementResult(
  kind: PressTurnSettlementKind,
  reason: PressTurnSettlementResult["reason"],
  before: PressTurnState,
  after: PressTurnState,
): PressTurnSettlementResult {
  return {
    kind,
    reason,
    before: {
      ...before,
      icons: cloneIcons(before.icons),
    },
    after: {
      ...after,
      icons: cloneIcons(after.icons),
    },
  };
}

export function getActingParticipantIdsForSide(
  participants: BattleParticipant[],
  side: CombatantSide,
): string[] {
  return participants
    .filter(
      (participant) =>
        participant.side === side &&
        participant.isActive &&
        !participant.isDown &&
        participant.canAct !== false,
    )
    .map((participant) => participant.id);
}

export function allocatePressTurnIcons(
  ownerSide: CombatantSide,
  actingParticipantIds: string[],
): PressTurnState {
  return {
    ownerSide,
    icons: actingParticipantIds.map((participantId, index) => ({
      id: `pt-${ownerSide}-${participantId}-${index + 1}`,
      state: "solid",
    })),
  };
}

export function createPressTurnStateForSide(
  participants: BattleParticipant[],
  side: CombatantSide,
): PressTurnState {
  return allocatePressTurnIcons(
    side,
    getActingParticipantIdsForSide(participants, side),
  );
}

export function isPressTurnExhausted(state: PressTurnState): boolean {
  return state.icons.length === 0;
}

export function consumeOneIcon(state: PressTurnState): PressTurnState {
  return {
    ...state,
    icons: cloneIcons(state.icons).slice(0, -1),
  };
}

export function consumeTwoIcons(state: PressTurnState): PressTurnState {
  return consumeOneIcon(consumeOneIcon(state));
}

export function consumeAllIcons(state: PressTurnState): PressTurnState {
  return {
    ...state,
    icons: [],
  };
}

export function convertOneSolidToBlinking(
  state: PressTurnState,
): PressTurnState {
  const icons = cloneIcons(state.icons);

  for (let index = icons.length - 1; index >= 0; index -= 1) {
    if (icons[index]?.state === "solid") {
      icons[index] = {
        ...icons[index],
        state: "blinking",
      };

      return {
        ...state,
        icons,
      };
    }
  }

  return state;
}

export function rewardOneHalfTurn(state: PressTurnState): PressTurnState {
  const hasSolid = state.icons.some((icon) => icon.state === "solid");

  if (hasSolid) {
    return convertOneSolidToBlinking(state);
  }

  return consumeOneIcon(state);
}

export function settlePressTurnByOutcome(
  state: PressTurnState,
  outcomeType: BattleActionOutcomeType,
  tags: BattleActionOutcomeTag[] = [],
): PressTurnState {
  if (outcomeType === "reflect" || outcomeType === "absorb") {
    return consumeAllIcons(state);
  }

  if (outcomeType === "miss" || outcomeType === "block") {
    return consumeTwoIcons(state);
  }

  if (outcomeType === "status_no_effect") {
    return state;
  }

  if (
    outcomeType === "hit" &&
    (tags.includes("weak") || tags.includes("critical"))
  ) {
    return rewardOneHalfTurn(state);
  }

  return consumeOneIcon(state);
}

export function settlePressTurnResultByOutcome(
  state: PressTurnState,
  outcomeType: BattleActionOutcomeType,
  tags: BattleActionOutcomeTag[] = [],
): PressTurnSettlementResult {
  const after = settlePressTurnByOutcome(state, outcomeType, tags);

  if (outcomeType === "reflect") {
    return createSettlementResult("consume_all", "reflect", state, after);
  }

  if (outcomeType === "absorb") {
    return createSettlementResult("consume_all", "absorb", state, after);
  }

  if (outcomeType === "miss") {
    return createSettlementResult("consume_two", "miss", state, after);
  }

  if (outcomeType === "block") {
    return createSettlementResult("consume_two", "block", state, after);
  }

  if (outcomeType === "status_no_effect") {
    return createSettlementResult(
      "no_change",
      "status_no_effect",
      state,
      after,
    );
  }

  if (outcomeType === "hit" && tags.includes("weak")) {
    return createSettlementResult("reward_half_turn", "weak", state, after);
  }

  if (outcomeType === "hit" && tags.includes("critical")) {
    return createSettlementResult("reward_half_turn", "critical", state, after);
  }

  return createSettlementResult("consume_one", "hit", state, after);
}

export function settlePassPressTurn(
  state: PressTurnState,
): PressTurnSettlementResult {
  const hasSolid = state.icons.some((icon) => icon.state === "solid");

  if (hasSolid) {
    const after = convertOneSolidToBlinking(state);

    return createSettlementResult("reward_half_turn", "pass", state, after);
  }

  const after = consumeOneIcon(state);

  return createSettlementResult("consume_one", "pass", state, after);
}

export function settleSwapPressTurn(
  state: PressTurnState,
): PressTurnSettlementResult {
  const after = consumeOneIcon(state);

  return createSettlementResult("consume_one", "swap", state, after);
}
