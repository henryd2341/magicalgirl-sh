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
        summary: "我方第 2 回合开始。",
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
      outcomes: [{
        type: "hit", tags: ["weak", "critical"], actorId: "player-heroine-1",
        primaryTargetId: "enemy-1", finalTargetId: "enemy-1", hpDelta: -1,
      }],
      verboseLog: ["enemy-1 took 1 damage"],
      summaryLog: ["使用攻击"],
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

    expect(createPlayerActionLogEntry(resolution, 1, [target, enemy])).toEqual({
      turnCount: 1,
      side: "player",
      kind: "action",
      visibility: "both",
      actorId: "player-heroine-1",
      actionId: "attack",
      targetIds: ["enemy-1"],
      summary: "使用攻击：造成 1 点伤害 · 弱点 · 暴击",
      details: ["loop-shadow受到 1 点伤害（HP 1/1）【弱点】【暴击】"],
    });
    expect(createEnemyAttackLogEntry(1, enemy, target, 1)).toEqual({
      turnCount: 1,
      side: "enemy",
      kind: "action",
      visibility: "both",
      actorId: "enemy-1",
      actionId: "enemy_attack",
      targetIds: ["player-heroine-1"],
      summary: "loop-shadow攻击鹿目真昼，造成 1 点伤害。",
      details: ["鹿目真昼受到 1 点伤害。"],
    });
    expect(createBattleResultLogEntry(battleResult)).toEqual({
      turnCount: 2,
      side: "system",
      kind: "result",
      visibility: "both",
      summary: "胜利：敌方全员倒下。",
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

  it("reports miss, nullify, reflect, absorb, and status changes with display names", () => {
    const participants: BattleParticipant[] = [
      { id: "hero", side: "player", displayName: "主角", hp: { current: 100, max: 100 }, mp: { current: 20, max: 20 }, isDown: false, isActive: true },
      { id: "enemy", side: "enemy", displayName: "测试敌人", hp: { current: 80, max: 100 }, mp: { current: 0, max: 0 }, isDown: false, isActive: true },
    ];
    const resolution: BattleActionResolution = {
      ok: true, actorId: "hero", actionId: "basic-skill", intendedTargetId: "enemy",
      outcomes: [
        { type: "miss", tags: [], actorId: "hero", finalTargetId: "enemy" },
        { type: "block", tags: [], actorId: "hero", finalTargetId: "enemy", preventedBy: "nullify" },
        { type: "reflect", tags: [], actorId: "hero", finalTargetId: "enemy", preventedBy: "reflect" },
        { type: "absorb", tags: [], actorId: "hero", finalTargetId: "enemy", preventedBy: "absorb" },
        { type: "hit", tags: [], actorId: "hero", finalTargetId: "enemy", appliedStatusEffects: [{ effectId: "defense_down", duration: 3 }] },
      ],
      verboseLog: [], summaryLog: ["使用破甲击"],
    };

    expect(createPlayerActionLogEntry(resolution, 2, participants)).toMatchObject({
      summary: "使用破甲击：未命中 · 无效 · 反弹 · 吸收 · 状态变化",
      details: [
        "测试敌人：未命中",
        "测试敌人：无效",
        "测试敌人：反弹",
        "测试敌人：吸收",
        "测试敌人获得 防御力下降（3回合）",
      ],
    });
  });

  it("reports HP and MP drain transfers with final resource values", () => {
    const participants: BattleParticipant[] = [
      { id: "hero", side: "player", displayName: "主角", hp: { current: 50, max: 100 }, mp: { current: 18, max: 20 }, isDown: false, isActive: true },
      { id: "enemy", side: "enemy", displayName: "测试敌人", hp: { current: 80, max: 100 }, mp: { current: 4, max: 14 }, isDown: false, isActive: true },
    ];
    const resolution: BattleActionResolution = {
      ok: true,
      actorId: "hero",
      actionId: "drain-skill",
      intendedTargetId: "enemy",
      outcomes: [
        { type: "hit", tags: [], actorId: "hero", finalTargetId: "enemy", hpDelta: -10 },
        { type: "hit", tags: [], actorId: "hero", finalTargetId: "hero", hpDelta: 10 },
        { type: "hit", tags: [], actorId: "hero", finalTargetId: "enemy", mpDelta: -10 },
        { type: "hit", tags: [], actorId: "hero", finalTargetId: "hero", mpDelta: 10 },
        { type: "hit", tags: [], actorId: "hero", finalTargetId: "hero", mpDelta: -2 },
      ],
      verboseLog: [],
      summaryLog: ["吸收发动"],
    };

    expect(createPlayerActionLogEntry(resolution, 3, participants)).toMatchObject({
      summary: "吸收发动：造成 10 点伤害 · 恢复 10 HP · 恢复 10 MP",
      details: [
        "测试敌人受到 10 点伤害（HP 80/100）",
        "主角恢复 10 HP（HP 50/100）",
        "测试敌人失去 10 MP（MP 4/14）",
        "主角恢复 10 MP（MP 18/20）",
        "主角消耗 2 MP（MP 18/20）",
      ],
    });
  });});
