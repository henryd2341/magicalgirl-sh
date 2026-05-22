import type { BattleParticipant } from "@/types/battle";

function isEligibleActor(participant: BattleParticipant | undefined): boolean {
  return (
    participant != null && !participant.isDown && participant.canAct !== false
  );
}

function findParticipantById(
  participants: BattleParticipant[],
  actorId: string,
): BattleParticipant | undefined {
  return participants.find((participant) => participant.id === actorId);
}

export function normalizeCurrentActorId(
  queue: string[],
  participants: BattleParticipant[],
  currentActorId: string | null | undefined,
): string | null {
  if (queue.length === 0) {
    return null;
  }

  const startIndex =
    currentActorId == null ? 0 : Math.max(queue.indexOf(currentActorId), 0);

  for (let offset = 0; offset < queue.length; offset += 1) {
    const actorId = queue[(startIndex + offset) % queue.length];

    if (isEligibleActor(findParticipantById(participants, actorId))) {
      return actorId;
    }
  }

  return null;
}

export function findNextEligibleActorId(
  queue: string[],
  participants: BattleParticipant[],
  currentActorId: string | null | undefined,
): string | null {
  if (queue.length === 0) {
    return null;
  }

  const normalizedCurrentActorId = normalizeCurrentActorId(
    queue,
    participants,
    currentActorId,
  );

  if (normalizedCurrentActorId == null) {
    return null;
  }

  const currentIndex = queue.indexOf(normalizedCurrentActorId);

  for (let offset = 1; offset <= queue.length; offset += 1) {
    const actorId = queue[(currentIndex + offset) % queue.length];

    if (isEligibleActor(findParticipantById(participants, actorId))) {
      return actorId;
    }
  }

  return null;
}
