import type { TrainingCatalog, TrainingPuzzleDefinition, TrainingProgress } from "@/types/training";

export const enabledTrainingCatalogFixture: TrainingCatalog = {
  enabled: true,
  challenges: [
    ...[1, 2, 3, 4, 5].map((order) => ({
      id: `trial-${order}`, order, name: `试炼 ${order}`, enabled: true, hidden: false,
      prerequisiteId: order === 1 ? null : `trial-${order - 1}`,
      enemies: [{ enemy_id: String(order), count: 1 }],
      firstClearReward: { money: order * 100, items: { "1": 1 } },
    })),
    { id: "trial-hidden", order: 6, name: "隐藏试炼", enabled: true, hidden: true,
      prerequisiteId: null, enemies: [{ enemy_id: "6", count: 1 }],
      firstClearReward: { money: 1000, items: { "2": 1 } } },
  ],
};

export const enabledTrainingPuzzleFixture: TrainingPuzzleDefinition = {
  enabled: true, clueText: "说出魔法的名字", imageUrl: "/training/puzzle.webp",
  answerDigest: "0".repeat(64), normalizationVersion: 1,
};

export function trainingProgressFixture(overrides: Partial<TrainingProgress> = {}): TrainingProgress {
  return { clearedChallengeIds: [], claimedRewardIds: [], hiddenChallengeDiscovered: false, ...overrides };
}
