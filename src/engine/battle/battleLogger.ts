import type {
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
