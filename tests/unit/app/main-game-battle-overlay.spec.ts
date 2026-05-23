import MainGameView from "@/pages/MainGameView.vue";
import { router } from "@/router";
import { useBattleStore } from "@/stores/battleStore";
import { useChatStore } from "@/stores/chatStore";
import { useSessionStore } from "@/stores/sessionStore";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/vue";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it } from "vitest";

async function renderMainGameWithStores() {
  const pinia = createPinia();
  setActivePinia(pinia);
  await router.push("/game");
  await router.isReady();

  return render(MainGameView, {
    global: {
      plugins: [pinia, router],
    },
  });
}

async function waitForActiveBattleOverlay() {
  await screen.findByRole("heading", { name: "战斗进行中" });
}

describe("MainGameView battle overlay entrypoint", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it("renders the battle overlay after trigger_battle enters COMBAT_PENDING and startBattle is called", async () => {
    await renderMainGameWithStores();

    const sessionStore = useSessionStore();
    const battleStore = useBattleStore();

    const result = await sessionStore.executeTriggerBattle({
      tool_name: "trigger_battle",
      request_id: "req-trigger-overlay-001",
      context_version: 1,
      state_hash: "initial",
      tool_call_id: "tool-trigger-overlay-001",
      input: {
        encounter_id: "enc-main-game-overlay-001",
        enemies: [{ enemy_id: "school-shadow", count: 2 }],
        narrative_reason: "影魔从走廊镜面里爬出来，触发战斗浮层。",
      },
    });

    expect(result.ok).toBe(true);
    expect(sessionStore.snapshot.sessionState).toBe("COMBAT_PENDING");
    expect(battleStore.pendingBattle).not.toBeNull();

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

    expect(
      await screen.findByRole("heading", { name: "战斗进行中" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Battle Active")).toBeInTheDocument();
    expect(screen.getByText("enc-main-game-overlay-001")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Attack" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Pass" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Swap" })).toBeInTheDocument();
  });

  it("shows enemy targets from the active battle snapshot and highlights the current default target", async () => {
    await renderMainGameWithStores();

    const sessionStore = useSessionStore();

    await sessionStore.executeTriggerBattle({
      tool_name: "trigger_battle",
      request_id: "req-trigger-overlay-002",
      context_version: 1,
      state_hash: "initial",
      tool_call_id: "tool-trigger-overlay-002",
      input: {
        encounter_id: "enc-main-game-overlay-002",
        enemies: [{ enemy_id: "split-shadow", count: 2 }],
        narrative_reason: "双体敌人用于测试默认目标高亮。",
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

    await waitForActiveBattleOverlay();

    const enemyRegion = await screen.findByLabelText("敌人区域");
    const enemyButtons = within(enemyRegion).getAllByRole("button", {
      name: /split-shadow/,
    });

    expect(enemyButtons).toHaveLength(2);
    expect(enemyButtons[0]).toHaveAttribute("aria-pressed", "true");
    expect(enemyButtons[1]).toHaveAttribute("aria-pressed", "false");
  });

  it("opens a command group from the overlay without executing an action immediately", async () => {
    await renderMainGameWithStores();

    const sessionStore = useSessionStore();
    const battleStore = useBattleStore();

    await sessionStore.executeTriggerBattle({
      tool_name: "trigger_battle",
      request_id: "req-trigger-overlay-003",
      context_version: 1,
      state_hash: "initial",
      tool_call_id: "tool-trigger-overlay-003",
      input: {
        encounter_id: "enc-main-game-overlay-003",
        enemies: [{ enemy_id: "group-shadow", count: 1 }],
        narrative_reason: "技能分组菜单打开测试。",
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

    await waitForActiveBattleOverlay();

    await fireEvent.click(screen.getByRole("button", { name: "Skill" }));

    expect(battleStore.activeBattle?.currentMenuNodeId).toBe("skill-group");
    expect(battleStore.activeBattle?.selectedActionId).toBeNull();
    expect(
      screen.getByRole("button", { name: "Basic Skill" }),
    ).toBeInTheDocument();
  });

  it("executes a none-mode action from the overlay immediately after action selection", async () => {
    await renderMainGameWithStores();

    const sessionStore = useSessionStore();
    const battleStore = useBattleStore();

    await sessionStore.executeTriggerBattle({
      tool_name: "trigger_battle",
      request_id: "req-trigger-overlay-004",
      context_version: 1,
      state_hash: "initial",
      tool_call_id: "tool-trigger-overlay-004",
      input: {
        encounter_id: "enc-main-game-overlay-004",
        enemies: [{ enemy_id: "pass-shadow", count: 1 }],
        narrative_reason: "Pass 立即执行测试。",
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
      {
        id: "player-heroine-2",
        side: "player",
        displayName: "雾岛光",
        hp: {
          current: 100,
          max: 100,
        },
        mp: {
          current: 36,
          max: 36,
        },
        isDown: false,
        isActive: true,
      },
    ]);

    await waitForActiveBattleOverlay();

    await fireEvent.click(screen.getByRole("button", { name: "Pass" }));

    expect(battleStore.activeBattle?.selectedActionId).toBe("pass");
    expect(battleStore.activeBattle?.currentActorId).toBe("player-heroine-2");
    expect(battleStore.activeBattle?.pressTurn.icons).toEqual([
      { id: "pt-player-player-heroine-1-1", state: "solid" },
      { id: "pt-player-player-heroine-2-2", state: "blinking" },
    ]);
  });

  it("marks the selected command button inside the overlay action palette", async () => {
    await renderMainGameWithStores();

    const sessionStore = useSessionStore();

    await sessionStore.executeTriggerBattle({
      tool_name: "trigger_battle",
      request_id: "req-trigger-overlay-005",
      context_version: 1,
      state_hash: "initial",
      tool_call_id: "tool-trigger-overlay-005",
      input: {
        encounter_id: "enc-main-game-overlay-005",
        enemies: [{ enemy_id: "palette-shadow", count: 2 }],
        narrative_reason: "命令按钮高亮测试。",
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

    await waitForActiveBattleOverlay();

    const attackButton = screen.getByRole("button", { name: "Attack" });
    const skillButton = screen.getByRole("button", { name: "Skill" });

    expect(attackButton).toHaveAttribute("aria-pressed", "false");
    expect(skillButton).toHaveAttribute("aria-pressed", "false");

    await fireEvent.click(attackButton);

    expect(attackButton).toHaveAttribute("aria-pressed", "true");
    expect(skillButton).toHaveAttribute("aria-pressed", "false");
  });

  it("switches selected target in the overlay and automatically resolves the selected attack through battleStore", async () => {
    await renderMainGameWithStores();

    const sessionStore = useSessionStore();
    const battleStore = useBattleStore();

    await sessionStore.executeTriggerBattle({
      tool_name: "trigger_battle",
      request_id: "req-trigger-overlay-006",
      context_version: 1,
      state_hash: "initial",
      tool_call_id: "tool-trigger-overlay-006",
      input: {
        encounter_id: "enc-main-game-overlay-006",
        enemies: [{ enemy_id: "split-shadow", count: 2 }],
        narrative_reason: "点击目标后应自动结算攻击。",
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

    await waitForActiveBattleOverlay();

    if (battleStore.activeBattle === null) {
      throw new Error("expected active battle");
    }

    battleStore.activeBattle.participants =
      battleStore.activeBattle.participants.map((participant) => {
        if (participant.id !== "enemy-2") {
          return participant;
        }

        return {
          ...participant,
          hp: {
            current: 2,
            max: 2,
          },
        };
      });

    await fireEvent.click(screen.getByRole("button", { name: "Attack" }));

    const enemyRegion = await screen.findByLabelText("敌人区域");
    const enemyButtons = within(enemyRegion).getAllByRole("button", {
      name: /split-shadow/,
    });

    expect(enemyButtons[0]).toHaveAttribute("aria-pressed", "true");
    expect(enemyButtons[1]).toHaveAttribute("aria-pressed", "false");
    expect(battleStore.activeBattle?.selectedTargetId).toBe("enemy-1");

    await fireEvent.click(enemyButtons[1]);

    expect(battleStore.activeBattle?.selectedTargetId).toBe("enemy-2");
    expect(battleStore.activeBattle?.phase).toBe("ENEMY_TURN");
    expect(battleStore.activeBattle?.pressTurn.icons).toEqual([]);
    expect(
      battleStore.activeBattle?.participants.find(
        (participant) => participant.id === "enemy-2",
      )?.hp.current,
    ).toBe(1);
    expect(
      battleStore.activeBattle?.participants.find(
        (participant) => participant.id === "enemy-1",
      )?.hp.current,
    ).toBe(1);
  });

  it("keeps the target UI unchanged when invalid target selections are ignored by battleStore", async () => {
    await renderMainGameWithStores();

    const sessionStore = useSessionStore();
    const battleStore = useBattleStore();

    const result = await sessionStore.executeTriggerBattle({
      tool_name: "trigger_battle",
      request_id: "req-trigger-overlay-007",
      context_version: 1,
      state_hash: "initial",
      tool_call_id: "tool-trigger-overlay-007",
      input: {
        encounter_id: "enc-main-game-overlay-007",
        enemies: [{ enemy_id: "split-shadow", count: 1 }],
        narrative_reason: "非法目标点击不会改变 UI。",
      },
    });

    expect(result.ok).toBe(true);

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
      {
        id: "player-heroine-2",
        side: "player",
        displayName: "雾岛光",
        hp: {
          current: 100,
          max: 100,
        },
        mp: {
          current: 36,
          max: 36,
        },
        isDown: false,
        isActive: true,
      },
    ]);

    await waitForActiveBattleOverlay();

    await fireEvent.click(screen.getByRole("button", { name: "Item" }));
    await fireEvent.click(screen.getByRole("button", { name: "Basic Item" }));

    const enemyRegion = await screen.findByLabelText("敌人区域");
    const enemyButton = within(enemyRegion).getByRole("button", {
      name: /split-shadow/,
    });

    expect(enemyButton).toHaveAttribute("aria-pressed", "false");

    await fireEvent.click(enemyButton);

    expect(enemyButton).toHaveAttribute("aria-pressed", "false");
    expect(battleStore.activeBattle?.selectedTargetId).toBe("enemy-1");
    expect(battleStore.activeBattle?.selectedActionId).toBe("basic-item");
  });

  it("commits result summaries and enters POST_COMBAT_READY after a resolved battle is completed", async () => {
    await renderMainGameWithStores();

    const sessionStore = useSessionStore();
    const battleStore = useBattleStore();
    const chatStore = useChatStore();

    await sessionStore.executeTriggerBattle({
      tool_name: "trigger_battle",
      request_id: "req-trigger-overlay-008",
      context_version: 1,
      state_hash: "initial",
      tool_call_id: "tool-trigger-overlay-008",
      input: {
        encounter_id: "enc-main-game-overlay-008",
        enemies: [{ enemy_id: "result-shadow", count: 1 }],
        narrative_reason: "测试战斗结果提交。",
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

    await waitForActiveBattleOverlay();
    await fireEvent.click(screen.getByRole("button", { name: "Attack" }));
    await fireEvent.click(screen.getByRole("button", { name: /result-shadow/ }));

    expect(battleStore.activeBattle?.lifecycleState).toBe("RESOLVED");
    expect(battleStore.activeBattle?.phase).toBe("RESULT");

    await fireEvent.click(screen.getByRole("button", { name: "完成战斗" }));

    await waitFor(() => {
      expect(sessionStore.snapshot.sessionState).toBe("POST_COMBAT_READY");
    });
    expect(chatStore.messages.map((message) => message.summary_level)).toEqual([
      "verbose",
      "default",
      "minimal",
    ]);
    expect(
      chatStore.messages.find((message) => message.summary_level === "default"),
    ).toMatchObject({
      role: "system",
      kind: "battle_summary",
      user_visible: true,
      ai_visible: false,
      finalized: true,
    });
    expect(screen.getByText(/Victory/)).toBeInTheDocument();
    expect(screen.queryByText("outcome: victory")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "继续剧情" }),
    ).toBeInTheDocument();
  });

  it("starts a post-combat continuation request from POST_COMBAT_READY", async () => {
    await renderMainGameWithStores();

    const sessionStore = useSessionStore();

    await sessionStore.executeTriggerBattle({
      tool_name: "trigger_battle",
      request_id: "req-trigger-overlay-009",
      context_version: 1,
      state_hash: "initial",
      tool_call_id: "tool-trigger-overlay-009",
      input: {
        encounter_id: "enc-main-game-overlay-009",
        enemies: [{ enemy_id: "post-combat-shadow", count: 1 }],
        narrative_reason: "测试战后继续剧情。",
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
    await waitForActiveBattleOverlay();

    const battleStore = useBattleStore();
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

    await fireEvent.click(
      await screen.findByRole("button", { name: "完成战斗" }),
    );
    await fireEvent.click(
      await screen.findByRole("button", { name: "继续剧情" }),
    );

    expect(sessionStore.snapshot.sessionState).toBe("GENERATING");
    expect(sessionStore.snapshot.activeRequestId).toMatch(
      /^post-combat-continue-/,
    );
  });
});
