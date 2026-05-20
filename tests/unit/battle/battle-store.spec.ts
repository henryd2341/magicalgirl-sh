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
          id: "enemy-1",
          side: "enemy",
          displayName: "antenna-shadow",
          hp: {
            current: 1,
            max: 1,
          },
          mp: {
            current: 0,
            max: 0,
          },
          isDown: false,
        },
        {
          id: "enemy-2",
          side: "enemy",
          displayName: "antenna-shadow",
          hp: {
            current: 1,
            max: 1,
          },
          mp: {
            current: 0,
            max: 0,
          },
          isDown: false,
        },
      ],
      pressTurn: {
        totalIcons: 1,
        spentIcons: 0,
      },
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
          id: "enemy-1",
          side: "enemy",
          displayName: "corridor-shadow",
          hp: {
            current: 1,
            max: 1,
          },
          mp: {
            current: 0,
            max: 0,
          },
          isDown: false,
        },
      ],
      pressTurn: {
        totalIcons: 1,
        spentIcons: 0,
      },
    });
  });
});
