import { useBattleStore } from "@/stores/battleStore";
import { useChatStore } from "@/stores/chatStore";
import { useSessionStore } from "@/stores/sessionStore";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it } from "vitest";

describe("post-combat continuation orchestration", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it("continues from POST_COMBAT_READY through the fake provider with minimal battle summary context", async () => {
    const sessionStore = useSessionStore();
    const battleStore = useBattleStore();
    const chatStore = useChatStore();

    await sessionStore.executeTriggerBattle({
      tool_name: "trigger_battle",
      request_id: "req-post-combat-continuation-001",
      context_version: 1,
      state_hash: "initial",
      tool_call_id: "tool-post-combat-continuation-001",
      input: {
        encounter_id: "enc-post-combat-continuation-001",
        enemies: [{ enemy_id: "continuation-shadow", count: 1 }],
        narrative_reason: "战后续写测试。",
      },
    });
    sessionStore.startBattle([
      {
        id: "player-heroine-1",
        side: "player",
        displayName: "鹿目真昼",
        hp: {
          current: 120,
          max: 120,
        },
        mp: {
          current: 48,
          max: 48,
        },
        isDown: false,
        isActive: true,
      },
    ]);
    battleStore.activeBattle = {
      ...battleStore.activeBattle!,
      lifecycleState: "RESOLVED",
      phase: "RESULT",
      battleResult: {
        outcome: "victory",
        winningSide: "player",
        endReason: "all_enemies_down",
        turnCount: 1,
        survivingParticipantIds: ["player-heroine-1"],
        downParticipantIds: ["enemy-1"],
      },
      resultSummary: "Victory",
      battleLog: [
        {
          id: "turn-1-result-victory",
          turnCount: 1,
          side: "system",
          summary: "Victory: all enemies are down.",
        },
      ],
    };

    await sessionStore.completeActiveBattle();
    const result = await sessionStore.continuePostCombatStory();

    expect(result.ok).toBe(true);
    expect(sessionStore.snapshot.sessionState).toBe("IDLE");
    expect(result.request?.promptText).toContain("outcome: victory");
    expect(result.request?.promptText).not.toContain("Victory\n");
    expect(result.request?.messages).toContainEqual({
      role: "system",
      content: expect.stringContaining("outcome: victory"),
    });
    expect(chatStore.messages).toContainEqual(
      expect.objectContaining({
        role: "user",
        content: "请根据最近的战斗摘要继续剧情。",
        user_visible: false,
        ai_visible: true,
      }),
    );
    expect(chatStore.messages).toContainEqual(
      expect.objectContaining({
        role: "assistant",
        content: "战斗后的空气慢慢安静下来，新的选择浮现在你面前。",
        finalized: true,
      }),
    );
  });
});
