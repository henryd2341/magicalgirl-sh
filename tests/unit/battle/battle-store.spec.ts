import { useBattleStore } from "@/stores/battleStore";
import { useSessionStore } from "@/stores/sessionStore";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it } from "vitest";

describe("battleStore", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it("starts idle and can stage a structured pending battle snapshot for the overlay entrypoint", () => {
    const store = useBattleStore();

    expect(store.pendingBattle).toBeNull();
    expect(store.activeBattle).toBeNull();

    store.stagePendingEncounter({
      encounterId: "enc-battle-store-001",
      narrativeReason: "影魔从教学楼背面的玻璃反光里浮出来。",
      enemies: [
        {
          enemy_id: "shadow-graffiti",
          count: 2,
        },
      ],
    });

    expect(store.pendingBattle).toEqual({
      lifecycleState: "PENDING",
      encounterId: "enc-battle-store-001",
      narrativeReason: "影魔从教学楼背面的玻璃反光里浮出来。",
      enemies: [
        {
          instanceId: "enemy-1",
          enemyId: "shadow-graffiti",
          displayName: "shadow-graffiti",
          side: "enemy",
        },
        {
          instanceId: "enemy-2",
          enemyId: "shadow-graffiti",
          displayName: "shadow-graffiti",
          side: "enemy",
        },
      ],
    });
    expect(store.activeBattle).toBeNull();
  });

  it("can clear the staged pending battle snapshot after the overlay entrypoint is dismissed or resolved", () => {
    const store = useBattleStore();

    store.stagePendingEncounter({
      encounterId: "enc-battle-store-002",
      narrativeReason: "测试清理。",
      enemies: [{ enemy_id: "cleanup-shadow", count: 1 }],
    });
    store.clearPendingEncounter();

    expect(store.pendingBattle).toBeNull();
    expect(store.activeBattle).toBeNull();
  });

  it("syncs a structured pending battle snapshot into the battle store after sessionStore.executeTriggerBattle succeeds", async () => {
    const battleStore = useBattleStore();
    const sessionStore = useSessionStore();

    const result = await sessionStore.executeTriggerBattle({
      tool_name: "trigger_battle",
      request_id: "req-battle-store-sync-001",
      context_version: 1,
      state_hash: "initial",
      tool_call_id: "tool-battle-store-sync-001",
      input: {
        encounter_id: "enc-battle-store-sync-001",
        enemies: [{ enemy_id: "shadow-graffiti", count: 2 }],
        narrative_reason: "战斗 store 应自动同步 encounter 信息。",
      },
    });

    expect(result.ok).toBe(true);
    expect(sessionStore.snapshot.sessionState).toBe("COMBAT_PENDING");
    expect(battleStore.pendingBattle).toEqual({
      lifecycleState: "PENDING",
      encounterId: "enc-battle-store-sync-001",
      narrativeReason: "战斗 store 应自动同步 encounter 信息。",
      enemies: [
        {
          instanceId: "enemy-1",
          enemyId: "shadow-graffiti",
          displayName: "shadow-graffiti",
          side: "enemy",
        },
        {
          instanceId: "enemy-2",
          enemyId: "shadow-graffiti",
          displayName: "shadow-graffiti",
          side: "enemy",
        },
      ],
    });
    expect(battleStore.activeBattle).toBeNull();
  });

  it("starts an active battle from the pending battle snapshot and clears pendingBattle", () => {
    const store = useBattleStore();

    store.stagePendingEncounter({
      encounterId: "enc-battle-store-003",
      narrativeReason: "楼顶天线旁的影子扭曲成了战斗姿态。",
      enemies: [{ enemy_id: "antenna-shadow", count: 2 }],
    });

    store.startBattle([
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

    expect(store.pendingBattle).toBeNull();
    expect(store.activeBattle).toEqual({
      lifecycleState: "ACTIVE",
      phase: "PLAYER_COMMAND",
      encounterId: "enc-battle-store-003",
      participants: [
        {
          id: "player-heroine-1",
          side: "player",
          displayName: "鹿目真昼",
          level: 1,
          hp: {
            current: 120,
            max: 120,
          },
          mp: {
            current: 48,
            max: 48,
          },
          isDown: false,
          statusEffects: [],
        },
        {
          id: "enemy-1",
          side: "enemy",
          displayName: "antenna-shadow",
          level: 1,
          hp: {
            current: 1,
            max: 1,
          },
          mp: {
            current: 0,
            max: 0,
          },
          isDown: false,
          statusEffects: [],
        },
        {
          id: "enemy-2",
          side: "enemy",
          displayName: "antenna-shadow",
          level: 1,
          hp: {
            current: 1,
            max: 1,
          },
          mp: {
            current: 0,
            max: 0,
          },
          isDown: false,
          statusEffects: [],
        },
      ],
      pressTurn: {
        totalIcons: 1,
        spentIcons: 0,
      },
      turnCount: 1,
      selectedTargetId: "enemy-1",
      currentActorId: "player-heroine-1",
      selectedActionId: "attack",
      actionMenu: [
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
      ],
    });
  });

  it("updates selectedTargetId and selectedActionId through store actions while battle is active", () => {
    const store = useBattleStore();

    store.stagePendingEncounter({
      encounterId: "enc-battle-store-004",
      narrativeReason: "影子分裂成了两个目标。",
      enemies: [{ enemy_id: "dual-shadow", count: 2 }],
    });

    store.startBattle([
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

    store.selectAction("skill");
    store.selectTarget("enemy-2");

    expect(store.activeBattle?.selectedTargetId).toBe("enemy-2");
    expect(store.activeBattle?.selectedActionId).toBe("skill");
  });

  it("ignores invalid selectedTargetId and selectedActionId inputs instead of mutating active battle selection", () => {
    const store = useBattleStore();

    store.stagePendingEncounter({
      encounterId: "enc-battle-store-005",
      narrativeReason: "错误目标不应污染当前选择。",
      enemies: [{ enemy_id: "guarded-shadow", count: 2 }],
    });

    store.startBattle([
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

    store.selectTarget("player-heroine-1");
    store.selectTarget("enemy-999");
    store.selectAction("missing-action");

    expect(store.activeBattle?.selectedTargetId).toBe("enemy-1");
    expect(store.activeBattle?.selectedActionId).toBe("attack");
  });

  it("automatically resolves the selected attack after a valid target is chosen and advances into ENEMY_TURN when icons are exhausted", () => {
    const store = useBattleStore();

    store.stagePendingEncounter({
      encounterId: "enc-battle-store-006",
      narrativeReason: "选择目标后应自动执行基础攻击。",
      enemies: [{ enemy_id: "enduring-shadow", count: 2 }],
    });

    store.startBattle([
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

    if (store.activeBattle === null) {
      throw new Error("expected active battle");
    }

    store.activeBattle.participants = store.activeBattle.participants.map(
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

    store.selectTarget("enemy-2");

    expect(store.activeBattle?.selectedTargetId).toBe("enemy-2");
    expect(store.activeBattle?.lifecycleState).toBe("ACTIVE");
    expect(store.activeBattle?.phase).toBe("ENEMY_TURN");
    expect(store.activeBattle?.pressTurn).toEqual({
      totalIcons: 1,
      spentIcons: 1,
    });
    expect(store.activeBattle?.participants.find((p) => p.id === "enemy-2")).toMatchObject({
      hp: {
        current: 1,
        max: 2,
      },
      isDown: false,
    });
  });

  it("automatically resolves the selected attack after a valid target is chosen and keeps PLAYER_COMMAND when icons remain", () => {
    const store = useBattleStore();

    store.stagePendingEncounter({
      encounterId: "enc-battle-store-008",
      narrativeReason: "图标未耗尽时应自动执行但仍留在玩家回合。",
      enemies: [{ enemy_id: "lingering-shadow", count: 2 }],
    });

    store.startBattle([
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

    if (store.activeBattle === null) {
      throw new Error("expected active battle");
    }

    store.activeBattle.participants = store.activeBattle.participants.map(
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

    store.selectTarget("enemy-2");

    expect(store.activeBattle?.selectedTargetId).toBe("enemy-2");
    expect(store.activeBattle?.lifecycleState).toBe("ACTIVE");
    expect(store.activeBattle?.phase).toBe("PLAYER_COMMAND");
    expect(store.activeBattle?.pressTurn).toEqual({
      totalIcons: 2,
      spentIcons: 1,
    });
    expect(store.activeBattle?.participants.find((p) => p.id === "enemy-2")).toMatchObject({
      hp: {
        current: 1,
        max: 2,
      },
      isDown: false,
    });
  });

  it("does not auto-resolve when a target is selected for an unimplemented non-attack action", () => {
    const store = useBattleStore();

    store.stagePendingEncounter({
      encounterId: "enc-battle-store-010",
      narrativeReason: "未实现行动不应因为选 target 自动污染状态。",
      enemies: [{ enemy_id: "sealed-shadow", count: 1 }],
    });

    store.startBattle([
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

    if (store.activeBattle === null) {
      throw new Error("expected active battle");
    }

    store.selectAction("skill");
    const previousSnapshot = JSON.parse(JSON.stringify(store.activeBattle));

    store.selectTarget("enemy-1");

    expect(store.activeBattle).toEqual({
      ...previousSnapshot,
      selectedTargetId: "enemy-1",
    });
  });

  it("does not auto-resolve when target selection happens outside PLAYER_COMMAND", () => {
    const store = useBattleStore();

    store.stagePendingEncounter({
      encounterId: "enc-battle-store-009",
      narrativeReason: "非玩家指令阶段选 target 不应触发行动。",
      enemies: [{ enemy_id: "frozen-shadow", count: 1 }],
    });

    store.startBattle([
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

    if (store.activeBattle === null) {
      throw new Error("expected active battle");
    }

    store.activeBattle.phase = "ENEMY_TURN";
    const previousSnapshot = JSON.parse(JSON.stringify(store.activeBattle));

    store.selectTarget("enemy-1");

    expect(store.activeBattle).toEqual({
      ...previousSnapshot,
      selectedTargetId: "enemy-1",
    });
  });

  it("resolves the battle when the final enemy is automatically defeated after target selection", () => {
    const store = useBattleStore();

    store.stagePendingEncounter({
      encounterId: "enc-battle-store-007",
      narrativeReason: "最后一只影魔在选定目标后自动被基础攻击击倒。",
      enemies: [{ enemy_id: "last-shadow", count: 1 }],
    });

    store.startBattle([
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

    store.selectTarget("enemy-1");

    expect(store.activeBattle?.selectedTargetId).toBe("enemy-1");
    expect(store.activeBattle?.lifecycleState).toBe("RESOLVED");
    expect(store.activeBattle?.phase).toBe("RESULT");
    expect(store.activeBattle?.resultSummary).toBe("Victory");
    expect(store.activeBattle?.pressTurn).toEqual({
      totalIcons: 1,
      spentIcons: 1,
    });
    expect(store.activeBattle?.participants.find((p) => p.id === "enemy-1")).toMatchObject({
      hp: {
        current: 0,
        max: 1,
      },
      isDown: true,
    });
  });

  it("throws when startBattle is called without a pending battle snapshot", () => {
    const store = useBattleStore();

    expect(() => {
      store.startBattle([
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
    }).toThrow(
      "[BATTLE_PENDING_REQUIRED] Cannot start battle without a pending battle snapshot.",
    );
  });

  it("starts battle through sessionStore.startBattle and advances the FSM into IN_COMBAT", async () => {
    const battleStore = useBattleStore();
    const sessionStore = useSessionStore();

    const result = await sessionStore.executeTriggerBattle({
      tool_name: "trigger_battle",
      request_id: "req-battle-store-sync-002",
      context_version: 1,
      state_hash: "initial",
      tool_call_id: "tool-battle-store-sync-002",
      input: {
        encounter_id: "enc-battle-store-sync-002",
        enemies: [{ enemy_id: "corridor-shadow", count: 1 }],
        narrative_reason: "走廊尽头的影子张开了嘴。",
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
      },
    ]);

    expect(sessionStore.snapshot.sessionState).toBe("IN_COMBAT");
    expect(battleStore.pendingBattle).toBeNull();
    expect(battleStore.activeBattle).toEqual({
      lifecycleState: "ACTIVE",
      phase: "PLAYER_COMMAND",
      encounterId: "enc-battle-store-sync-002",
      participants: [
        {
          id: "player-heroine-1",
          side: "player",
          displayName: "鹿目真昼",
          level: 1,
          hp: {
            current: 120,
            max: 120,
          },
          mp: {
            current: 48,
            max: 48,
          },
          isDown: false,
          statusEffects: [],
        },
        {
          id: "enemy-1",
          side: "enemy",
          displayName: "corridor-shadow",
          level: 1,
          hp: {
            current: 1,
            max: 1,
          },
          mp: {
            current: 0,
            max: 0,
          },
          isDown: false,
          statusEffects: [],
        },
      ],
      pressTurn: {
        totalIcons: 1,
        spentIcons: 0,
      },
      turnCount: 1,
      selectedTargetId: "enemy-1",
      currentActorId: "player-heroine-1",
      selectedActionId: "attack",
      actionMenu: [
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
      ],
    });
  });
});
