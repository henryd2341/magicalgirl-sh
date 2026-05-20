import { useBattleStore } from "@/stores/battleStore";
import { useSessionStore } from "@/stores/sessionStore";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it } from "vitest";

describe("battleStore", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it("starts idle and can stage a pending encounter for the overlay entrypoint", () => {
    const store = useBattleStore();

    expect(store.pendingEncounterId).toBeNull();
    expect(store.lastNarrativeReason).toBeNull();

    store.stagePendingEncounter({
      encounterId: "enc-battle-store-001",
      narrativeReason: "影魔从教学楼背面的玻璃反光里浮出来。",
    });

    expect(store.pendingEncounterId).toBe("enc-battle-store-001");
    expect(store.lastNarrativeReason).toBe(
      "影魔从教学楼背面的玻璃反光里浮出来。",
    );
  });

  it("can clear the staged encounter after the overlay entrypoint is dismissed or resolved", () => {
    const store = useBattleStore();

    store.stagePendingEncounter({
      encounterId: "enc-battle-store-002",
      narrativeReason: "测试清理。",
    });
    store.clearPendingEncounter();

    expect(store.pendingEncounterId).toBeNull();
    expect(store.lastNarrativeReason).toBeNull();
  });

  it("syncs encounter information into the battle store after sessionStore.executeTriggerBattle succeeds", async () => {
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
        enemies: [{ enemy_id: "shadow-graffiti", count: 1 }],
        narrative_reason: "战斗 store 应自动同步 encounter 信息。",
      },
    });

    expect(result.ok).toBe(true);
    expect(sessionStore.snapshot.sessionState).toBe("COMBAT_PENDING");
    expect(battleStore.pendingEncounterId).toBe("enc-battle-store-sync-001");
    expect(battleStore.lastNarrativeReason).toBe(
      "战斗 store 应自动同步 encounter 信息。",
    );
  });
});
