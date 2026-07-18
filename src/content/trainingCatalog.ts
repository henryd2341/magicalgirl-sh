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
      firstClearReward: {
        money: 2500,
        items: { "2": 2, "7": 2, "28": 2, "29": 2, "66": 1, "69": 1 },
      },
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
      firstClearReward: {
        money: 6000,
        items: { "3": 2, "8": 2, "11": 2, "27": 3, "67": 1, "68": 1 },
      },
    },
    {
      id: "challenge-3",
      order: 3,
      name: "腐冠圣女",
      enabled: true,
      hidden: false,
      prerequisiteId: "challenge-2",
      enemies: [{ enemy_id: "104", count: 1 }],
      firstClearReward: {
        money: 12000,
        items: { "17": 3, "26": 2, "52": 1, "53": 1, "66": 1, "67": 1, "68": 1, "69": 1 },
      },
    },
    {
      id: "challenge-4",
      order: 4,
      name: "回声猎手",
      enabled: true,
      hidden: false,
      prerequisiteId: "challenge-3",
      enemies: [{ enemy_id: "105", count: 1 }],
      firstClearReward: {
        money: 25000,
        items: { "4": 2, "9": 2, "22": 2, "54": 1, "66": 2, "67": 2, "68": 2, "69": 2 },
      },
    },
    {
      id: "challenge-5",
      order: 5,
      name: "混乱玩偶拼凑体",
      enabled: true,
      hidden: false,
      prerequisiteId: "challenge-4",
      enemies: [{ enemy_id: "106", count: 1 }],
      firstClearReward: {
        money: 50000,
        items: { "5": 2, "10": 2, "13": 2, "55": 1, "66": 3, "67": 3, "68": 3, "69": 3 },
      },
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
      firstClearReward: {
        money: 100000,
        items: { "5": 3, "10": 3, "13": 3, "65": 1, "66": 5, "67": 5, "68": 5, "69": 5 },
      },
    },
  ],
};

export const TRAINING_PUZZLE: TrainingPuzzleDefinition = {
  enabled: true,
  clueText: "元素中似乎隐藏着什么",
  imageUrl: "/puzzle.png",
  answerDigest: "60956c648459ec2cfae4cbda4bf29c0fe13c288d5cf1d71739c8ddb0c5bc0c4b",
  normalizationVersion: 1,
};
