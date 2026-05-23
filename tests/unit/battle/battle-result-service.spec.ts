import { BattleResultService } from "@/engine/battleResultService";
import { ChatMessageService } from "@/engine/chatMessageService";
import { createBattleSummaries } from "@/engine/battle/battleSummary";
import { InMemoryChatHistoryRepository } from "@/persistence/repositories/chatHistoryRepository";
import type { BattleSnapshot } from "@/types/battle";
import { describe, expect, it } from "vitest";

function createResolvedBattleSnapshot(
  overrides: Partial<BattleSnapshot> = {},
): BattleSnapshot {
  return {
    lifecycleState: "RESOLVED",
    phase: "RESULT",
    encounterId: "enc-result-service-001",
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
        id: "turn-2-result-victory",
        turnCount: 2,
        side: "system",
        summary: "Victory: all enemies are down.",
      },
    ],
    ...overrides,
  };
}

describe("BattleResultService", () => {
  it("writes verbose, default, and minimal battle summary messages with the correct visibility", async () => {
    const repository = new InMemoryChatHistoryRepository();
    const chatService = new ChatMessageService(repository);
    const service = new BattleResultService({
      chatService,
      now: () => "2026-05-24T00:00:00.000Z",
    });
    const snapshot = createResolvedBattleSnapshot();

    const result = await service.commitResolvedBattle(snapshot);
    const summaries = createBattleSummaries(snapshot);

    expect(result.summaries).toEqual(summaries);
    expect(result.messages).toHaveLength(3);
    expect(await repository.list()).toEqual([
      {
        id: "battle-summary-enc-result-service-001-verbose",
        role: "system",
        kind: "battle_summary",
        summary_level: "verbose",
        content: summaries.verbose,
        user_visible: false,
        ai_visible: false,
        provisional: false,
        finalized: true,
        failed: false,
        created_at: "2026-05-24T00:00:00.000Z",
      },
      {
        id: "battle-summary-enc-result-service-001-default",
        role: "system",
        kind: "battle_summary",
        summary_level: "default",
        content: summaries.default,
        user_visible: true,
        ai_visible: false,
        provisional: false,
        finalized: true,
        failed: false,
        created_at: "2026-05-24T00:00:00.000Z",
      },
      {
        id: "battle-summary-enc-result-service-001-minimal",
        role: "system",
        kind: "battle_summary",
        summary_level: "minimal",
        content: summaries.minimal,
        user_visible: false,
        ai_visible: true,
        provisional: false,
        finalized: true,
        failed: false,
        created_at: "2026-05-24T00:00:00.000Z",
      },
    ]);
  });

  it("rejects unresolved battles without writing chat messages", async () => {
    const repository = new InMemoryChatHistoryRepository();
    const chatService = new ChatMessageService(repository);
    const service = new BattleResultService({ chatService });

    await expect(
      service.commitResolvedBattle(
        createResolvedBattleSnapshot({
          lifecycleState: "ACTIVE",
          phase: "PLAYER_COMMAND",
          battleResult: undefined,
        }),
      ),
    ).rejects.toThrow(
      "[BATTLE_RESULT_UNRESOLVED] Cannot commit battle result before RESULT.",
    );
    expect(await repository.list()).toEqual([]);
  });

  it("uses stable message ids so repeated commits replace the same summary records", async () => {
    const repository = new InMemoryChatHistoryRepository();
    const chatService = new ChatMessageService(repository);
    const service = new BattleResultService({
      chatService,
      now: () => "2026-05-24T00:00:00.000Z",
    });
    const snapshot = createResolvedBattleSnapshot();

    await service.commitResolvedBattle(snapshot);
    await service.commitResolvedBattle(snapshot);

    expect(await repository.list()).toHaveLength(3);
  });
});
