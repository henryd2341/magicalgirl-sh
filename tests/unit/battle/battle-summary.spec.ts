import { createBattleSummaries } from "@/engine/battle/battleSummary";
import type { BattleSnapshot } from "@/types/battle";
import { describe, expect, it } from "vitest";

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
    resultSummary: "Victory",
    battleLog: [
      {
        id: "turn-1-player-heroine-1-attack-enemy-1",
        turnCount: 1,
        side: "player",
        actorId: "player-heroine-1",
        actionId: "attack",
        targetId: "enemy-1",
        summary: "Attack hit",
      },
      {
        id: "turn-1-enemy-1-attack-player-heroine-1",
        turnCount: 1,
        side: "enemy",
        actorId: "enemy-1",
        actionId: "enemy_attack",
        targetId: "player-heroine-1",
        summary: "loop-shadow attacked 鹿目真昼 for 1 damage.",
      },
      {
        id: "turn-2-player-round-start",
        turnCount: 2,
        side: "system",
        summary: "Player turn 2 started.",
      },
      {
        id: "turn-2-player-heroine-1-attack-enemy-1",
        turnCount: 2,
        side: "player",
        actorId: "player-heroine-1",
        actionId: "attack",
        targetId: "enemy-1",
        summary: "Attack hit",
      },
      {
        id: "turn-2-result-victory",
        turnCount: 2,
        side: "system",
        summary: "Victory: all enemies are down.",
      },
    ],
    ...overrides,
  };
}

describe("battleSummary", () => {
  it("generates verbose, default, and minimal summaries for a resolved battle", () => {
    const summaries = createBattleSummaries(createResolvedBattleSnapshot());

    expect(summaries.verbose).toContain("Battle Summary (verbose)");
    expect(summaries.verbose).toContain("Encounter: enc-summary-001");
    expect(summaries.verbose).toContain(
      "Result: victory (winner=player, reason=all_enemies_down)",
    );
    expect(summaries.verbose).toContain(
      "- player-heroine-1 [player] 鹿目真昼 HP 1/2 MP 0/0 active alive",
    );
    expect(summaries.verbose).toContain(
      "2. [enemy] enemy-1 enemy_attack -> player-heroine-1: loop-shadow attacked 鹿目真昼 for 1 damage.",
    );
    expect(summaries.verbose).toContain(
      "5. [system] Victory: all enemies are down.",
    );

    expect(summaries.default).toBe(
      [
        "Victory",
        "Turns: 2",
        "Survivors: 鹿目真昼",
        "Down: loop-shadow",
        "Highlights:",
        "- Attack hit",
        "- loop-shadow attacked 鹿目真昼 for 1 damage.",
        "- Attack hit",
        "- Victory: all enemies are down.",
      ].join("\n"),
    );
    expect(summaries.default).not.toContain("HP 1/2");
    expect(summaries.default).not.toContain("enc-summary-001");

    expect(summaries.minimal).toBe(
      [
        "outcome: victory",
        "winning_side: player",
        "end_reason: all_enemies_down",
        "turns: 2",
        "survivors: player-heroine-1",
        "down: enemy-1",
      ].join("\n"),
    );
    expect(summaries.minimal).not.toContain("Attack hit");
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
