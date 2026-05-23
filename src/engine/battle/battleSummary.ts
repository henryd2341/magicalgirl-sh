import type {
  BattleLogEntry,
  BattleParticipant,
  BattleSnapshot,
  BattleSummarySet,
} from "@/types/battle";

function createUnresolvedSummaryError(): Error {
  return new Error(
    "[BATTLE_SUMMARY_UNRESOLVED] Cannot summarize battle before RESULT.",
  );
}

function requireResolvedBattle(snapshot: BattleSnapshot): void {
  if (
    snapshot.lifecycleState !== "RESOLVED" ||
    snapshot.phase !== "RESULT" ||
    snapshot.battleResult == null
  ) {
    throw createUnresolvedSummaryError();
  }
}

function formatParticipantStatus(participant: BattleParticipant): string {
  const activeState = participant.isActive ? "active" : "reserve";
  const downState = participant.isDown ? "down" : "alive";

  return [
    `- ${participant.id}`,
    `[${participant.side}]`,
    participant.displayName,
    `HP ${participant.hp.current}/${participant.hp.max}`,
    `MP ${participant.mp.current}/${participant.mp.max}`,
    activeState,
    downState,
  ].join(" ");
}

function formatVerboseLogEntry(entry: BattleLogEntry, index: number): string {
  const details = [
    entry.actorId,
    entry.actionId,
    entry.targetId == null ? undefined : `-> ${entry.targetId}`,
  ].filter((item): item is string => item != null && item.length > 0);
  const detailText = details.length > 0 ? `${details.join(" ")}: ` : "";

  return `${index + 1}. [${entry.side}] ${detailText}${entry.summary}`;
}

function findParticipantDisplayName(
  participants: BattleParticipant[],
  participantId: string,
): string {
  return (
    participants.find((participant) => participant.id === participantId)
      ?.displayName ?? participantId
  );
}

function formatDisplayNameList(
  participants: BattleParticipant[],
  participantIds: string[],
): string {
  if (participantIds.length === 0) {
    return "None";
  }

  return participantIds
    .map((participantId) => findParticipantDisplayName(participants, participantId))
    .join(", ");
}

function formatIdList(participantIds: string[]): string {
  return participantIds.length === 0 ? "none" : participantIds.join(", ");
}

function createVerboseSummary(snapshot: BattleSnapshot): string {
  const battleResult = snapshot.battleResult;

  if (battleResult == null) {
    throw createUnresolvedSummaryError();
  }

  return [
    "Battle Summary (verbose)",
    `Encounter: ${snapshot.encounterId}`,
    `Result: ${battleResult.outcome} (winner=${battleResult.winningSide ?? "none"}, reason=${battleResult.endReason})`,
    `Turns: ${battleResult.turnCount}`,
    "Participants:",
    ...snapshot.participants.map(formatParticipantStatus),
    "Battle Log:",
    ...(snapshot.battleLog ?? []).map(formatVerboseLogEntry),
  ].join("\n");
}

function createDefaultSummary(snapshot: BattleSnapshot): string {
  const battleResult = snapshot.battleResult;

  if (battleResult == null) {
    throw createUnresolvedSummaryError();
  }

  const highlights = (snapshot.battleLog ?? [])
    .filter((entry) => entry.summary !== `Player turn ${entry.turnCount} started.`)
    .map((entry) => `- ${entry.summary}`);

  return [
    snapshot.resultSummary ?? battleResult.outcome,
    `Turns: ${battleResult.turnCount}`,
    `Survivors: ${formatDisplayNameList(
      snapshot.participants,
      battleResult.survivingParticipantIds,
    )}`,
    `Down: ${formatDisplayNameList(
      snapshot.participants,
      battleResult.downParticipantIds,
    )}`,
    "Highlights:",
    ...(highlights.length > 0 ? highlights : ["- No major actions recorded."]),
  ].join("\n");
}

function createMinimalSummary(snapshot: BattleSnapshot): string {
  const battleResult = snapshot.battleResult;

  if (battleResult == null) {
    throw createUnresolvedSummaryError();
  }

  return [
    `outcome: ${battleResult.outcome}`,
    `winning_side: ${battleResult.winningSide ?? "none"}`,
    `end_reason: ${battleResult.endReason}`,
    `turns: ${battleResult.turnCount}`,
    `survivors: ${formatIdList(battleResult.survivingParticipantIds)}`,
    `down: ${formatIdList(battleResult.downParticipantIds)}`,
  ].join("\n");
}

export function createBattleSummaries(
  snapshot: BattleSnapshot,
): BattleSummarySet {
  requireResolvedBattle(snapshot);

  return {
    verbose: createVerboseSummary(snapshot),
    default: createDefaultSummary(snapshot),
    minimal: createMinimalSummary(snapshot),
  };
}
