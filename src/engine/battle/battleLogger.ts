import { getStatusEffectMap } from "@/content/contentRegistry";
import type {
  BattleActionOutcome,
  BattleActionResolution,
  BattleLogDraft,
  BattleLogEntry,
  BattleLogKind,
  BattleLogVisibility,
  BattleParticipant,
  BattleResult,
  BattleSnapshot,
  CombatantSide,
} from "@/types/battle";

export const MAX_BATTLE_LOG_ENTRIES = 1000;

interface LegacyBattleLogEntry {
  id: string;
  sequence?: number;
  turnCount: number;
  side: CombatantSide | "system";
  kind?: BattleLogKind;
  visibility?: BattleLogVisibility;
  actorId?: string;
  actionId?: string;
  targetId?: string;
  targetIds?: string[];
  summary: string;
  details?: string[];
}

function normalizeLegacyBattleLogEntry(
  entry: BattleLogEntry | LegacyBattleLogEntry,
  index: number,
): BattleLogEntry {
  const legacyEntry = entry as LegacyBattleLogEntry;
  const targetIds =
    legacyEntry.targetIds ??
    (legacyEntry.targetId == null ? undefined : [legacyEntry.targetId]);

  return {
    id: legacyEntry.id,
    sequence: legacyEntry.sequence ?? index + 1,
    turnCount: legacyEntry.turnCount,
    side: legacyEntry.side,
    kind: legacyEntry.kind ?? "system",
    visibility: legacyEntry.visibility ?? "both",
    ...(legacyEntry.actorId == null ? {} : { actorId: legacyEntry.actorId }),
    ...(legacyEntry.actionId == null ? {} : { actionId: legacyEntry.actionId }),
    ...(targetIds == null ? {} : { targetIds }),
    summary: legacyEntry.summary,
    ...(legacyEntry.details == null ? {} : { details: legacyEntry.details }),
  };
}

export function appendBattleLogs(
  snapshot: BattleSnapshot,
  drafts: BattleLogDraft[],
): BattleLogEntry[] {
  const existing = (snapshot.battleLog ?? []).map((entry, index) =>
    normalizeLegacyBattleLogEntry(entry, index),
  );
  let sequence = existing.at(-1)?.sequence ?? 0;
  const usedIds = new Set(existing.map((entry) => entry.id));

  const appended = drafts.map((draft) => {
    sequence += 1;
    const preferredId = draft.id ?? `battle-log-${sequence}`;
    const id = usedIds.has(preferredId)
      ? `${preferredId}-${sequence}`
      : preferredId;
    usedIds.add(id);

    const { id: _draftId, ...fields } = draft;
    return {
      ...fields,
      sequence,
      id,
    } satisfies BattleLogEntry;
  });

  return [...existing, ...appended].slice(-MAX_BATTLE_LOG_ENTRIES);
}

export function createMechanicLogDraft(
  turnCount: number,
  summary: string,
  details: string[] = [],
): BattleLogDraft {
  return {
    turnCount,
    side: "system",
    kind: "mechanic",
    visibility: "both",
    summary,
    details,
  };
}

export function createBattleResultLogEntry(
  battleResult: BattleResult,
): BattleLogDraft {
  const summary =
    battleResult.outcome === "victory"
      ? "Victory: all enemies are down."
      : battleResult.outcome === "defeat"
        ? "Defeat: all players are down."
        : "Battle ended by escape.";

  return {
    turnCount: battleResult.turnCount,
    side: "system",
    kind: "result",
    visibility: "both",
    summary,
  };
}

function participantName(
  participantId: string | null | undefined,
  participants: readonly BattleParticipant[],
): string {
  if (participantId == null) return "目标";
  return participants.find((participant) => participant.id === participantId)?.displayName
    ?? participantId;
}

function outcomeTargetId(outcome: BattleActionOutcome): string | null | undefined {
  return outcome.finalTargetId ?? outcome.primaryTargetId;
}

function statusEffectName(effectId: string): string {
  return getStatusEffectMap().get(effectId)?.name ?? effectId;
}

function formatActionOutcomes(
  outcomes: readonly BattleActionOutcome[],
  participants: readonly BattleParticipant[],
): { summaryParts: string[]; details: string[] } {
  const summaryParts: string[] = [];
  const details: string[] = [];
  const damageByTarget = new Map<string, { damage: number; tags: Set<string> }>();

  for (const outcome of outcomes) {
    const targetId = outcomeTargetId(outcome);
    if (outcome.type === "hit" && (outcome.hpDelta ?? 0) < 0 && targetId != null) {
      const aggregate = damageByTarget.get(targetId) ?? { damage: 0, tags: new Set<string>() };
      aggregate.damage += Math.abs(outcome.hpDelta ?? 0);
      for (const tag of outcome.tags) aggregate.tags.add(tag);
      damageByTarget.set(targetId, aggregate);
    }
  }

  const totalDamage = [...damageByTarget.values()].reduce((sum, value) => sum + value.damage, 0);
  if (totalDamage > 0) summaryParts.push(`造成 ${totalDamage} 点伤害`);

  for (const [targetId, aggregate] of damageByTarget) {
    const participant = participants.find((candidate) => candidate.id === targetId);
    const hpText = participant == null ? "" : `（HP ${participant.hp.current}/${participant.hp.max}）`;
    const tags = [
      ...(aggregate.tags.has("weak") ? ["【弱点】"] : []),
      ...(aggregate.tags.has("critical") ? ["【暴击】"] : []),
      ...(aggregate.tags.has("resisted") ? ["【耐性】"] : []),
    ].join("");
    details.push(`${participantName(targetId, participants)}受到 ${aggregate.damage} 点伤害${hpText}${tags}`);
  }

  for (const outcome of outcomes) {
    if (outcome.type !== "hit") continue;
    const targetId = outcomeTargetId(outcome);
    if (targetId == null) continue;
    const target = participants.find((candidate) => candidate.id === targetId);
    if ((outcome.hpDelta ?? 0) > 0) {
      const amount = outcome.hpDelta!;
      summaryParts.push(`恢复 ${amount} HP`);
      details.push(`${participantName(targetId, participants)}恢复 ${amount} HP${target == null ? "" : `（HP ${target.hp.current}/${target.hp.max}）`}`);
    }
    if ((outcome.mpDelta ?? 0) > 0) {
      const amount = outcome.mpDelta!;
      summaryParts.push(`恢复 ${amount} MP`);
      details.push(`${participantName(targetId, participants)}恢复 ${amount} MP${target == null ? "" : `（MP ${target.mp.current}/${target.mp.max}）`}`);
    } else if ((outcome.mpDelta ?? 0) < 0) {
      const amount = Math.abs(outcome.mpDelta!);
      const action = targetId === outcome.actorId ? "消耗" : "失去";
      details.push(`${participantName(targetId, participants)}${action} ${amount} MP${target == null ? "" : `（MP ${target.mp.current}/${target.mp.max}）`}`);
    }
  }

  const resultLabels: Partial<Record<BattleActionOutcome["type"], string>> = {
    miss: "Miss", block: "无效", reflect: "反弹", absorb: "吸收", status_no_effect: "状态无效",
  };
  for (const outcome of outcomes) {
    const label = resultLabels[outcome.type];
    if (label != null) {
      if (!summaryParts.includes(label)) summaryParts.push(label);
      details.push(`${participantName(outcomeTargetId(outcome), participants)}：${label}`);
    }
  }

  const allTags = new Set(outcomes.flatMap((outcome) => outcome.tags));
  if (allTags.has("weak")) summaryParts.push("弱点");
  if (allTags.has("critical")) summaryParts.push("暴击");
  if (allTags.has("resisted")) summaryParts.push("耐性");

  let hasStatusChange = false;
  for (const outcome of outcomes) {
    const targetName = participantName(outcomeTargetId(outcome), participants);
    for (const effect of outcome.appliedStatusEffects ?? []) {
      hasStatusChange = true;
      details.push(`${targetName}获得 ${statusEffectName(effect.effectId)}（${effect.duration}回合）`);
    }
    for (const effectId of outcome.removedStatusEffectIds ?? []) {
      hasStatusChange = true;
      details.push(`${targetName}解除 ${statusEffectName(effectId)}`);
    }
  }
  if (hasStatusChange) summaryParts.push("状态变化");

  return { summaryParts, details };
}

export function createPlayerActionLogEntry(
  resolution: BattleActionResolution,
  turnCount: number,
  participants: readonly BattleParticipant[] = [],
): BattleLogDraft {
  const formatted = formatActionOutcomes(resolution.outcomes, participants);
  const baseSummary = resolution.summaryLog[0] ?? `${resolution.actionId} used`;
  const targetIds = [...new Set(
    resolution.outcomes
      .map(outcomeTargetId)
      .filter((id): id is string => id != null),
  )];
  if (targetIds.length === 0 && resolution.intendedTargetId != null) {
    targetIds.push(resolution.intendedTargetId);
  }

  return {
    turnCount,
    side: "player",
    kind: "action",
    visibility: "both",
    actorId: resolution.actorId,
    actionId: resolution.actionId,
    ...(targetIds.length === 0 ? {} : { targetIds }),
    summary: formatted.summaryParts.length === 0
      ? baseSummary
      : `${baseSummary}：${formatted.summaryParts.join(" · ")}`,
    ...(formatted.details.length > 0
      ? { details: formatted.details }
      : resolution.verboseLog.length > 0
        ? { details: resolution.verboseLog }
        : {}),
  };
}

export function createEnemyAttackLogEntry(
  turnCount: number,
  actor: BattleParticipant,
  target: BattleParticipant,
  damage: number,
): BattleLogDraft {
  return {
    turnCount, side: "enemy", kind: "action", visibility: "both",
    actorId: actor.id, actionId: "enemy_attack", targetIds: [target.id],
    summary: `${actor.displayName} attacked ${target.displayName} for ${damage} damage.`,
    details: [`${target.displayName} took ${damage} damage.`],
  };
}

export function createEnemySkillLogEntry(
  turnCount: number,
  actor: BattleParticipant,
  target: BattleParticipant,
  skillName: string,
  outcomes: BattleActionOutcome[],
  participants: readonly BattleParticipant[] = [target],
): BattleLogDraft {
  const formatted = formatActionOutcomes(outcomes, participants);
  return {
    turnCount, side: "enemy", kind: "action", visibility: "both",
    actorId: actor.id, actionId: "enemy_skill",
    targetIds: [...new Set(outcomes.map(outcomeTargetId).filter((id): id is string => id != null))],
    summary: `${actor.displayName}使用${skillName}${formatted.summaryParts.length > 0 ? `：${formatted.summaryParts.join(" · ")}` : ""}`,
    ...(formatted.details.length > 0 ? { details: formatted.details } : {}),
  };
}

export function createPlayerRoundStartLogEntry(
  turnCount: number,
): BattleLogDraft {
  return {
    turnCount,
    side: "system",
    kind: "system",
    visibility: "both",
    summary: `Player turn ${turnCount} started.`,
  };
}

