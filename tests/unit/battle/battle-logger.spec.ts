import {
  appendBattleLogs,
  createBattleResultLogEntry,
  createEnemyAttackLogEntry,
  createPlayerActionLogEntry,
  createPlayerRoundStartLogEntry,
} from "@/engine/battle/battleLogger";
import type {
  BattleActionResolution,
  BattleParticipant,
  BattleResult,
  BattleSnapshot,
} from "@/types/battle";
import { describe, expect, it } from "vitest";

describe("battleLogger", () => {
  it("appends new log entries without mutating the source battle snapshot", () => {
    const snapshot = {
      battleLog: [
        {
          id: "turn-1-battle-start",
          turnCount: 1,
          side: "system",
          summary: "Battle started.",
        },
      ],
    } as BattleSnapshot;

    const nextLogs = appendBattleLogs(snapshot, [
      createPlayerRoundStartLogEntry(2),
    ]);

    expect(snapshot.battleLog).toHaveLength(1);
    expect(nextLogs).toEqual([
      {
        id: "turn-1-battle-start",
        turnCount: 1,
        side: "system",
        summary: "Battle started.",
      },
      {
        id: "turn-2-player-round-start",
        turnCount: 2,
        side: "system",
        summary: "Player turn 2 started.",
      },
    ]);
  });

  it("creates stable player action, enemy attack, and battle result log entries", () => {
    const resolution: BattleActionResolution = {
      ok: true,
      actorId: "player-heroine-1",
      actionId: "attack",
      intendedTargetId: "enemy-1",
      outcomes: [],
      verboseLog: [],
      summaryLog: ["Attack hit"],
    };
    const enemy: BattleParticipant = {
      id: "enemy-1",
      side: "enemy",
      displayName: "loop-shadow",
      hp: { current: 1, max: 1 },
      mp: { current: 0, max: 0 },
      isDown: false,
      isActive: true,
    };
    const target: BattleParticipant = {
      id: "player-heroine-1",
      side: "player",
      displayName: "鹿目真昼",
      hp: { current: 2, max: 2 },
      mp: { current: 0, max: 0 },
      isDown: false,
      isActive: true,
    };
    const battleResult: BattleResult = {
      outcome: "victory",
      winningSide: "player",
      endReason: "all_enemies_down",
      turnCount: 2,
      survivingParticipantIds: ["player-heroine-1"],
      downParticipantIds: ["enemy-1"],
    };

    expect(createPlayerActionLogEntry(resolution, 1)).toEqual({
      id: "turn-1-player-heroine-1-attack-enemy-1",
      turnCount: 1,
      side: "player",
      actorId: "player-heroine-1",
      actionId: "attack",
      targetId: "enemy-1",
      summary: "Attack hit",
    });
    expect(createEnemyAttackLogEntry(1, enemy, target, 1)).toEqual({
      id: "turn-1-enemy-1-attack-player-heroine-1",
      turnCount: 1,
      side: "enemy",
      actorId: "enemy-1",
      actionId: "enemy_attack",
      targetId: "player-heroine-1",
      summary: "loop-shadow attacked 鹿目真昼 for 1 damage.",
    });
    expect(createBattleResultLogEntry(battleResult)).toEqual({
      id: "turn-2-result-victory",
      turnCount: 2,
      side: "system",
      summary: "Victory: all enemies are down.",
    });
  });
});
