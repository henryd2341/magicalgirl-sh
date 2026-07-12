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
