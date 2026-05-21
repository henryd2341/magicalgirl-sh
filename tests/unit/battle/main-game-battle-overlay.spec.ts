import type { TriggerBattleToolEnvelope } from "@/orchestrator/toolEnvelope";
import MainGameView from "@/pages/MainGameView.vue";
import { router } from "@/router";
import { useBattleStore } from "@/stores/battleStore";
import { useSessionStore } from "@/stores/sessionStore";
import { fireEvent, render, screen, within } from "@testing-library/vue";
import { createPinia, setActivePinia } from "pinia";
import { describe, expect, it } from "vitest";

async function renderMainGameWithStores() {
  const pinia = createPinia();
  setActivePinia(pinia);
  await router.push("/game");
  await router.isReady();

  return {
    pinia,
    ...render(MainGameView, {
      global: {
        plugins: [pinia, router],
      },
    }),
  };
}

describe("MainGameView battle overlay entrypoint", () => {
  it("does not render the battle overlay before a pending or active battle exists", async () => {
    await renderMainGameWithStores();

    expect(
      screen.queryByRole("dialog", { name: "战斗进行中遮罩" }),
    ).not.toBeInTheDocument();
  });

  it("renders the pending battle overlay when the session is COMBAT_PENDING and a structured battle snapshot is staged", async () => {
    await renderMainGameWithStores();

    const sessionStore = useSessionStore();
    const battleStore = useBattleStore();

    sessionStore.enterCombatPending();
    battleStore.stagePendingEncounter({
      encounterId: "enc-overlay-001",
      narrativeReason: "教学楼楼梯间的影子突然鼓胀起来。",
      enemies: [{ enemy_id: "stairwell-wisp", count: 2 }],
    });

    expect(
      await screen.findByRole("dialog", { name: "战斗进行中遮罩" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Battle Pending")).toBeInTheDocument();
    expect(screen.getByText("enc-overlay-001")).toBeInTheDocument();
    expect(
      screen.getByText("教学楼楼梯间的影子突然鼓胀起来。"),
    ).toBeInTheDocument();
    expect(screen.getByText("stairwell-wisp")).toBeInTheDocument();
    expect(screen.getByText("×2")).toBeInTheDocument();
  });

  it("stages the pending battle overlay automatically after executeTriggerBattle succeeds", async () => {
    await renderMainGameWithStores();

    const sessionStore = useSessionStore();

    const result = await sessionStore.executeTriggerBattle({
      tool_name: "trigger_battle",
      request_id: "req-trigger-overlay-001",
      context_version: 1,
      state_hash: "initial",
      tool_call_id: "tool-trigger-overlay-001",
      input: {
        encounter_id: "enc-overlay-auto-001",
        enemies: [{ enemy_id: "shadow-graffiti", count: 2 }],
        narrative_reason: "镜面里的涂鸦影魔忽然探出了半个身子。",
      },
    } satisfies TriggerBattleToolEnvelope);

    expect(result.ok).toBe(true);
    expect(sessionStore.snapshot.sessionState).toBe("COMBAT_PENDING");

    expect(
      await screen.findByRole("dialog", { name: "战斗进行中遮罩" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Battle Pending")).toBeInTheDocument();
    expect(screen.getByText("enc-overlay-auto-001")).toBeInTheDocument();
    expect(screen.getByText("shadow-graffiti")).toBeInTheDocument();
    expect(screen.getByText("×2")).toBeInTheDocument();
  });

  it("renders the active battle overlay from formalized active battle view data", async () => {
    await renderMainGameWithStores();

    const sessionStore = useSessionStore();
    const battleStore = useBattleStore();

    const result = await sessionStore.executeTriggerBattle({
      tool_name: "trigger_battle",
      request_id: "req-trigger-overlay-002",
      context_version: 1,
      state_hash: "initial",
      tool_call_id: "tool-trigger-overlay-002",
      input: {
        encounter_id: "enc-overlay-active-001",
        enemies: [{ enemy_id: "corridor-shadow", count: 1 }],
        narrative_reason: "走廊尽头的影子忽然直立起来。",
      },
    } satisfies TriggerBattleToolEnvelope);

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
      },
    ]);

    expect(sessionStore.snapshot.sessionState).toBe("IN_COMBAT");
    expect(battleStore.activeBattle?.turnCount).toBe(1);
    expect(battleStore.activeBattle?.selectedTargetId).toBe("enemy-1");
    expect(battleStore.activeBattle?.currentActorId).toBe("player-heroine-1");
    expect(battleStore.activeBattle?.selectedActionId).toBe("attack");
    expect(battleStore.activeBattle?.actionMenu).toEqual([
      {
        id: "attack",
        label: "Attack",
        description: "使用基础攻击对单体敌人造成伤害。",
      },
      {
        id: "skill",
        label: "Skill",
        description: "施放角色技能并消耗对应资源。",
      },
      {
        id: "guard",
        label: "Guard",
        description: "进入防御姿态，减少即将受到的伤害。",
      },
      {
        id: "item",
        label: "Item",
        description: "使用背包中的道具支援当前战斗。",
      },
    ]);

    expect(
      await screen.findByRole("dialog", { name: "战斗进行中遮罩" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Battle Active")).toBeInTheDocument();
    expect(screen.getByText("PLAYER_COMMAND")).toBeInTheDocument();
    expect(screen.getByText("鹿目真昼")).toBeInTheDocument();
    expect(screen.getAllByText("corridor-shadow").length).toBeGreaterThan(0);
    expect(screen.getByLabelText("敌人区域")).toBeInTheDocument();
    expect(screen.getByLabelText("玩家队伍区域")).toBeInTheDocument();
    expect(screen.getByLabelText("行动指令区域")).toBeInTheDocument();
    expect(screen.getByLabelText("回合与 Press Turn 区域")).toBeInTheDocument();
    expect(screen.getByText("Enemy Sprite Placeholder")).toBeInTheDocument();
    expect(screen.getByText("Selected Target")).toBeInTheDocument();
    expect(screen.getByText("LV 1")).toBeInTheDocument();
    expect(screen.getByText("Portrait Placeholder")).toBeInTheDocument();
    expect(screen.getByText("当前行动者")).toBeInTheDocument();
    expect(screen.getByText("正常")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Attack" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "Skill" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(
      screen.getByText("使用基础攻击对单体敌人造成伤害。"),
    ).toBeInTheDocument();
    expect(screen.getByText("Turn Counts")).toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("Press Turn Icons")).toBeInTheDocument();
  });

  it("switches selected action in the overlay and updates the action description through battleStore", async () => {
    await renderMainGameWithStores();

    const sessionStore = useSessionStore();
    const battleStore = useBattleStore();

    const result = await sessionStore.executeTriggerBattle({
      tool_name: "trigger_battle",
      request_id: "req-trigger-overlay-003",
      context_version: 1,
      state_hash: "initial",
      tool_call_id: "tool-trigger-overlay-003",
      input: {
        encounter_id: "enc-overlay-active-002",
        enemies: [{ enemy_id: "clock-shadow", count: 1 }],
        narrative_reason: "钟楼投下的影子开始逆时针旋转。",
      },
    } satisfies TriggerBattleToolEnvelope);

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
      },
    ]);

    const attackButton = await screen.findByRole("button", { name: "Attack" });
    const skillButton = screen.getByRole("button", { name: "Skill" });

    expect(attackButton).toHaveAttribute("aria-pressed", "true");
    expect(skillButton).toHaveAttribute("aria-pressed", "false");
    expect(battleStore.activeBattle?.selectedActionId).toBe("attack");
    expect(
      screen.getByText("使用基础攻击对单体敌人造成伤害。"),
    ).toBeInTheDocument();

    await fireEvent.click(skillButton);

    expect(attackButton).toHaveAttribute("aria-pressed", "false");
    expect(skillButton).toHaveAttribute("aria-pressed", "true");
    expect(battleStore.activeBattle?.selectedActionId).toBe("skill");
    expect(
      screen.getByText("施放角色技能并消耗对应资源。"),
    ).toBeInTheDocument();
  });

  it("keeps the action UI unchanged when an invalid action selection is ignored by battleStore", async () => {
    await renderMainGameWithStores();

    const sessionStore = useSessionStore();
    const battleStore = useBattleStore();

    const result = await sessionStore.executeTriggerBattle({
      tool_name: "trigger_battle",
      request_id: "req-trigger-overlay-005",
      context_version: 1,
      state_hash: "initial",
      tool_call_id: "tool-trigger-overlay-005",
      input: {
        encounter_id: "enc-overlay-active-004",
        enemies: [{ enemy_id: "static-shadow", count: 1 }],
        narrative_reason: "静止的影子拒绝响应非法指令。",
      },
    } satisfies TriggerBattleToolEnvelope);

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
      },
    ]);

    const attackButton = await screen.findByRole("button", { name: "Attack" });
    const skillButton = screen.getByRole("button", { name: "Skill" });

    expect(attackButton).toHaveAttribute("aria-pressed", "true");
    expect(skillButton).toHaveAttribute("aria-pressed", "false");
    expect(
      screen.getByText("使用基础攻击对单体敌人造成伤害。"),
    ).toBeInTheDocument();

    battleStore.selectAction("missing-action");

    expect(battleStore.activeBattle?.selectedActionId).toBe("attack");
    expect(attackButton).toHaveAttribute("aria-pressed", "true");
    expect(skillButton).toHaveAttribute("aria-pressed", "false");
    expect(
      screen.getByText("使用基础攻击对单体敌人造成伤害。"),
    ).toBeInTheDocument();
  });

  it("switches selected target in the overlay and automatically resolves the selected attack through battleStore", async () => {
    await renderMainGameWithStores();

    const sessionStore = useSessionStore();
    const battleStore = useBattleStore();

    const result = await sessionStore.executeTriggerBattle({
      tool_name: "trigger_battle",
      request_id: "req-trigger-overlay-004",
      context_version: 1,
      state_hash: "initial",
      tool_call_id: "tool-trigger-overlay-004",
      input: {
        encounter_id: "enc-overlay-active-003",
        enemies: [{ enemy_id: "split-shadow", count: 2 }],
        narrative_reason: "分裂的影子在地面上互相追逐。",
      },
    } satisfies TriggerBattleToolEnvelope);

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
      },
    ]);

    if (battleStore.activeBattle === null) {
      throw new Error("expected active battle");
    }

    battleStore.activeBattle.participants = battleStore.activeBattle.participants.map(
      (participant) => {
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
      },
    );

    const enemyRegion = await screen.findByLabelText("敌人区域");
    const enemyButtons = within(enemyRegion).getAllByRole("button", {
      name: /split-shadow/,
    });

    expect(enemyButtons[0]).toHaveAttribute("aria-pressed", "true");
    expect(enemyButtons[1]).toHaveAttribute("aria-pressed", "false");
    expect(battleStore.activeBattle?.selectedTargetId).toBe("enemy-1");

    await fireEvent.click(enemyButtons[1]);

    expect(enemyButtons[0]).toHaveAttribute("aria-pressed", "false");
    expect(enemyButtons[1]).toHaveAttribute("aria-pressed", "true");
    expect(battleStore.activeBattle?.selectedTargetId).toBe("enemy-2");
    expect(battleStore.activeBattle?.phase).toBe("ENEMY_TURN");
    expect(battleStore.activeBattle?.pressTurn).toEqual({
      totalIcons: 1,
      spentIcons: 1,
    });

    const selectedTargetHeading = within(enemyRegion).getByText("Selected Target");
    const selectedTargetPanel = selectedTargetHeading.parentElement;

    expect(selectedTargetPanel).not.toBeNull();
    expect(
      within(selectedTargetPanel!).getByText("split-shadow"),
    ).toBeInTheDocument();
    expect(within(selectedTargetPanel!).getByText("LV 1")).toBeInTheDocument();
  });

  it("keeps the target UI unchanged when invalid target selections are ignored by battleStore", async () => {
    await renderMainGameWithStores();

    const sessionStore = useSessionStore();
    const battleStore = useBattleStore();

    const result = await sessionStore.executeTriggerBattle({
      tool_name: "trigger_battle",
      request_id: "req-trigger-overlay-006",
      context_version: 1,
      state_hash: "initial",
      tool_call_id: "tool-trigger-overlay-006",
      input: {
        encounter_id: "enc-overlay-active-005",
        enemies: [{ enemy_id: "anchored-shadow", count: 2 }],
        narrative_reason: "锚定的影子不会被非法目标切换扰乱。",
      },
    } satisfies TriggerBattleToolEnvelope);

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
      },
    ]);

    const enemyRegion = await screen.findByLabelText("敌人区域");
    const enemyButtons = within(enemyRegion).getAllByRole("button", {
      name: /anchored-shadow/,
    });
    const selectedTargetHeading = within(enemyRegion).getByText("Selected Target");
    const selectedTargetPanel = selectedTargetHeading.parentElement;

    expect(enemyButtons[0]).toHaveAttribute("aria-pressed", "true");
    expect(enemyButtons[1]).toHaveAttribute("aria-pressed", "false");
    expect(selectedTargetPanel).not.toBeNull();
    expect(
      within(selectedTargetPanel!).getByText("anchored-shadow"),
    ).toBeInTheDocument();
    expect(within(selectedTargetPanel!).getByText("LV 1")).toBeInTheDocument();

    battleStore.selectTarget("player-heroine-1");
    battleStore.selectTarget("enemy-999");

    expect(battleStore.activeBattle?.selectedTargetId).toBe("enemy-1");
    expect(enemyButtons[0]).toHaveAttribute("aria-pressed", "true");
    expect(enemyButtons[1]).toHaveAttribute("aria-pressed", "false");
    expect(
      within(selectedTargetPanel!).getByText("anchored-shadow"),
    ).toBeInTheDocument();
    expect(within(selectedTargetPanel!).getByText("LV 1")).toBeInTheDocument();
  });

  it("provides a temporary main game test entry that boots directly into an active battle overlay", async () => {
    await renderMainGameWithStores();

    const launchButton = screen.getByRole("button", {
      name: "测试用：启动预置战斗",
    });

    await fireEvent.click(launchButton);

    expect(
      await screen.findByRole("dialog", { name: "战斗进行中遮罩" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Battle Active")).toBeInTheDocument();
    expect(screen.getByText("enc-main-game-debug-battle")).toBeInTheDocument();
    expect(screen.getByText("鹿目真昼")).toBeInTheDocument();
    expect(screen.getAllByText("debug-shadow").length).toBeGreaterThan(0);
  });
});
