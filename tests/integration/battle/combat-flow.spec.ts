import { useBattleStore } from "@/stores/battleStore";
import { useChatStore } from "@/stores/chatStore";
import { useSessionStore } from "@/stores/sessionStore";
import type { BattleParticipant } from "@/types/battle";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it } from "vitest";

function createPlayerParty(): BattleParticipant[] {
  return [
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
  ];
}

async function triggerBattle({
  encounterId,
  enemyId,
  narrativeReason,
}: {
  encounterId: string;
  enemyId: string;
  narrativeReason: string;
}) {
  const sessionStore = useSessionStore();

  return sessionStore.executeTriggerBattle({
    tool_name: "trigger_battle",
    request_id: `req-${encounterId}`,
    context_version: 1,
    state_hash: "initial",
    tool_call_id: `tool-${encounterId}`,
    input: {
      encounter_id: encounterId,
      enemies: [{ enemy_id: enemyId, count: 1 }],
      narrative_reason: narrativeReason,
    },
  });
}

describe("combat flow integration", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it("cancels a pending combat encounter back to idle without leaving staged battle state", async () => {
    const sessionStore = useSessionStore();
    const battleStore = useBattleStore();

    const result = await triggerBattle({
      encounterId: "enc-integration-cancel-pending",
      enemyId: "cancel-shadow",
      narrativeReason: "集成测试取消战斗挂起态。",
    });

    expect(result.ok).toBe(true);
    expect(sessionStore.snapshot.sessionState).toBe("COMBAT_PENDING");
    expect(battleStore.pendingBattle).not.toBeNull();

    sessionStore.cancelPendingBattle();

    expect(sessionStore.snapshot.sessionState).toBe("IDLE");
    expect(sessionStore.snapshot.activeRequestId).toBeNull();
    expect(battleStore.pendingBattle).toBeNull();
    expect(battleStore.activeBattle).toBeNull();
  });

  it("runs pending, active combat, result submission, and fake-provider continuation as one state flow", async () => {
    const sessionStore = useSessionStore();
    const battleStore = useBattleStore();
    const chatStore = useChatStore();

    const triggerResult = await triggerBattle({
      encounterId: "enc-integration-combat-flow",
      enemyId: "integration-shadow",
      narrativeReason: "集成测试完整战斗闭环。",
    });

    expect(triggerResult.ok).toBe(true);
    expect(sessionStore.snapshot.sessionState).toBe("COMBAT_PENDING");
    expect(battleStore.pendingBattle?.encounterId).toBe(
      "enc-integration-combat-flow",
    );

    sessionStore.startBattle(createPlayerParty());

    expect(sessionStore.snapshot.sessionState).toBe("IN_COMBAT");
    expect(battleStore.pendingBattle).toBeNull();
    expect(battleStore.activeBattle?.phase).toBe("PLAYER_COMMAND");
    expect(battleStore.activeBattle?.turnCount).toBe(1);

    battleStore.activeBattle!.participants =
      battleStore.activeBattle!.participants.map((participant) =>
        participant.side === "enemy"
          ? {
              ...participant,
              hp: {
                current: 2,
                max: 2,
              },
            }
          : participant,
      );

    battleStore.selectAction("attack");
    battleStore.selectTarget("enemy-1");

    expect(sessionStore.snapshot.sessionState).toBe("IN_COMBAT");
    expect(battleStore.activeBattle?.lifecycleState).toBe("RESOLVED");
    expect(battleStore.activeBattle?.phase).toBe("RESULT");

    await sessionStore.completeActiveBattle();

    expect(sessionStore.snapshot.sessionState).toBe("POST_COMBAT_READY");
    expect(chatStore.messages.map((message) => message.summary_level)).toEqual([
      "verbose",
      "default",
      "minimal",
    ]);

    const continuationResult = await sessionStore.continuePostCombatStory();

    expect(continuationResult.ok).toBe(true);
    expect(sessionStore.snapshot.sessionState).toBe("IDLE");
    expect(sessionStore.snapshot.activeRequestId).toBeNull();
    expect(continuationResult.request?.promptText).toContain(
      "outcome: victory",
    );
    expect(continuationResult.request?.promptText).not.toContain("Victory\n");
    expect(continuationResult.request?.messages).toContainEqual({
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
