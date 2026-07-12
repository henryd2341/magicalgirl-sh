export const BATTLE_SOURCES = ["story", "training/free", "training/challenge"] as const;

export type BattleSource = (typeof BATTLE_SOURCES)[number];

export interface TrainingReward {
  money: number;
  items: Record<string, number>;
}

export interface TrainingChallengeDefinition {
  id: string;
  order: number;
  name: string;
  enabled: boolean;
  hidden: boolean;
  prerequisiteId: string | null;
  enemies: Array<{ enemy_id: string; count: number }>;
  firstClearReward: TrainingReward;
}

export interface TrainingCatalog {
  enabled: boolean;
  challenges: TrainingChallengeDefinition[];
}
export interface TrainingPuzzleDefinition {
  enabled: boolean;
  clueText: string;
  imageUrl: string | null;
  answerDigest: string | null;
  normalizationVersion: 1;
}

export interface TrainingProgress {
  clearedChallengeIds: string[];
  claimedRewardIds: string[];
  hiddenChallengeDiscovered: boolean;
}
