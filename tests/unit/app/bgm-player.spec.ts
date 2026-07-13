import { useBattleStore } from "@/stores/battleStore";
import { useSessionStore } from "@/stores/sessionStore";
import type { BattleSnapshot } from "@/types/battle";
import BgmPlayer from "@/ui/game/BgmPlayer.vue";
import {
  findTrainingBattleTrack,
  resumeScene,
  switchToBattle,
} from "@/composables/useAudio";
import { render, waitFor } from "@testing-library/vue";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/composables/useAudio", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/composables/useAudio")>();
  return {
    ...actual,
    play: vi.fn(async () => {}),
    switchToBattle: vi.fn(),
    resumeScene: vi.fn(),
  };
});

function activeTrainingBattle(
  source: "training/free" | "training/challenge",
  encounterId: string,
): BattleSnapshot {
  return {
    lifecycleState: "ACTIVE",
    phase: "PLAYER_TURN",
    encounterId,
    source,
    participants: [],
    pressTurn: { ownerSide: "player", icons: [] },
  };
}

const challengeFixtures = [
  { id: "trial-1", order: 1, hidden: false },
  { id: "trial-2", order: 2, hidden: false },
  { id: "trial-3", order: 3, hidden: false },
  { id: "trial-4", order: 4, hidden: false },
  { id: "trial-5", order: 5, hidden: false },
  { id: "hidden", order: 6, hidden: true },
];

describe("BgmPlayer training combat music", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
  });

  it("maps free training and challenge stages to their dedicated tracks", () => {
    expect(findTrainingBattleTrack(
      "training/free",
      "training/free/1",
      challengeFixtures,
    )).toBe("009");
    expect(findTrainingBattleTrack(
      "training/challenge",
      "training/challenge/trial-1/1",
      challengeFixtures,
    )).toBe("008");
    expect(findTrainingBattleTrack(
      "training/challenge",
      "training/challenge/trial-3/1",
      challengeFixtures,
    )).toBe("011");
    expect(findTrainingBattleTrack(
      "training/challenge",
      "training/challenge/trial-5/1",
      challengeFixtures,
    )).toBe("003");
    expect(findTrainingBattleTrack(
      "training/challenge",
      "training/challenge/hidden/1",
      challengeFixtures,
    )).toBe("005");
  });

  it("plays free-training BGM and restores the scene track after leaving combat", async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const sessionStore = useSessionStore(pinia);
    const battleStore = useBattleStore(pinia);
    battleStore.activeBattle = activeTrainingBattle(
      "training/free",
      "training/free/bgm-test",
    );
    sessionStore.snapshot = {
      ...sessionStore.snapshot,
      sessionState: "IN_COMBAT",
    };

    render(BgmPlayer, { global: { plugins: [pinia] } });

    await waitFor(() => expect(switchToBattle).toHaveBeenCalledWith("009"));

    sessionStore.snapshot = {
      ...sessionStore.snapshot,
      sessionState: "IDLE",
    };
    await waitFor(() => expect(resumeScene).toHaveBeenCalledWith(undefined, true));
  });
});
