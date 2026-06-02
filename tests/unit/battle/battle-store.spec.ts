import { createDefaultBattleCommandMenuTree } from "@/engine/battle/battleActionCatalog";
import { useBattleStore } from "@/stores/battleStore";
import { useSessionStore } from "@/stores/sessionStore";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it } from "vitest";

function startTestBattle() {
  const store = useBattleStore();

  store.stagePendingEncounter({
    encounterId: "enc-battle-store-tree-001",
    narrativeReason: "树形菜单 target-aware 分流测试。",
    enemies: [{ enemy_id: "menu-shadow", count: 2 }],
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

  return store;
}

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
        isActive: true,
      },
    ]);

    expect(store.pendingBattle).toBeNull();
    expect(store.activeBattle).toMatchObject({
      lifecycleState: "ACTIVE",
      phase: "PLAYER_COMMAND",
      encounterId: "enc-battle-store-003",
      participants: [
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
          id: "enemy-1",
          side: "enemy",
          displayName: "antenna-shadow",
          hp: {
            current: 5,
            max: 5,
          },
          isDown: false,
          isActive: true,
        },
        {
          id: "enemy-2",
          side: "enemy",
          displayName: "antenna-shadow",
          hp: {
            current: 5,
            max: 5,
          },
          isDown: false,
          isActive: true,
        },
      ],
      pressTurn: {
        ownerSide: "player",
        icons: [{ id: "pt-player-player-heroine-1-1", state: "solid" }],
      },
      pressTurnAllocation: {
        participantIds: ["player-heroine-1"],
        initialIconCount: 1,
      },
      turnCount: 1,
      selectedTargetId: "enemy-1",
      currentActorId: "player-heroine-1",
      currentMenuNodeId: null,
      selectedActionId: null,
      selectedSwapOutParticipantId: null,
      selectedSwapInParticipantId: null,
      actionMenu: createDefaultBattleCommandMenuTree(),
      battleResult: undefined,
      battleLog: [],
    });
  });

  it("throws a typed error when startBattle is called without a pending battle snapshot", () => {
    const store = useBattleStore();

    expect(() =>
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
          isActive: true,
        },
      ]),
    ).toThrowError(
      "[BATTLE_PENDING_REQUIRED] Cannot start battle without a pending battle snapshot.",
    );
  });

  it("opens a group menu node without selecting an executable action or consuming press turn icons", () => {
    const store = startTestBattle();
    const pressTurnBefore = store.activeBattle?.pressTurn;

    store.selectMenuNode("skill-group-physical");

    expect(store.activeBattle?.currentMenuNodeId).toBe("skill-group-physical");
    expect(store.activeBattle?.selectedActionId).toBeNull();
    expect(store.activeBattle?.pressTurn).toEqual(pressTurnBefore);
  });

  it("ignores invalid menu node ids without mutating battle command navigation state", () => {
    const store = startTestBattle();
    const snapshotBefore = JSON.parse(JSON.stringify(store.activeBattle));

    store.selectMenuNode("missing-node-id");

    expect(store.activeBattle).toEqual(snapshotBefore);
  });

  it("selects a selective leaf action and waits for target selection before resolution", () => {
    const store = startTestBattle();
    const pressTurnBefore = store.activeBattle?.pressTurn;

    store.selectMenuNode("attack-action");

    expect(store.activeBattle?.selectedActionId).toBe("attack");
    expect(store.activeBattle?.selectedTargetId).toBe("enemy-1");
    expect(store.activeBattle?.pressTurn).toEqual(pressTurnBefore);
    expect(
      store.activeBattle?.participants.find(
        (participant) => participant.id === "enemy-1",
      )?.hp.current,
    ).toBe(5);
  });

  it("automatically resolves a selective enemy-target leaf action after a valid enemy target is chosen", () => {
    const store = startTestBattle();

    store.selectMenuNode("attack-action");
    store.selectTarget("enemy-2");

    expect(store.activeBattle?.selectedActionId).toBe("attack");
    expect(store.activeBattle?.selectedTargetId).toBe("enemy-2");
    expect(store.activeBattle?.pressTurn.icons.length).toBeGreaterThan(0);
    expect(store.activeBattle?.pressTurn.icons[0]).toEqual({
      id: "pt-player-player-heroine-1-1",
      state: "solid",
    });
    expect(
      store.activeBattle?.participants.find(
        (participant) => participant.id === "enemy-2",
      ),
    ).toEqual(
      expect.objectContaining({
        hp: {
          current: 0,
          max: 5,
        },
        isDown: true,
      }),
    );
  });

  it("rejects player targets for an enemy-targeted selective leaf action without mutating selection or consuming icons", () => {
    const store = startTestBattle();
    store.selectMenuNode("attack-action");
    const snapshotBefore = JSON.parse(JSON.stringify(store.activeBattle));

    store.selectTarget("player-heroine-1");

    expect(store.activeBattle).toEqual(snapshotBefore);
  });

  it("immediately enters the execution chain after selecting a none-mode leaf action", () => {
    const store = startTestBattle();

    store.selectMenuNode("pass-action");

    expect(store.activeBattle?.selectedActionId).toBe("pass");
    expect(store.activeBattle?.pressTurn.icons).toHaveLength(2);
    expect(store.activeBattle?.pressTurn.icons).toEqual([
      { id: "pt-player-player-heroine-1-1", state: "solid" },
      { id: "pt-player-player-heroine-2-2", state: "blinking" },
    ]);
  });

  it("accepts player targets for a player-targeted selective item leaf action and resolves the item effect", () => {
    const store = startTestBattle();

    store.activeBattle!.actionMenu = [...createDefaultBattleCommandMenuTree(), {
      id: "item-group-heal",
      kind: "group" as const,
      label: "回复",
      description: "打开回复道具列表。",
      children: [{
        id: "item-action-1",
        kind: "action" as const,
        actionId: "basic-item" as const,
        contentId: "1",
        label: "药草 ×1",
        description: "常见的草药，可回复少量生命值。",
      }],
    }];
    store.selectMenuNode("item-action-1");
    store.selectTarget("player-heroine-2");

    expect(store.activeBattle?.selectedActionId).toBe("basic-item");
    expect(store.activeBattle?.selectedContentId).toBe("1");
    expect(store.activeBattle?.selectedTargetId).toBe("player-heroine-2");
    expect(store.activeBattle?.pressTurn.icons).toHaveLength(2);
    expect(
      store.activeBattle?.participants.find(
        (participant) => participant.id === "player-heroine-2",
      )?.hp.current,
    ).toBe(100);
  });

  it("accepts enemy targets for an item action since items now allow targeting enemies", () => {
    const store = startTestBattle();

    store.activeBattle!.actionMenu = [...createDefaultBattleCommandMenuTree(), {
      id: "item-group-heal",
      kind: "group" as const,
      label: "回复",
      description: "打开回复道具列表。",
      children: [{
        id: "item-action-1",
        kind: "action" as const,
        actionId: "basic-item" as const,
        contentId: "1",
        label: "药草 ×1",
        description: "常见的草药，可回复少量生命值。",
      }],
    }];
    store.selectMenuNode("item-action-1");
    store.selectTarget("enemy-1");

    expect(store.activeBattle?.selectedActionId).toBe("basic-item");
    expect(store.activeBattle?.selectedTargetId).toBe("enemy-1");
    expect(store.activeBattle?.selectedContentId).toBe("1");
  });

  it("swaps an active ally through the store entrypoint and consumes one icon", () => {
    const store = useBattleStore();

    store.activeBattle = {
      lifecycleState: "ACTIVE",
      phase: "PLAYER_COMMAND",
      encounterId: "enc-battle-store-swap-001",
      participants: [
        {
          id: "player-heroine-1",
          side: "player",
          displayName: "鹿目真昼",
          level: 1,
          hp: { current: 120, max: 120 },
          mp: { current: 48, max: 48 },
          isDown: false,
          isActive: true,
          statusEffects: [],
          affinities: {
            weak: 0,
            resist: 0,
            nullify: 0,
            reflect: 0,
            absorb: 0,
          },
          combatStats: {
            accuracy: 100,
            evasion: 100,
            critRate: 0,
          },
          canAct: true,
        },
        {
          id: "player-heroine-2",
          side: "player",
          displayName: "雾岛光",
          level: 1,
          hp: { current: 100, max: 100 },
          mp: { current: 36, max: 36 },
          isDown: false,
          isActive: true,
          statusEffects: [],
          affinities: {
            weak: 0,
            resist: 0,
            nullify: 0,
            reflect: 0,
            absorb: 0,
          },
          combatStats: {
            accuracy: 100,
            evasion: 100,
            critRate: 0,
          },
          canAct: true,
        },
        {
          id: "player-heroine-3",
          side: "player",
          displayName: "天城澪",
          level: 1,
          hp: { current: 90, max: 90 },
          mp: { current: 30, max: 30 },
          isDown: false,
          isActive: false,
          statusEffects: [],
          affinities: {
            weak: 0,
            resist: 0,
            nullify: 0,
            reflect: 0,
            absorb: 0,
          },
          combatStats: {
            accuracy: 100,
            evasion: 100,
            critRate: 0,
          },
          canAct: true,
        },
        {
          id: "enemy-1",
          side: "enemy",
          displayName: "menu-shadow",
          level: 1,
          attack: 1,
          hp: { current: 1, max: 1 },
          mp: { current: 0, max: 0 },
          isDown: false,
          isActive: true,
          statusEffects: [],
          affinities: {
            weak: 0,
            resist: 0,
            nullify: 0,
            reflect: 0,
            absorb: 0,
          },
          combatStats: {
            accuracy: 100,
            evasion: 100,
            critRate: 0,
          },
          canAct: true,
        },
      ],
      resultSummary: undefined,
      currentActorId: "player-heroine-1",
      selectedActionId: undefined,
      selectedTargetId: "enemy-1",
      selectedSwapOutParticipantId: null,
      selectedSwapInParticipantId: null,
      actionMenu: createDefaultBattleCommandMenuTree(),
      currentMenuNodeId: null,
      pressTurn: {
        ownerSide: "player",
        icons: [
          { id: "pt-player-player-heroine-1-1", state: "solid" },
          { id: "pt-player-player-heroine-2-2", state: "solid" },
        ],
      },
      pressTurnAllocation: {
        participantIds: ["player-heroine-1", "player-heroine-2"],
        initialIconCount: 2,
      },
      turnCount: 1,
    };

    store.selectSwapParticipants({
      swapOutParticipantId: "player-heroine-2",
      swapInParticipantId: "player-heroine-3",
    });

    expect(store.activeBattle?.selectedActionId).toBe("swap");
    expect(store.activeBattle?.selectedSwapOutParticipantId).toBe(
      "player-heroine-2",
    );
    expect(store.activeBattle?.selectedSwapInParticipantId).toBe(
      "player-heroine-3",
    );
    expect(store.activeBattle?.pressTurn.icons).toEqual([
      { id: "pt-player-player-heroine-1-1", state: "solid" },
    ]);
    expect(store.activeBattle?.currentActorId).toBe("player-heroine-2");
    expect(
      store.activeBattle?.participants.find(
        (participant) => participant.id === "player-heroine-2",
      )?.isActive,
    ).toBe(false);
    expect(
      store.activeBattle?.participants.find(
        (participant) => participant.id === "player-heroine-3",
      )?.isActive,
    ).toBe(true);
  });

  it("rotates currentActorId after pass through the fixed player queue", () => {
    const store = useBattleStore();

    store.activeBattle = {
      lifecycleState: "ACTIVE",
      phase: "PLAYER_COMMAND",
      encounterId: "enc-battle-store-pass-queue-001",
      participants: [
        {
          id: "player-heroine-1",
          side: "player",
          displayName: "鹿目真昼",
          level: 1,
          hp: { current: 120, max: 120 },
          mp: { current: 0, max: 0 },
          isDown: false,
          isActive: true,
          statusEffects: [],
          affinities: {
            weak: 0,
            resist: 0,
            nullify: 0,
            reflect: 0,
            absorb: 0,
          },
          combatStats: {
            accuracy: 100,
            evasion: 100,
            critRate: 0,
          },
          canAct: true,
        },
        {
          id: "player-heroine-2",
          side: "player",
          displayName: "雾岛光",
          level: 1,
          hp: { current: 100, max: 100 },
          mp: { current: 0, max: 0 },
          isDown: false,
          isActive: true,
          statusEffects: [],
          affinities: {
            weak: 0,
            resist: 0,
            nullify: 0,
            reflect: 0,
            absorb: 0,
          },
          combatStats: {
            accuracy: 100,
            evasion: 100,
            critRate: 0,
          },
          canAct: true,
        },
        {
          id: "player-heroine-3",
          side: "player",
          displayName: "天城澪",
          level: 1,
          hp: { current: 90, max: 90 },
          mp: { current: 0, max: 0 },
          isDown: false,
          isActive: true,
          statusEffects: [],
          affinities: {
            weak: 0,
            resist: 0,
            nullify: 0,
            reflect: 0,
            absorb: 0,
          },
          combatStats: {
            accuracy: 100,
            evasion: 100,
            critRate: 0,
          },
          canAct: true,
        },
        {
          id: "enemy-1",
          side: "enemy",
          displayName: "menu-shadow",
          level: 1,
          attack: 1,
          hp: { current: 1, max: 1 },
          mp: { current: 0, max: 0 },
          isDown: false,
          isActive: true,
          statusEffects: [],
          affinities: {
            weak: 0,
            resist: 0,
            nullify: 0,
            reflect: 0,
            absorb: 0,
          },
          combatStats: {
            accuracy: 100,
            evasion: 100,
            critRate: 0,
          },
          canAct: true,
        },
      ],
      resultSummary: undefined,
      currentActorId: "player-heroine-1",
      selectedActionId: undefined,
      selectedTargetId: "enemy-1",
      selectedSwapOutParticipantId: null,
      selectedSwapInParticipantId: null,
      actionMenu: createDefaultBattleCommandMenuTree(),
      currentMenuNodeId: null,
      pressTurn: {
        ownerSide: "player",
        icons: [
          { id: "pt-player-player-heroine-1-1", state: "solid" },
          { id: "pt-player-player-heroine-2-2", state: "solid" },
          { id: "pt-player-player-heroine-3-3", state: "solid" },
        ],
      },
      pressTurnAllocation: {
        participantIds: [
          "player-heroine-1",
          "player-heroine-2",
          "player-heroine-3",
        ],
        initialIconCount: 3,
      },
      turnCount: 1,
    };

    store.selectAction("pass");

    expect(store.activeBattle?.selectedActionId).toBe("pass");
    expect(store.activeBattle?.currentActorId).toBe("player-heroine-2");
    expect(store.activeBattle?.pressTurn.icons).toEqual([
      { id: "pt-player-player-heroine-1-1", state: "solid" },
      { id: "pt-player-player-heroine-2-2", state: "solid" },
      { id: "pt-player-player-heroine-3-3", state: "blinking" },
    ]);
  });

  it("ignores enemy turn resolution when no active battle exists", () => {
    const store = useBattleStore();

    store.resolveEnemyTurn();

    expect(store.activeBattle).toBeNull();
  });

  it("advances an active enemy turn into the next player command round", () => {
    const store = useBattleStore();

    store.activeBattle = {
      lifecycleState: "ACTIVE",
      phase: "ENEMY_TURN",
      encounterId: "enc-battle-store-enemy-turn-001",
      participants: [
        {
          id: "player-heroine-1",
          side: "player",
          displayName: "鹿目真昼",
          level: 1,
          hp: { current: 10, max: 10 },
          mp: { current: 0, max: 0 },
          isDown: false,
          isActive: true,
          statusEffects: [],
          affinities: {
            weak: 0,
            resist: 0,
            nullify: 0,
            reflect: 0,
            absorb: 0,
          },
          combatStats: {
            accuracy: 100,
            evasion: 100,
            critRate: 0,
          },
          canAct: true,
        },
        {
          id: "enemy-1",
          side: "enemy",
          displayName: "menu-shadow",
          level: 1,
          attack: 1,
          hp: { current: 1, max: 1 },
          mp: { current: 0, max: 0 },
          isDown: false,
          isActive: true,
          statusEffects: [],
          affinities: {
            weak: 0,
            resist: 0,
            nullify: 0,
            reflect: 0,
            absorb: 0,
          },
          combatStats: {
            accuracy: 100,
            evasion: 100,
            critRate: 0,
          },
          canAct: true,
        },
      ],
      resultSummary: undefined,
      currentActorId: null,
      selectedActionId: null,
      selectedTargetId: null,
      selectedSwapOutParticipantId: null,
      selectedSwapInParticipantId: null,
      actionMenu: createDefaultBattleCommandMenuTree(),
      currentMenuNodeId: null,
      pressTurn: {
        ownerSide: "enemy",
        icons: [{ id: "pt-enemy-enemy-1-1", state: "solid" }],
      },
      pressTurnAllocation: {
        participantIds: ["enemy-1"],
        initialIconCount: 1,
      },
      turnCount: 1,
    };

    store.resolveEnemyTurn();

    expect(store.activeBattle?.phase).toBe("PLAYER_COMMAND");
    expect(store.activeBattle?.turnCount).toBe(2);
    expect(store.activeBattle?.currentActorId).toBe("player-heroine-1");
    expect(store.activeBattle?.selectedActionId).toBeNull();
    expect(store.activeBattle?.selectedTargetId).toBe("enemy-1");
    expect(
      store.activeBattle?.participants.find(
        (participant) => participant.id === "player-heroine-1",
      )?.hp.current,
    ).toBeLessThan(10);
    expect(store.activeBattle?.battleLog).toEqual([
      {
        id: "turn-1-enemy-1-attack-player-heroine-1",
        turnCount: 1,
        side: "enemy",
        actorId: "enemy-1",
        actionId: "enemy_attack",
        targetId: "player-heroine-1",
        summary: expect.stringMatching(
          /menu-shadow attacked 鹿目真昼 for \d+ damage\./,
        ),
      },
      {
        id: "turn-2-player-round-start",
        turnCount: 2,
        side: "system",
        summary: "Player turn 2 started.",
      },
    ]);
  });

  it("can settle a complete deterministic battle without AI orchestration", () => {
    const store = useBattleStore();

    store.stagePendingEncounter({
      encounterId: "enc-battle-store-complete-loop-001",
      narrativeReason: "无 AI 战斗闭环测试。",
      enemies: [{ enemy_id: "loop-shadow", count: 1 }],
    });
    store.startBattle([
      {
        id: "player-heroine-1",
        side: "player",
        displayName: "鹿目真昼",
        hp: { current: 2, max: 2 },
        mp: { current: 0, max: 0 },
        isDown: false,
        isActive: true,
      },
    ]);

    if (store.activeBattle == null) {
      throw new Error("Expected active battle.");
    }

    store.activeBattle.participants = store.activeBattle.participants.map(
      (participant) =>
        participant.side === "enemy"
          ? {
              ...participant,
              hp: { current: 50, max: 50 },
            }
          : participant,
    );

    store.selectAction("attack");
    store.selectTarget("enemy-1");

    expect(store.activeBattle).toMatchObject({
      lifecycleState: "ACTIVE",
      phase: "ENEMY_TURN",
    });

    store.resolveEnemyTurn();

    expect(store.activeBattle).toMatchObject({
      lifecycleState: "RESOLVED",
      phase: "RESULT",
    });
    expect(store.activeBattle?.battleResult).toEqual({
      outcome: expect.stringMatching(/victory|defeat/),
      winningSide: expect.any(String),
      endReason: expect.stringMatching(
        /all_enemies_down|all_allies_down|all_players_down/,
      ),
      turnCount: expect.any(Number),
      survivingParticipantIds: expect.any(Array),
      downParticipantIds: expect.any(Array),
    });
    expect(
      store.activeBattle?.battleLog?.map((entry) => entry.summary),
    ).toEqual([
      expect.stringContaining("used"),
      expect.stringMatching(/loop-shadow attacked 鹿目真昼 for \d+ damage\./),
      expect.stringContaining("down"),
    ]);
  });
});
