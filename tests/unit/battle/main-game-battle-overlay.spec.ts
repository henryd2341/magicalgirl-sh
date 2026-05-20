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
});
