import type {
  TrainingCatalog,
  TrainingPuzzleDefinition,
} from "@/types/training";

export const TRAINING_CATALOG: TrainingCatalog = {
  enabled: false,
  challenges: [],
};

export const TRAINING_PUZZLE: TrainingPuzzleDefinition = {
  enabled: false,
  clueText: "谜题尚未开放",
  imageUrl: null,
  answerDigest: null,
  normalizationVersion: 1,
};