import type {
  BattleActionOutcome,
  BattleActionResolution,
  BattleLogEntry,
  BattleParticipant,
  BattleResult,
  BattleSnapshot,
} from "@/types/battle";

export function appendBattleLogs(
  snapshot: BattleSnapshot,
  entries: BattleLogEntry[],
): BattleLogEntry[] {
  return [...(snapshot.battleLog ?? []), ...entries];
}

export function createBattleResultLogEntry(
  battleResult: BattleResult,
): BattleLogEntry {
  const summary =
    battleResult.outcome === "victory"
      ? "Victory: all enemies are down."
      : "Defeat: all players are down.";

  return {
    id: `turn-${battleResult.turnCount}-result-${battleResult.outcome}`,
    turnCount: battleResult.turnCount,
    side: "system",
    summary,
  };
}

export function createPlayerActionLogEntry(
  resolution: BattleActionResolution,
  turnCount: number,
): BattleLogEntry {
  return {
    id: `turn-${turnCount}-${resolution.actorId}-${resolution.actionId}-${resolution.intendedTargetId ?? "none"}`,
    turnCount,
    side: "player",
    actorId: resolution.actorId,
    actionId: resolution.actionId,
    targetId: resolution.intendedTargetId ?? undefined,
    summary: resolution.summaryLog[0] ?? `${resolution.actionId} used`,
  };
}

export function createEnemyAttackLogEntry(
  turnCount: number,
  actor: BattleParticipant,
  target: BattleParticipant,
  damage: number,
): BattleLogEntry {
  return {
    id: `turn-${turnCount}-${actor.id}-attack-${target.id}`,
    turnCount,
    side: "enemy",
    actorId: actor.id,
    actionId: "enemy_attack",
    targetId: target.id,
    summary: `${actor.displayName} attacked ${target.displayName} for ${damage} damage.`,
  };
}

export function createEnemySkillLogEntry(
  turnCount: number,
  actor: BattleParticipant,
  target: BattleParticipant,
  skillName: string,
  outcomes: BattleActionOutcome[],
): BattleLogEntry {
  const totalDmg = outcomes
    .filter((o) => o.type === "hit")
    .reduce((sum, o) => sum + Math.abs(o.hpDelta ?? 0), 0);
  const missCount = outcomes.filter((o) => o.type === "miss").length;
  const blockCount = outcomes.filter(
    (o) => o.type === "block" || o.type === "reflect" || o.type === "absorb",
  ).length;

  const parts: string[] = [];
  if (totalDmg > 0) parts.push(`${totalDmg} damage`);
  if (missCount > 0) parts.push(`${missCount} miss`);
  if (blockCount > 0) parts.push(`${blockCount} blocked`);

  return {
    id: `turn-${turnCount}-${actor.id}-skill-${target.id}`,
    turnCount,
    side: "enemy",
    actorId: actor.id,
    actionId: "enemy_skill",
    targetId: target.id,
    summary: `${actor.displayName} used ${skillName} on ${target.displayName}${parts.length > 0 ? ` (${parts.join(", ")})` : ""}.`,
  };
}

export function createPlayerRoundStartLogEntry(
  turnCount: number,
): BattleLogEntry {
  return {
    id: `turn-${turnCount}-player-round-start`,
    turnCount,
    side: "system",
    summary: `Player turn ${turnCount} started.`,
  };
}
