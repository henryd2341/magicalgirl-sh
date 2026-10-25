import { BattleResultService } from "@/engine/battleResultService";
import { ChatMessageService } from "@/engine/chatMessageService";
import { createBattleSummaries } from "@/engine/battle/battleSummary";
import { InMemoryChatHistoryRepository } from "@/persistence/repositories/chatHistoryRepository";
import type { BattleSnapshot } from "@/types/battle";
import { describe, expect, it, vi } from "vitest";

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
        id: "turn-2-result-victory",
        turnCount: 2,
        side: "system",
        summary: "胜利：敌方全员倒下。",
      },
    ],
    ...overrides,
  };
}

describe("BattleResultService", () => {
  it.each([
    ["minimal", "verbose"], ["verbose", "minimal"], ["default", "verbose"],
  ] as const)("retries a partial %s write as a consistent %s batch", async (firstLevel, retryLevel) => {
    const repository = new InMemoryChatHistoryRepository();
    const service = new BattleResultService({
      chatService: new ChatMessageService(repository), now: () => "2026-05-24T00:00:00.000Z",
    });
    const save = repository.save.bind(repository);
    const failingSave = vi.spyOn(repository, "save")
      .mockImplementationOnce(save)
      .mockRejectedValueOnce(new Error("interrupted write"));
    await expect(service.commitResolvedBattle(createResolvedBattleSnapshot(), firstLevel)).rejects.toThrow("interrupted write");
    expect(await repository.list()).toHaveLength(1);
    failingSave.mockRestore();

    const snapshot = createResolvedBattleSnapshot({ resultSummary: "重试后的结果" });
    const retried = await new BattleResultService({
      chatService: new ChatMessageService(repository), now: () => "2026-10-25T00:00:00.000Z",
    }).commitResolvedBattle(snapshot, retryLevel);
    expect(await repository.list()).toEqual(retried.messages);
    expect(retried.messages).toHaveLength(3);
    expect(retried.messages.every((message) => message.created_at === "2026-10-25T00:00:00.000Z")).toBe(true);
    expect(retried.messages.filter((message) => message.ai_visible).map((message) => message.summary_level)).toEqual([retryLevel]);
    expect(retried.summaries).toEqual(createBattleSummaries(snapshot));
  });

  it.each(["minimal", "default", "verbose"] as const)("persists only %s for AI while keeping the player report unchanged", async (level) => {
    const repository = new InMemoryChatHistoryRepository();
    const service = new BattleResultService({ chatService: new ChatMessageService(repository) });
    await service.commitResolvedBattle(createResolvedBattleSnapshot(), level);
    const messages = await repository.list();
    expect(messages).toHaveLength(3);
    expect(messages.filter((message) => message.ai_visible).map((message) => message.summary_level)).toEqual([level]);
    expect(messages.filter((message) => message.user_visible).map((message) => message.summary_level)).toEqual(["default"]);
  });

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

  it.each(["minimal", "default", "verbose"] as const)("keeps the original %s reports when the same encounter is committed again with changed settings and content", async (level) => {
    const repository = new InMemoryChatHistoryRepository();
    const chatService = new ChatMessageService(repository);
    const service = new BattleResultService({
      chatService,
      now: () => "2026-05-24T00:00:00.000Z",
    });
    const snapshot = createResolvedBattleSnapshot();

    const original = await service.commitResolvedBattle(snapshot, level);
    const save = vi.spyOn(repository, "save");
    const retriedService = new BattleResultService({
      chatService: new ChatMessageService(repository),
      now: () => "2026-10-25T00:00:00.000Z",
    });
    const retried = await retriedService.commitResolvedBattle({
      ...snapshot,
      resultSummary: "不应覆盖的结果",
      battleLog: [],
      battleResult: { ...snapshot.battleResult!, turnCount: 99 },
    }, level === "verbose" ? "minimal" : "verbose");

    expect(save).not.toHaveBeenCalled();
    expect(retried.messages).toEqual(original.messages);
    expect(retried.summaries).toEqual(original.summaries);
    expect(await repository.list()).toEqual(original.messages);
    expect(retried.messages.filter((message) => message.ai_visible).map((message) => message.summary_level)).toEqual([level]);
  });
});
