import {
  MAX_BATTLE_LOG_ENTRIES,
  appendBattleLogs,
  createBattleResultLogEntry,
  createEnemyAttackLogEntry,
  createMechanicLogDraft,
  createPlayerActionLogEntry,
  createPlayerRoundStartLogEntry,
} from "@/engine/battle/battleLogger";
import type {
  BattleActionResolution,
  BattleLogDraft,
  BattleParticipant,
  BattleResult,
  BattleSnapshot,
} from "@/types/battle";
import { describe, expect, it } from "vitest";

describe("battleLogger", () => {
  it("normalizes legacy entries and assigns monotonic sequences without mutating the snapshot", () => {
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
      createMechanicLogDraft(2, "阶段变化", ["进入第二阶段"]),
      createPlayerRoundStartLogEntry(2),
    ]);

    expect(snapshot.battleLog).toHaveLength(1);
    expect(nextLogs).toEqual([
      {
        id: "turn-1-battle-start",
        sequence: 1,
        turnCount: 1,
        side: "system",
        kind: "system",
        visibility: "both",
        summary: "Battle started.",
      },
      {
        id: "battle-log-2",
        sequence: 2,
        turnCount: 2,
        side: "system",
        kind: "mechanic",
        visibility: "both",
        summary: "阶段变化",
        details: ["进入第二阶段"],
      },
      {
        id: "battle-log-3",
        sequence: 3,
        turnCount: 2,
        side: "system",
        kind: "system",
        visibility: "both",
        summary: "Player turn 2 started.",
      },
    ]);
  });

  it("keeps IDs unique and retains only the newest 1000 entries", () => {
    const drafts = Array.from({ length: MAX_BATTLE_LOG_ENTRIES + 1 }, (_, index) => ({
      id: "duplicate-id",
      turnCount: index + 1,
      side: "system" as const,
      kind: "system" as const,
      visibility: "both" as const,
      summary: `Entry ${index + 1}`,
    })) satisfies BattleLogDraft[];

    const logs = appendBattleLogs({ battleLog: [] } as BattleSnapshot, drafts);

    expect(logs).toHaveLength(MAX_BATTLE_LOG_ENTRIES);
    expect(logs[0]?.sequence).toBe(2);
    expect(logs.at(-1)?.sequence).toBe(MAX_BATTLE_LOG_ENTRIES + 1);
    expect(new Set(logs.map((entry) => entry.id)).size).toBe(logs.length);
  });

  it("creates structured action, enemy attack, mechanic, and result drafts", () => {
    const resolution: BattleActionResolution = {
      ok: true,
      actorId: "player-heroine-1",
      actionId: "attack",
      intendedTargetId: "enemy-1",
      outcomes: [],
      verboseLog: ["enemy-1 took 2 damage"],
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
      turnCount: 1,
      side: "player",
      kind: "action",
      visibility: "both",
      actorId: "player-heroine-1",
      actionId: "attack",
      targetIds: ["enemy-1"],
      summary: "Attack hit",
      details: ["enemy-1 took 2 damage"],
    });
    expect(createEnemyAttackLogEntry(1, enemy, target, 1)).toEqual({
      turnCount: 1,
      side: "enemy",
      kind: "action",
      visibility: "both",
      actorId: "enemy-1",
      actionId: "enemy_attack",
      targetIds: ["player-heroine-1"],
      summary: "loop-shadow attacked 鹿目真昼 for 1 damage.",
      details: ["鹿目真昼 took 1 damage."],
    });
    expect(createBattleResultLogEntry(battleResult)).toEqual({
      turnCount: 2,
      side: "system",
      kind: "result",
      visibility: "both",
      summary: "Victory: all enemies are down.",
    });
    expect(createMechanicLogDraft(2, "DPS检测失败")).toEqual({
      turnCount: 2,
      side: "system",
      kind: "mechanic",
      visibility: "both",
      summary: "DPS检测失败",
      details: [],
    });
  });
});
