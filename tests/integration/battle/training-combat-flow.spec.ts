import { useBattleStore } from "@/stores/battleStore";
import { useSessionStore } from "@/stores/sessionStore";
import type { BattleParticipant } from "@/types/battle";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it } from "vitest";

function party(): BattleParticipant[] {
  return [{
    id: "training-player",
    side: "player",
    displayName: "训练者",
    hp: { current: 120, max: 120 },
    mp: { current: 48, max: 48 },
    isDown: false,
    isActive: true,
  }];
}

async function enterTraining() {
  const session = useSessionStore();
  const battle = useBattleStore();
  const formalParty = party();
  battle.stagePendingEncounter({
    encounterId: "training/free/integration",
    narrativeReason: "自由练习",
    enemies: [],
    source: "training/free",
  });
  session.enterCombatPending();
  await session.startBattle(formalParty);
  return { session, battle, formalParty };
}

describe("training combat flow", () => {
  beforeEach(() => setActivePinia(createPinia()));

  it("discards temporary resources and returns directly to idle after a result", async () => {
    const { session, battle, formalParty } = await enterTraining();
    expect(session.snapshot.sessionState).toBe("IN_COMBAT");

    battle.setBattleItems({ potion: 2 });
    await battle.onItemConsumed?.("potion");
    const participant = battle.activeBattle!.participants[0];
    participant.hp.current = 1;
    participant.mp.current = 0;
    Object.assign(battle.activeBattle!, {
      lifecycleState: "RESOLVED",
      phase: "RESULT",
      battleResult: {
        outcome: "defeat",
        endReason: "all_players_down",
        turnCount: 2,
      },
    });

    await session.completeTrainingBattle();

    expect(session.snapshot.sessionState).toBe("IDLE");
    expect(battle.activeBattle).toBeNull();
    expect(formalParty[0].hp).toEqual({ current: 120, max: 120 });
    expect(formalParty[0].mp).toEqual({ current: 48, max: 48 });
  });

  it("discards an unresolved temporary battle on explicit exit", async () => {
    const { session, battle } = await enterTraining();
    await session.abortTrainingBattle();
    expect(session.snapshot.sessionState).toBe("IDLE");
    expect(battle.activeBattle).toBeNull();
  });
});
