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
    const battleStore = useBattleStore();

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
    expect(battleStore.pendingBattle).toEqual({
      lifecycleState: "PENDING",
      encounterId: "enc-overlay-auto-001",
      narrativeReason: "镜面里的涂鸦影魔忽然探出了半个身子。",
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

    expect(
      await screen.findByRole("dialog", { name: "战斗进行中遮罩" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Battle Pending")).toBeInTheDocument();
    expect(screen.getByText("enc-overlay-auto-001")).toBeInTheDocument();
    expect(screen.getByText("shadow-graffiti")).toBeInTheDocument();
    expect(screen.getByText("×2")).toBeInTheDocument();
  });

  it("renders the active battle overlay when the session enters IN_COMBAT and activeBattle exists", async () => {
    await renderMainGameWithStores();

    const sessionStore = useSessionStore();

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
    expect(
      await screen.findByRole("dialog", { name: "战斗进行中遮罩" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Battle Active")).toBeInTheDocument();
    expect(screen.getByText("PLAYER_COMMAND")).toBeInTheDocument();
    expect(screen.getByText("鹿目真昼")).toBeInTheDocument();
    expect(screen.getByText("corridor-shadow")).toBeInTheDocument();
  });
});
