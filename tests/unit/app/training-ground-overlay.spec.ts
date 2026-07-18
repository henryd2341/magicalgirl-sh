import { render, screen, fireEvent } from "@testing-library/vue";
import { useTrainingStore } from "@/stores/trainingStore";
import TrainingGroundOverlay from "@/ui/training/TrainingGroundOverlay.vue";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => {
  const enemy = (id: string, name: string) => ({
    id, name, baseLevel: 2,
    stats: { hp: 10, mp: 0, attack: 1, defense: 1, agility: 1, intelligence: 1 },
    affinities: { weak: 0, resist: 0, nullify: 0, reflect: 0, absorb: 0 },
    skills: [], expReward: 0, moneyReward: 0,
  });
  const challenges = Array.from({ length: 5 }, (_, index) => ({
    id: `trial-${index + 1}`,
    order: index + 1,
    name: `试炼 ${index + 1}`,
    enabled: true,
    hidden: false,
    prerequisiteId: index === 0 ? null : `trial-${index}`,
    enemies: [{ enemy_id: `boss-${index + 1}`, count: 1 }],
    firstClearReward: { money: 0, items: {} },
  }));
  challenges.push({
    id: "hidden", order: 6, name: "隐藏 Boss", enabled: true, hidden: true,
    prerequisiteId: null, enemies: [{ enemy_id: "hidden-boss", count: 1 }],
    firstClearReward: { money: 0, items: {} },
  });
  return {
    catalog: { enabled: true, challenges },
    enemies: new Map([
      ["slime", enemy("slime", "史莱姆")],
      ...Array.from({ length: 5 }, (_, index) => [`boss-${index + 1}`, enemy(`boss-${index + 1}`, `Boss ${index + 1}`)] as const),
      ["hidden-boss", enemy("hidden-boss", "Hidden")],
    ]),
    getVariableSnapshot: vi.fn(),
    submit: vi.fn(async () => ({ discovered: true, alreadyDiscovered: false })),
  };
});

vi.mock("@/content/trainingCatalog", () => ({
  TRAINING_CATALOG: fixture.catalog,
  TRAINING_PUZZLE: {
    enabled: true,
    clueText: "寻找隐藏图片",
    imageUrl: "/puzzle.png",
    answerDigest: "0".repeat(64),
    normalizationVersion: 1,
  },
}));
vi.mock("@/content/contentRegistry", () => ({
  getAllEnemies: () => fixture.enemies,
  isChallengeEnemyId: () => false,
}));
vi.mock("@/stores/sessionStore", () => ({
  useSessionStore: () => ({
    getVariableSnapshot: fixture.getVariableSnapshot,
    startTrainingBattle: vi.fn(),
    submitTrainingPuzzleAnswer: fixture.submit,
  }),
}));

function variables(cleared: string[] = []) {
  return { root: { player: { combat: { level: 10 } }, training: {
    clearedChallengeIds: cleared,
    claimedRewardIds: [],
    hiddenChallengeDiscovered: false,
  } } };
}

describe("TrainingGroundOverlay", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    fixture.catalog.enabled = true;
    fixture.getVariableSnapshot.mockResolvedValue(variables());
  });

  it("renders an accessible dialog with tabs and initial focus", async () => {
    render(TrainingGroundOverlay);
    expect(screen.getByRole("dialog", { name: "训练场" })).toBeTruthy();
    expect(screen.getAllByRole("tab")).toHaveLength(2);
    await vi.waitFor(() => expect(screen.getByRole("button", { name: "关闭训练场" })).toHaveFocus());
  });

  it("searches, adds duplicate enemies, and removes a selected slot", async () => {
    await useTrainingStore().open();
    render(TrainingGroundOverlay);
    await fireEvent.update(screen.getByLabelText("搜索敌人"), "史莱姆");
    const add = screen.getByRole("button", { name: "添加 史莱姆" });
    await fireEvent.click(add);
    await fireEvent.click(add);
    expect(screen.getByText("2/4")).toBeTruthy();
    await fireEvent.click(screen.getByRole("button", { name: "移除第 1 个 史莱姆" }));
    expect(screen.getByText("1/4")).toBeTruthy();
  });

  it("closes on Escape", async () => {
    const view = render(TrainingGroundOverlay);
    await fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(view.emitted().close).toHaveLength(1);
  });

  it("keeps locked challenges disabled", async () => {
    render(TrainingGroundOverlay);
    await fireEvent.click(screen.getByRole("tab", { name: "挑战模式" }));
    expect(screen.getByRole("button", { name: /试炼 2/ })).toBeDisabled();
  });

  it("reveals an inspectable puzzle resource only after five clears", async () => {
    fixture.getVariableSnapshot.mockResolvedValue(
      variables(["trial-1", "trial-2", "trial-3", "trial-4", "trial-5"]),
    );
    const store = useTrainingStore();
    await store.open();
    render(TrainingGroundOverlay);
    await fireEvent.click(screen.getByRole("tab", { name: "挑战模式" }));
    await fireEvent.click(screen.getByRole("button", { name: "查看线索" }));

    const input = screen.getByLabelText("谜题答案");
    const form = input.closest("form")!;
    expect(form.getAttribute("data-puzzle-resource")).toBe("/puzzle.png");
    expect(screen.getByText(/Elements/).textContent).not.toContain("/hiddenchallenge");
    await fireEvent.update(input, "  MaGiC  ");
    await fireEvent.submit(form);
    expect(fixture.submit).toHaveBeenCalledWith("  MaGiC  ");
  });

  it("shows disabled content feedback", () => {
    fixture.catalog.enabled = false;
    render(TrainingGroundOverlay);
    expect(screen.getByRole("status").textContent).toContain("尚未开放");
    expect(screen.getByRole("button", { name: "开战确认" })).toBeDisabled();
  });
});
