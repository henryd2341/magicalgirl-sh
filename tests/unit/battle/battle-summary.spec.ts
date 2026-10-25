import { createBattleSummaries } from "@/engine/battle/battleSummary";
import { resolveSelectedBattleActionToResolution } from "@/engine/battle/battleResolver";
import { createPlayerActionLogEntry } from "@/engine/battle/battleLogger";
import type { BattleSnapshot } from "@/types/battle";
import { describe, expect, it, vi } from "vitest";

function createResolvedBattleSnapshot(
  overrides: Partial<BattleSnapshot> = {},
): BattleSnapshot {
  return {
    lifecycleState: "RESOLVED",
    phase: "RESULT",
    encounterId: "enc-summary-001",
    participants: [
      {
        id: "player-heroine-1",
        side: "player",
        displayName: "鹿目真昼",
        level: 1,
        hp: { current: 1, max: 2 },
        mp: { current: 0, max: 0 },
        isDown: false,
        isActive: true,
        statusEffects: [],
      },
      {
        id: "enemy-1",
        side: "enemy",
        displayName: "loop-shadow",
        level: 1,
        hp: { current: 0, max: 2 },
        mp: { current: 0, max: 0 },
        isDown: true,
        isActive: true,
        statusEffects: [],
      },
    ],
    pressTurn: {
      ownerSide: "player",
      icons: [],
    },
    pressTurnAllocation: {
      participantIds: ["player-heroine-1"],
      initialIconCount: 1,
    },
    turnCount: 2,
    selectedTargetId: "enemy-1",
    currentActorId: null,
    currentMenuNodeId: null,
    selectedActionId: "attack",
    selectedSwapOutParticipantId: null,
    selectedSwapInParticipantId: null,
    battleResult: {
      outcome: "victory",
      winningSide: "player",
      endReason: "all_enemies_down",
      turnCount: 2,
      survivingParticipantIds: ["player-heroine-1"],
      downParticipantIds: ["enemy-1"],
    },
    resultSummary: "胜利",
    battleLog: [
      {
        id: "turn-1-player-heroine-1-attack-enemy-1",
        turnCount: 1,
        side: "player",
        actorId: "player-heroine-1",
        actionId: "attack",
        targetId: "enemy-1",
        summary: "使用攻击",
      },
      {
        id: "turn-1-enemy-1-attack-player-heroine-1",
        turnCount: 1,
        side: "enemy",
        actorId: "enemy-1",
        actionId: "enemy_attack",
        targetId: "player-heroine-1",
        summary: "loop-shadow攻击鹿目真昼，造成 1 点伤害。",
      },
      {
        id: "turn-2-player-round-start",
        turnCount: 2,
        side: "system",
        summary: "我方第 2 回合开始。",
      },
      {
        id: "turn-2-player-heroine-1-attack-enemy-1",
        turnCount: 2,
        side: "player",
        actorId: "player-heroine-1",
        actionId: "attack",
        targetId: "enemy-1",
        summary: "使用攻击",
      },
      {
        id: "turn-2-result-victory",
        turnCount: 2,
        side: "system",
        summary: "胜利：敌方全员倒下。",
      },
    ],
    ...overrides,
  };
}

describe("battleSummary", () => {
  it("formats real attack, skill, item, guard and swap logs with the player name and retains details", () => {
    const random = vi.spyOn(Math, "random").mockReturnValue(0.5);
    try {
      const snapshot = createResolvedBattleSnapshot();
      const actor = snapshot.participants[0]!;
      actor.hp = { current: 50, max: 100 };
      actor.mp = { current: 20, max: 20 };
      snapshot.participants[1]!.isDown = false;
      snapshot.participants[1]!.hp = { current: 50, max: 100 };
      snapshot.participants.push({ ...actor, id: "reserve", displayName: "后备队友", isActive: false });
      const logs = [
        { selectedActionId: "attack", selectedTargetId: "enemy-1" },
        { selectedActionId: "basic-skill", selectedTargetId: "enemy-1" },
        { selectedActionId: "basic-item", selectedTargetId: actor.id },
        { selectedActionId: "guard", selectedTargetId: actor.id },
        { selectedActionId: "swap", selectedSwapOutParticipantId: actor.id, selectedSwapInParticipantId: "reserve" },
        { selectedActionId: "pass" },
      ].map((selection, index) => {
        const resolution = resolveSelectedBattleActionToResolution({
          ...snapshot, lifecycleState: "ACTIVE", phase: "PLAYER_COMMAND", currentActorId: actor.id,
          pressTurn: { ownerSide: "player", icons: [{ id: "pt", state: "solid" }] }, ...selection,
        });
        expect(resolution.ok).toBe(true);
        return { ...createPlayerActionLogEntry(resolution, 2, snapshot.participants), id: `log-${index}`, sequence: index + 1 };
      });
      const reports = createBattleSummaries({ ...snapshot, battleLog: logs });
      for (const action of ["使用攻击", "使用基础技能", "使用基础道具", "防御", "换人"]) {
        expect(reports.default).toContain(`鹿目真昼：${action}`);
      }
      expect(reports.default).not.toContain("传递行动");
      expect(reports.default).toContain("造成 2 点伤害");
      expect(reports.verbose).toContain("恢复 2 HP");
      expect(reports.verbose).toContain("获得 防御");
      expect(reports.verbose).toContain("player-heroine-1换下，reserve上场。");
      expect(reports.verbose).toContain("传递行动");
      expect(reports.verbose).not.toMatch(/used|guarded|swapped|passed|Miss|Battle Summary/);
    } finally {
      random.mockRestore();
    }
  });

  it("does not duplicate existing actor names and falls back to unknown IDs", () => {
    const snapshot = createResolvedBattleSnapshot();
    snapshot.battleLog = [
      { id: "named", sequence: 1, turnCount: 1, side: "player", kind: "action", visibility: "both", actorId: "player-heroine-1", summary: "鹿目真昼使用自定义技能" },
      { id: "missing", sequence: 2, turnCount: 1, side: "player", kind: "action", visibility: "both", actorId: "unknown-player", summary: "使用 Custom Skill" },
    ];
    const report = createBattleSummaries(snapshot).default;
    expect(report).toContain("- 鹿目真昼使用自定义技能");
    expect(report).not.toContain("鹿目真昼：鹿目真昼");
    expect(report).toContain("- unknown-player：使用 Custom Skill");
  });

  it.each([
    ["defeat", "enemy", "all_players_down", "失败", "敌方", "我方全员倒下"],
    ["escape", undefined, "manual_exit", "撤退", "无", "主动退出"],
  ] as const)("localizes %s and empty participant lists", (outcome, winningSide, endReason, result, side, reason) => {
    const reports = createBattleSummaries(createResolvedBattleSnapshot({
      resultSummary: undefined,
      battleLog: [],
      battleResult: { outcome, winningSide, endReason, turnCount: 3, survivingParticipantIds: [], downParticipantIds: [] },
    }));
    expect(reports.minimal).toContain(`结果：${result}\n胜方：${side}\n结束原因：${reason}`);
    expect(reports.minimal).toContain("存活：无\n倒下：无");
    expect(reports.default).toContain("无关键行动记录。");
  });

  it("generates verbose, default, and minimal summaries for a resolved battle", () => {
    const summaries = createBattleSummaries(createResolvedBattleSnapshot());

    expect(summaries.verbose).toContain("战斗报告（详细）");
    expect(summaries.verbose).toContain("遭遇：enc-summary-001");
    expect(summaries.verbose).toContain(
      "结果：胜利（胜方：我方，结束原因：敌方全员倒下）",
    );
    expect(summaries.verbose).toContain(
      "- player-heroine-1 [我方] 鹿目真昼 HP 1/2 MP 0/0 前排 存活",
    );
    expect(summaries.verbose).toContain(
      "2. [敌方] enemy-1 enemy_attack -> player-heroine-1: loop-shadow攻击鹿目真昼，造成 1 点伤害。",
    );
    expect(summaries.verbose).toContain(
      "5. [系统] 胜利：敌方全员倒下。",
    );

    expect(summaries.default).toBe(
      [
        "战斗报告（普通）",
        "胜利",
        "回合数：2",
        "存活：鹿目真昼",
        "倒下：loop-shadow",
        "关键行动：",
        "- 鹿目真昼：使用攻击",
        "- loop-shadow攻击鹿目真昼，造成 1 点伤害。",
        "- 鹿目真昼：使用攻击",
        "- 胜利：敌方全员倒下。",
      ].join("\n"),
    );
    expect(summaries.default).not.toContain("HP 1/2");
    expect(summaries.default).not.toContain("enc-summary-001");

    expect(summaries.minimal).toBe(
      [
        "战斗报告（精简）",
        "结果：胜利",
        "胜方：我方",
        "结束原因：敌方全员倒下",
        "回合数：2",
        "存活：player-heroine-1",
        "倒下：enemy-1",
      ].join("\n"),
    );
    expect(summaries.minimal).not.toContain("使用攻击");
    expect(summaries.minimal).not.toContain("鹿目真昼");
  });

  it("rejects unresolved battles because summaries must describe a final result", () => {
    expect(() =>
      createBattleSummaries(
        createResolvedBattleSnapshot({
          lifecycleState: "ACTIVE",
          phase: "PLAYER_COMMAND",
          battleResult: undefined,
        }),
      ),
    ).toThrowError(
      "[BATTLE_SUMMARY_UNRESOLVED] Cannot summarize battle before RESULT.",
    );
  });
});
