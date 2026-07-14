import type {
  TrainingCatalog,
  TrainingPuzzleDefinition,
} from "@/types/training";

export const TRAINING_CATALOG: TrainingCatalog = {
  enabled: true,
  challenges: [
    {
      id: "challenge-1",
      order: 1,
      name: "熔核幻蛇",
      enabled: true,
      hidden: false,
      prerequisiteId: null,
      enemies: [{ enemy_id: "100", count: 1 }],
      firstClearReward: { money: 0, items: {} },
    },
    {
      id: "challenge-2",
      order: 2,
      name: "永冻巨兽",
      enabled: true,
      hidden: false,
      prerequisiteId: "challenge-1",
      enemies: [
        { enemy_id: "101", count: 1 },
        { enemy_id: "102", count: 1 },
        { enemy_id: "103", count: 1 },
      ],
      firstClearReward: { money: 0, items: {} },
    },
    {
      id: "challenge-3",
      order: 3,
      name: "腐冠圣女",
      enabled: true,
      hidden: false,
      prerequisiteId: "challenge-2",
      enemies: [{ enemy_id: "104", count: 1 }],
      firstClearReward: { money: 0, items: {} },
    },
    {
      id: "challenge-4",
      order: 4,
      name: "回声猎手",
      enabled: true,
      hidden: false,
      prerequisiteId: "challenge-3",
      enemies: [{ enemy_id: "105", count: 1 }],
      firstClearReward: { money: 0, items: {} },
    },
    {
      id: "challenge-5",
      order: 5,
      name: "混乱玩偶拼凑体",
      enabled: true,
      hidden: false,
      prerequisiteId: "challenge-4",
      enemies: [{ enemy_id: "106", count: 1 }],
      firstClearReward: { money: 0, items: {} },
    },
    {
      id: "challenge-hidden",
      order: 6,
      name: "阳炎与大地的魔法少女",
      enabled: true,
      hidden: true,
      prerequisiteId: null,
      enemies: [
        { enemy_id: "107", count: 1 },
        { enemy_id: "108", count: 1 },
      ],
      firstClearReward: { money: 0, items: {} },
    },
  ],
};

export const TRAINING_PUZZLE: TrainingPuzzleDefinition = {
  enabled: false,
  clueText: "谜题尚未开放",
  imageUrl: null,
  answerDigest: null,
  normalizationVersion: 1,
};
