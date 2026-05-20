import type { TriggerBattleToolEnvelope } from "@/orchestrator/toolEnvelope";
import MainGameView from "@/pages/MainGameView.vue";
import { router } from "@/router";
import { useBattleStore } from "@/stores/battleStore";
import { useSessionStore } from "@/stores/sessionStore";
import { render, screen } from "@testing-library/vue";
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
  it("does not render the battle overlay before a pending encounter is staged", async () => {
    await renderMainGameWithStores();

    expect(
      screen.queryByRole("dialog", { name: "战斗进行中遮罩" }),
    ).not.toBeInTheDocument();
  });

  it("renders the battle overlay when the session is COMBAT_PENDING and a battle encounter is staged", async () => {
    await renderMainGameWithStores();

    const sessionStore = useSessionStore();
    const battleStore = useBattleStore();

    sessionStore.enterCombatPending();
    battleStore.stagePendingEncounter({
      encounterId: "enc-overlay-001",
      narrativeReason: "教学楼楼梯间的影子突然鼓胀起来。",
    });

    expect(
      await screen.findByRole("dialog", { name: "战斗进行中遮罩" }),
    ).toBeInTheDocument();
    expect(screen.getByText("enc-overlay-001")).toBeInTheDocument();
    expect(
      screen.getByText("教学楼楼梯间的影子突然鼓胀起来。"),
    ).toBeInTheDocument();
  });

  it("stages the battle overlay automatically after executeTriggerBattle succeeds", async () => {
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
        encounter_id: "enc-overlay-auto-001",
        enemies: [{ enemy_id: "shadow-graffiti", count: 1 }],
        narrative_reason: "镜面里的涂鸦影魔忽然探出了半个身子。",
      },
    } satisfies TriggerBattleToolEnvelope);

    expect(result.ok).toBe(true);
    expect(sessionStore.snapshot.sessionState).toBe("COMBAT_PENDING");
    expect(battleStore.pendingEncounterId).toBe("enc-overlay-auto-001");
    expect(battleStore.lastNarrativeReason).toBe(
      "镜面里的涂鸦影魔忽然探出了半个身子。",
    );

    expect(
      await screen.findByRole("dialog", { name: "战斗进行中遮罩" }),
    ).toBeInTheDocument();
    expect(screen.getByText("enc-overlay-auto-001")).toBeInTheDocument();
  });
});
