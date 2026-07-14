import { getAllEnemies } from "@/content/contentRegistry";
import type { PendingBattleSnapshot } from "@/types/battle";
import {
  BATTLE_SOURCES,
  type TrainingChallengeDefinition,
} from "@/types/training";

const CHALLENGE_FIXTURE = [
  { id: "stage-1", order: 1, hidden: false },
  { id: "stage-2", order: 2, hidden: false },
  { id: "stage-3", order: 3, hidden: false },
  { id: "stage-4", order: 4, hidden: false },
  { id: "stage-5", order: 5, hidden: false },
  { id: "hidden-stage", order: 6, hidden: true },
].map(
  ({ id, order, hidden }): TrainingChallengeDefinition => ({
    id,
    order,
    name: id,
    enabled: true,
    hidden,
    prerequisiteId: order === 1 ? null : `stage-${order - 1}`,
    enemies: [{ enemy_id: "57", count: 1 }],
    firstClearReward: { money: 100, items: {} },
  }),
);

describe("training domain contracts", () => {
  it("defines the exact supported battle sources", () => {
    expect(BATTLE_SOURCES).toEqual([
      "story",
      "training/free",
      "training/challenge",
    ]);
  });

  it("exposes all enemies through a read-only map", () => {
    const enemies: ReadonlyMap<string, ReturnType<typeof getAllEnemies> extends ReadonlyMap<string, infer T> ? T : never> =
      getAllEnemies();

    expect(enemies.get("57")?.name).toBe("影兽");
  });

  it.each(["story", "training/free", "training/challenge"] as const)(
    "requires pending battle source %s",
    (source) => {
      const pending: PendingBattleSnapshot = {
        lifecycleState: "PENDING",
        encounterId: "contract-test",
        narrativeReason: "contract test",
        enemies: [],
        source,
      };

      expect(pending.source).toBe(source);
    },
  );

  it("expresses five normal challenge stages plus one hidden stage", () => {
    expect(CHALLENGE_FIXTURE.filter((entry) => !entry.hidden)).toHaveLength(5);
    expect(CHALLENGE_FIXTURE.filter((entry) => entry.hidden)).toHaveLength(1);
  });
});

import { isChallengeEnemyId } from "@/content/contentRegistry";
import { canRevealHiddenClue, digestTrainingAnswer, isChallengeUnlocked, listFreeTrainingEnemies, normalizeTrainingAnswer, validateFreeTrainingSelection, validateTrainingCatalog } from "@/engine/training/trainingRules";
import { enabledTrainingCatalogFixture, enabledTrainingPuzzleFixture, trainingProgressFixture } from "../../helpers/trainingFixtures";

describe("training rules", () => {
  it("recognizes the reserved challenge enemy range", () => {
    expect(isChallengeEnemyId("100")).toBe(true);
    expect(isChallengeEnemyId("099")).toBe(false);
  });

  it("filters by level and excludes challenge enemies including disabled hidden entries", () => {
    const catalog = structuredClone(enabledTrainingCatalogFixture);
    catalog.challenges.push({ ...catalog.challenges[0]!, id: "reserved", order: 99, enabled: false, hidden: true, enemies: [{ enemy_id: "7", count: 1 }] });
    const enemies = listFreeTrainingEnemies(30, catalog);
    expect(enemies.every((enemy) => enemy.baseLevel <= 30)).toBe(true);
    expect(enemies.map((enemy) => enemy.id)).not.toContain("7");
    expect(enemies.map((enemy) => enemy.id)).not.toContain("1");
  });

  it.each([[[], "at least one"], [["7", "7", "7", "7", "7"], "at most four"], [["missing"], "unknown enemy"], [["5"], "above protagonist level"], [["1"], "reserved for a challenge"]])("rejects invalid free selection %#", (selection, message) => {
    const result = validateFreeTrainingSelection(selection as string[], 20, enabledTrainingCatalogFixture);
    expect(result.ok).toBe(false);
    expect(result.errors[0]).toContain(message);
  });

  it("accepts one to four eligible IDs including duplicates", () => {
    expect(validateFreeTrainingSelection(["7", "7", "8", "7"], 62, enabledTrainingCatalogFixture)).toEqual({ ok: true, errors: [] });
  });

  it("accepts a complete enabled catalog and a disabled empty content gate", () => {
    expect(validateTrainingCatalog(enabledTrainingCatalogFixture, enabledTrainingPuzzleFixture)).toEqual({ ok: true, errors: [] });
    expect(validateTrainingCatalog({ enabled: false, challenges: [] }, { enabled: false, clueText: "谜题尚未开放", imageUrl: null, answerDigest: null, normalizationVersion: 1 })).toEqual({ ok: true, errors: [] });
  });

  it.each([
    [(c: typeof enabledTrainingCatalogFixture) => c.challenges.pop()],
    [(c: typeof enabledTrainingCatalogFixture) => { c.challenges[1]!.id = c.challenges[0]!.id; }],
    [(c: typeof enabledTrainingCatalogFixture) => { c.challenges[1]!.order = 1; }],
    [(c: typeof enabledTrainingCatalogFixture) => { c.challenges[2]!.prerequisiteId = "trial-1"; }],
    [(c: typeof enabledTrainingCatalogFixture) => { c.challenges[0]!.enemies[0]!.count = 0; }],
    [(c: typeof enabledTrainingCatalogFixture) => { c.challenges[0]!.firstClearReward.money = -1; }],
    [(c: typeof enabledTrainingCatalogFixture) => { c.challenges[0]!.firstClearReward.items["1"] = -1; }],
    [(c: typeof enabledTrainingCatalogFixture) => { c.challenges[0]!.enemies[0]!.enemy_id = "missing-enemy"; }],
    [(c: typeof enabledTrainingCatalogFixture) => { c.challenges[0]!.firstClearReward.items["missing-item"] = 1; }],
  ])("rejects malformed enabled catalog %#", (mutate) => {
    const catalog = structuredClone(enabledTrainingCatalogFixture);
    mutate(catalog);
    expect(validateTrainingCatalog(catalog, enabledTrainingPuzzleFixture).ok).toBe(false);
  });

  it("unlocks normals by prerequisites and hidden only after discovery", () => {
    const [first, second, , , , hidden] = enabledTrainingCatalogFixture.challenges;
    expect(isChallengeUnlocked(first!, trainingProgressFixture())).toBe(true);
    expect(isChallengeUnlocked(second!, trainingProgressFixture())).toBe(false);
    expect(isChallengeUnlocked(second!, trainingProgressFixture({ clearedChallengeIds: ["trial-1"] }))).toBe(true);
    expect(isChallengeUnlocked(hidden!, trainingProgressFixture())).toBe(false);
    expect(isChallengeUnlocked(hidden!, trainingProgressFixture({ hiddenChallengeDiscovered: true }))).toBe(true);
  });

  it("reveals hidden clue only after all five normals and before discovery", () => {
    const clearedChallengeIds = [1, 2, 3, 4, 5].map((n) => `trial-${n}`);
    expect(canRevealHiddenClue(enabledTrainingCatalogFixture, trainingProgressFixture({ clearedChallengeIds }))).toBe(true);
    expect(canRevealHiddenClue(enabledTrainingCatalogFixture, trainingProgressFixture({ clearedChallengeIds: clearedChallengeIds.slice(0, 4) }))).toBe(false);
    expect(canRevealHiddenClue(enabledTrainingCatalogFixture, trainingProgressFixture({ clearedChallengeIds, hiddenChallengeDiscovered: true }))).toBe(false);
  });

  it("normalizes and hashes answers deterministically with SHA-256", async () => {
    expect(normalizeTrainingAnswer("  MaGiCa  ", 1)).toBe("magica");
    const digest = await digestTrainingAnswer("  MaGiCa  ", 1);
    expect(digest).toBe(await digestTrainingAnswer("magica", 1));
    expect(digest).toBe("2f77b8b18c28646e24676513dbbcc62ae4fd26d07e2bd769dca61e85d1d40cb7");
  });

  it("rejects incomplete enabled puzzle and permits null disabled fields", () => {
    for (const puzzle of [{ ...enabledTrainingPuzzleFixture, clueText: "" }, { ...enabledTrainingPuzzleFixture, imageUrl: null }, { ...enabledTrainingPuzzleFixture, answerDigest: null }]) expect(validateTrainingCatalog(enabledTrainingCatalogFixture, puzzle).ok).toBe(false);
    expect(validateTrainingCatalog({ enabled: false, challenges: [] }, { enabled: false, clueText: "", imageUrl: null, answerDigest: null, normalizationVersion: 1 }).ok).toBe(true);
  });
});

