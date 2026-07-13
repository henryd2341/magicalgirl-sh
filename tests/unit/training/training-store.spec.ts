import { useTrainingStore } from "@/stores/trainingStore";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";

const fixtures = vi.hoisted(() => {
  const enemy = (id: string, name: string, baseLevel: number) => ({
    id,
    name,
    baseLevel,
    stats: { hp: 10, mp: 0, attack: 1, defense: 1, agility: 1, intelligence: 1 },
    affinities: { weak: 0, resist: 0, nullify: 0, reflect: 0, absorb: 0 },
    skills: [],
    expReward: 0,
    moneyReward: 0,
  });
  const challenges = Array.from({ length: 5 }, (_, index) => ({
    id: `trial-${index + 1}`,
    order: index + 1,
    name: `试炼 ${index + 1}`,
    enabled: true,
    hidden: false,
    prerequisiteId: index === 0 ? null : `trial-${index}`,
    enemies: [{ enemy_id: `boss-${index + 1}`, count: 1 }],
    firstClearReward: { money: 100, items: {} },
  }));
  challenges.push({
    id: "hidden",
    order: 6,
    name: "隐藏试炼",
    enabled: true,
    hidden: true,
    prerequisiteId: null,
    enemies: [{ enemy_id: "hidden-boss", count: 1 }],
    firstClearReward: { money: 500, items: {} },
  });
  return {
    catalog: { enabled: true, challenges },
    enemies: new Map([
      ["slime", enemy("slime", "史莱姆", 2)],
      ["wolf", enemy("wolf", "月狼", 8)],
      ...Array.from({ length: 5 }, (_, index) => [
        `boss-${index + 1}`,
        enemy(`boss-${index + 1}`, `Boss ${index + 1}`, 10),
      ] as const),
      ["hidden-boss", enemy("hidden-boss", "Hidden", 10)],
    ]),
    startTrainingBattle: vi.fn(async (input) => ({ ...input, encounterId: "enc" })),
    submitTrainingPuzzleAnswer: vi.fn(async () => ({ discovered: true, alreadyDiscovered: false })),
    getVariableSnapshot: vi.fn(),
  };
});

vi.mock("@/content/trainingCatalog", () => ({
  TRAINING_CATALOG: fixtures.catalog,
  TRAINING_PUZZLE: {
    enabled: true,
    clueText: "clue",
    imageUrl: "/puzzle.png",
    answerDigest: "0".repeat(64),
    normalizationVersion: 1,
  },
}));

vi.mock("@/content/contentRegistry", () => ({
  getAllEnemies: () => fixtures.enemies,
}));

vi.mock("@/stores/sessionStore", () => ({
  useSessionStore: () => ({
    getVariableSnapshot: fixtures.getVariableSnapshot,
    startTrainingBattle: fixtures.startTrainingBattle,
    submitTrainingPuzzleAnswer: fixtures.submitTrainingPuzzleAnswer,
  }),
}));

function variables(clearedChallengeIds: string[] = []) {
  return {
    root: {
      player: { combat: { level: 10 } },
      training: {
        clearedChallengeIds,
        claimedRewardIds: [],
        hiddenChallengeDiscovered: false,
      },
    },
  };
}

describe("trainingStore", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    fixtures.catalog.enabled = true;
    fixtures.getVariableSnapshot.mockResolvedValue(variables());
  });

  it("opens, switches tabs, closes, and preserves configuration", async () => {
    const store = useTrainingStore();
    await store.open();
    store.addEnemy("slime");
    store.setTab("challenge");
    store.close();

    expect(store.isOpen).toBe(false);
    expect(store.activeTab).toBe("challenge");
    expect(store.selectedEnemyIds).toEqual(["slime"]);
  });

  it("filters enemies and supports duplicates up to four slots", async () => {
    const store = useTrainingStore();
    await store.open();
    store.searchQuery = "月狼";
    expect(store.eligibleEnemies.map((enemy) => enemy.id)).toEqual(["wolf"]);

    expect(store.addEnemy("wolf")).toBe(true);
    expect(store.addEnemy("wolf")).toBe(true);
    expect(store.addEnemy("slime")).toBe(true);
    expect(store.addEnemy("slime")).toBe(true);
    expect(store.addEnemy("slime")).toBe(false);
    expect(store.errorMessage).toContain("4");
    store.removeEnemyAt(1);
    expect(store.selectedEnemyIds).toHaveLength(3);
  });

  it("enforces the fixed challenge unlock order", async () => {
    fixtures.getVariableSnapshot.mockResolvedValue(variables(["trial-1"]));
    const store = useTrainingStore();
    await store.open();
    store.setTab("challenge");

    expect(store.selectChallenge("trial-2")).toBe(true);
    expect(store.canStart).toBe(true);
    expect(store.selectChallenge("trial-3")).toBe(false);
  });

  it("confirms and delegates free training without clearing selection", async () => {
    const store = useTrainingStore();
    await store.open();
    store.addEnemy("slime");
    expect(store.requestBattleConfirmation()).toBe(true);
    await store.confirmBattle();

    expect(fixtures.startTrainingBattle).toHaveBeenCalledWith({
      mode: "free",
      enemyIds: ["slime"],
    });
    expect(store.isOpen).toBe(false);
    expect(store.selectedEnemyIds).toEqual(["slime"]);
  });

  it("reports disabled production content", async () => {
    fixtures.catalog.enabled = false;
    const store = useTrainingStore();
    await store.open();

    expect(store.canStart).toBe(false);
    expect(store.requestBattleConfirmation()).toBe(false);
    expect(store.errorMessage).toBe("训练场内容尚未开放");
  });
});
