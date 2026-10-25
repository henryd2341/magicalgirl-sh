import type {
  BattleLogEntry,
  BattleParticipant,
  BattleSnapshot,
  BattleSummarySet,
} from "@/types/battle";

const sideLabels = { player: "我方", enemy: "敌方", system: "系统" };
const outcomeLabels = { victory: "胜利", defeat: "失败", escape: "撤退" };
const endReasonLabels = {
  all_enemies_down: "敌方全员倒下",
  all_players_down: "我方全员倒下",
  manual_exit: "主动退出",
};

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
  const activeState = participant.isActive ? "前排" : "后备";
  const downState = participant.isDown ? "倒下" : "存活";

  return [
    `- ${participant.id}`,
    `[${sideLabels[participant.side]}]`,
    participant.displayName,
    `HP ${participant.hp.current}/${participant.hp.max}`,
    `MP ${participant.mp.current}/${participant.mp.max}`,
    activeState,
    downState,
  ].join(" ");
}

function formatVerboseLogEntry(entry: BattleLogEntry, index: number): string {
  const legacyTargetId = (entry as BattleLogEntry & { targetId?: string })
    .targetId;
  const targetIds =
    entry.targetIds ?? (legacyTargetId == null ? undefined : [legacyTargetId]);
  const details = [
    entry.actorId,
    entry.actionId,
    targetIds == null || targetIds.length === 0
      ? undefined
      : `-> ${targetIds.join(",")}`,
  ].filter((item): item is string => item != null && item.length > 0);
  const detailText = details.length > 0 ? `${details.join(" ")}: ` : "";

  return [
    `${index + 1}. [${sideLabels[entry.side]}] ${detailText}${entry.summary}`,
    ...(entry.details ?? []).map((detail) => `   ${detail}`),
  ].join("\n");
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
    return "无";
  }

  return participantIds
    .map((participantId) => findParticipantDisplayName(participants, participantId))
    .join(", ");
}

function formatIdList(participantIds: string[]): string {
  return participantIds.length === 0 ? "无" : participantIds.join(", ");
}

function createVerboseSummary(snapshot: BattleSnapshot): string {
  const battleResult = snapshot.battleResult;

  if (battleResult == null) {
    throw createUnresolvedSummaryError();
  }

  return [
    "战斗报告（详细）",
    `遭遇：${snapshot.encounterId}`,
    `结果：${outcomeLabels[battleResult.outcome]}（胜方：${battleResult.winningSide == null ? "无" : sideLabels[battleResult.winningSide]}，结束原因：${endReasonLabels[battleResult.endReason]}）`,
    `回合数：${battleResult.turnCount}`,
    "参战角色：",
    ...snapshot.participants.map(formatParticipantStatus),
    "战斗日志：",
    ...(snapshot.battleLog ?? []).map(formatVerboseLogEntry),
  ].join("\n");
}

function createDefaultSummary(snapshot: BattleSnapshot): string {
  const battleResult = snapshot.battleResult;

  if (battleResult == null) {
    throw createUnresolvedSummaryError();
  }

  const highlights = (snapshot.battleLog ?? [])
    .filter((entry) => entry.actionId !== "pass" &&
      entry.summary !== `我方第 ${entry.turnCount} 回合开始。` &&
      entry.summary !== `Player turn ${entry.turnCount} started.`)
    .map((entry) => {
      const actorName = entry.side === "player" && entry.actorId != null
        ? findParticipantDisplayName(snapshot.participants, entry.actorId)
        : null;
      const summary = actorName != null && !entry.summary.startsWith(actorName)
        ? `${actorName}：${entry.summary}`
        : entry.summary;
      return `- ${summary}`;
    });

  return [
    "战斗报告（普通）",
    snapshot.resultSummary ?? outcomeLabels[battleResult.outcome],
    `回合数：${battleResult.turnCount}`,
    `存活：${formatDisplayNameList(
      snapshot.participants,
      battleResult.survivingParticipantIds,
    )}`,
    `倒下：${formatDisplayNameList(
      snapshot.participants,
      battleResult.downParticipantIds,
    )}`,
    "关键行动：",
    ...(highlights.length > 0 ? highlights : ["- 无关键行动记录。"]),
  ].join("\n");
}

function createMinimalSummary(snapshot: BattleSnapshot): string {
  const battleResult = snapshot.battleResult;

  if (battleResult == null) {
    throw createUnresolvedSummaryError();
  }

  return [
    "战斗报告（精简）",
    `结果：${outcomeLabels[battleResult.outcome]}`,
    `胜方：${battleResult.winningSide == null ? "无" : sideLabels[battleResult.winningSide]}`,
    `结束原因：${endReasonLabels[battleResult.endReason]}`,
    `回合数：${battleResult.turnCount}`,
    `存活：${formatIdList(battleResult.survivingParticipantIds)}`,
    `倒下：${formatIdList(battleResult.downParticipantIds)}`,
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

