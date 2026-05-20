import { useBattleStore } from "@/stores/battleStore";
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
});
