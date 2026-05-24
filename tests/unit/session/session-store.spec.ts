import { useBattleStore } from "@/stores/battleStore";
import { useSessionStore } from "@/stores/sessionStore";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it } from "vitest";

describe("sessionStore", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it("rejects pending combat cancellation outside COMBAT_PENDING without clearing active battle state", () => {
    const sessionStore = useSessionStore();
    const battleStore = useBattleStore();

    battleStore.activeBattle = {
      encounterId: "enc-active-preserved",
      lifecycleState: "ACTIVE",
      phase: "PLAYER_COMMAND",
      turnCount: 1,
      participants: [],
      pressTurn: {
        ownerSide: "player",
        icons: [],
      },
      currentActorId: null,
      actionMenu: [],
      currentMenuNodeId: null,
      selectedActionId: null,
      selectedTargetId: null,
      selectedSwapOutParticipantId: null,
      selectedSwapInParticipantId: null,
      battleLog: [],
    };

    expect(() => sessionStore.cancelPendingBattle()).toThrow(
      "[COMBAT_PENDING_CANCEL_INVALID_STATE] Cannot cancel pending battle from IDLE.",
    );
    expect(sessionStore.snapshot.sessionState).toBe("IDLE");
    expect(battleStore.activeBattle?.encounterId).toBe("enc-active-preserved");
  });
});
