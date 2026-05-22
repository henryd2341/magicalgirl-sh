import MainGameView from "@/pages/MainGameView.vue";
import { useBattleStore } from "@/stores/battleStore";
import { useSessionStore } from "@/stores/sessionStore";
import { fireEvent, render, screen, within } from "@testing-library/vue";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it } from "vitest";

async function renderMainGameWithStores() {
  const pinia = createPinia();
  setActivePinia(pinia);

  return render(MainGameView, {
    global: {
      plugins: [pinia],
    },
  });
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

    battleStore.startBattle([
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
      await screen.findByRole("heading", { name: "Battle" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Encounter: enc-main-game-overlay-001"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("影魔从走廊镜面里爬出来，触发战斗浮层。"),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Attack" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Pass" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Swap" })).toBeInTheDocument();
  });

  it("shows enemy targets from the active battle snapshot and highlights the current default target", async () => {
    await renderMainGameWithStores();

    const sessionStore = useSessionStore();
    const battleStore = useBattleStore();

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

    battleStore.startBattle([
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

    battleStore.startBattle([
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

    battleStore.startBattle([
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
    const battleStore = useBattleStore();

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

    battleStore.startBattle([
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

    battleStore.startBattle([
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

    battleStore.startBattle([
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
});
