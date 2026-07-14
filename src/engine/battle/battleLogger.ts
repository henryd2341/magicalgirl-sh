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

export function createPlayerActionLogEntry(
  resolution: BattleActionResolution,
  turnCount: number,
): BattleLogDraft {
  return {
    turnCount,
    side: "player",
    kind: "action",
    visibility: "both",
    actorId: resolution.actorId,
    actionId: resolution.actionId,
    ...(resolution.intendedTargetId == null
      ? {}
      : { targetIds: [resolution.intendedTargetId] }),
    summary: resolution.summaryLog[0] ?? `${resolution.actionId} used`,
    ...(resolution.verboseLog.length === 0
      ? {}
      : { details: resolution.verboseLog }),
  };
}

export function createEnemyAttackLogEntry(
  turnCount: number,
  actor: BattleParticipant,
  target: BattleParticipant,
  damage: number,
): BattleLogDraft {
  return {
    turnCount,
    side: "enemy",
    kind: "action",
    visibility: "both",
    actorId: actor.id,
    actionId: "enemy_attack",
    targetIds: [target.id],
    summary: `${actor.displayName} attacked ${target.displayName} for ${damage} damage.`,
    details: [`${target.displayName} took ${damage} damage.`],
  };
}

function describeEnemySkillOutcomes(outcomes: BattleActionOutcome[]): string[] {
  return outcomes.map((outcome) => {
    const target = outcome.finalTargetId ?? outcome.primaryTargetId ?? "target";
    if (outcome.type === "hit") {
      return `${target} took ${Math.abs(outcome.hpDelta ?? 0)} damage.`;
    }
    return `${target}: ${outcome.type}.`;
  });
}

export function createEnemySkillLogEntry(
  turnCount: number,
  actor: BattleParticipant,
  target: BattleParticipant,
  skillName: string,
  outcomes: BattleActionOutcome[],
): BattleLogDraft {
  const totalDmg = outcomes
    .filter((outcome) => outcome.type === "hit")
    .reduce((sum, outcome) => sum + Math.abs(outcome.hpDelta ?? 0), 0);
  const missCount = outcomes.filter((outcome) => outcome.type === "miss").length;
  const blockCount = outcomes.filter(
    (outcome) =>
      outcome.type === "block" ||
      outcome.type === "reflect" ||
      outcome.type === "absorb",
  ).length;

  const parts: string[] = [];
  if (totalDmg > 0) parts.push(`${totalDmg} damage`);
  if (missCount > 0) parts.push(`${missCount} miss`);
  if (blockCount > 0) parts.push(`${blockCount} blocked`);

  return {
    turnCount,
    side: "enemy",
    kind: "action",
    visibility: "both",
    actorId: actor.id,
    actionId: "enemy_skill",
    targetIds: [target.id],
    summary: `${actor.displayName} used ${skillName} on ${target.displayName}${parts.length > 0 ? ` (${parts.join(", ")})` : ""}.`,
    details: describeEnemySkillOutcomes(outcomes),
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

