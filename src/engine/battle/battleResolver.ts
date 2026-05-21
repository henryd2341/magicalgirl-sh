import type { BattleParticipant, BattleSnapshot } from "@/types/battle";

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
  };
}

export function resolveSelectedBattleAction(
  snapshot: BattleSnapshot,
): BattleSnapshot {
  if (snapshot.phase !== "PLAYER_COMMAND") {
    return snapshot;
  }

  if (
    snapshot.selectedActionId !== "attack" ||
    snapshot.selectedTargetId == null
  ) {
    return snapshot;
  }

  const target = snapshot.participants.find(
    (participant) => participant.id === snapshot.selectedTargetId,
  );

  if (target == null || target.side !== "enemy" || target.isDown) {
    return snapshot;
  }

  const participants = snapshot.participants.map((participant) => {
    if (participant.id !== snapshot.selectedTargetId) {
      return cloneParticipant(participant);
    }

    const nextHpCurrent = Math.max(0, participant.hp.current - 1);

    return {
      ...cloneParticipant(participant),
      hp: {
        ...participant.hp,
        current: nextHpCurrent,
      },
      isDown: nextHpCurrent === 0,
    };
  });

  const nextSpentIcons = snapshot.pressTurn.spentIcons + 1;
  const allEnemiesDefeated = participants
    .filter((participant) => participant.side === "enemy")
    .every((participant) => participant.isDown);
  const playerTurnExhausted = nextSpentIcons >= snapshot.pressTurn.totalIcons;

  return {
    ...snapshot,
    participants,
    pressTurn: {
      ...snapshot.pressTurn,
      spentIcons: nextSpentIcons,
    },
    lifecycleState: allEnemiesDefeated ? "RESOLVED" : "ACTIVE",
    phase: allEnemiesDefeated
      ? "RESULT"
      : playerTurnExhausted
        ? "ENEMY_TURN"
        : "PLAYER_COMMAND",
    resultSummary: allEnemiesDefeated ? "Victory" : snapshot.resultSummary,
  };
}
