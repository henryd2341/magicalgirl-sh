import {
  canRevealHiddenClue,
  digestTrainingAnswer,
  isChallengeUnlocked,
  normalizeTrainingAnswer,
  validateFreeTrainingSelection,
  validateTrainingCatalog,
} from "@/engine/training/trainingRules";
import { getTrainingProgress } from "@/engine/variablePolicy";
import type {
  BattleSnapshot,
  CreatePendingBattleSnapshotInput,
} from "@/types/battle";
import type {
  TrainingCatalog,
  TrainingChallengeDefinition,
  TrainingPuzzleDefinition,
  TrainingReward,
} from "@/types/training";
import type {
  GameVariablesRoot,
  VariableValueRecord,
} from "@/types/variables";

export interface TrainingSessionServiceDependencies {
  catalog: TrainingCatalog;
  puzzle: TrainingPuzzleDefinition;
  getCurrent: () => Promise<VariableValueRecord>;
  saveCurrent: (record: VariableValueRecord) => Promise<void>;
  stageEncounter: (input: CreatePendingBattleSnapshotInput) => Promise<void>;
  createNextRecord: (
    root: GameVariablesRoot,
    previous: VariableValueRecord,
  ) => VariableValueRecord;
  digestAnswer?: (normalizedAnswer: string) => Promise<string>;
}

export type CompleteTrainingBattleResult =
  | {
      rewarded: true;
      challengeId: string;
      reward: TrainingReward;
    }
  | {
      rewarded: false;
      challengeId?: string;
      reason: "free_training" | "not_victory" | "already_claimed";
    };

function requireTrainingSource(snapshot: BattleSnapshot): void {
  if (
    snapshot.source !== "training/free" &&
    snapshot.source !== "training/challenge"
  ) {
    throw new Error("[TRAINING_SOURCE_REQUIRED] Expected a training battle.");
  }
}

function requireResolvedTrainingBattle(snapshot: BattleSnapshot): void {
  requireTrainingSource(snapshot);
  if (
    snapshot.lifecycleState !== "RESOLVED" ||
    snapshot.phase !== "RESULT" ||
    snapshot.battleResult == null
  ) {
    throw new Error(
      "[TRAINING_BATTLE_UNRESOLVED] Training battle must be resolved before completion.",
    );
  }
}

function copyRoot(root: GameVariablesRoot): GameVariablesRoot {
  return structuredClone(root);
}

let rewardCommitQueue: Promise<void> = Promise.resolve();

function serializeRewardCommit<T>(operation: () => Promise<T>): Promise<T> {
  const result = rewardCommitQueue.then(operation);
  rewardCommitQueue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

function collapseEnemies(enemyIds: string[]): Array<{
  enemy_id: string;
  count: number;
}> {
  const counts = new Map<string, number>();
  for (const enemyId of enemyIds) {
    counts.set(enemyId, (counts.get(enemyId) ?? 0) + 1);
  }
  return [...counts].map(([enemy_id, count]) => ({ enemy_id, count }));
}

export class TrainingSessionService {
  private readonly dependencies: TrainingSessionServiceDependencies;

  private encounterSequence = 0;

  public constructor(dependencies: TrainingSessionServiceDependencies) {
    this.dependencies = dependencies;
  }

  public async beginFreeTraining(
    enemyIds: string[],
  ): Promise<{ encounterId: string }> {
    const current = await this.dependencies.getCurrent();
    const validation = validateFreeTrainingSelection(
      enemyIds,
      current.root.player.combat.level,
      this.dependencies.catalog,
    );
    if (!validation.ok) {
      throw new Error(`[TRAINING_FREE_INVALID] ${validation.errors.join("; ")}`);
    }

    const encounterId = this.createEncounterId("training/free");
    await this.dependencies.stageEncounter({
      encounterId,
      narrativeReason: "自由练习",
      enemies: collapseEnemies(enemyIds),
      source: "training/free",
    });
    return { encounterId };
  }

  public async beginChallenge(
    challengeId: string,
  ): Promise<{ encounterId: string; challengeId: string }> {
    const challenge = this.findEnabledChallenge(challengeId);
    const current = await this.dependencies.getCurrent();
    if (!isChallengeUnlocked(challenge, getTrainingProgress(current.root))) {
      throw new Error(`[TRAINING_CHALLENGE_LOCKED] Challenge ${challengeId} is locked.`);
    }

    const encounterId = this.createEncounterId(
      `training/challenge/${encodeURIComponent(challengeId)}`,
    );
    await this.dependencies.stageEncounter({
      encounterId,
      narrativeReason: challenge.name,
      enemies: challenge.enemies.map((enemy) => ({ ...enemy })),
      source: "training/challenge",
    });
    return { encounterId, challengeId };
  }

  public async completeTrainingBattle(
    snapshot: BattleSnapshot,
  ): Promise<CompleteTrainingBattleResult> {
    requireResolvedTrainingBattle(snapshot);
    if (snapshot.source === "training/free") {
      return { rewarded: false, reason: "free_training" };
    }

    return serializeRewardCommit(() =>
      this.completeChallengeBattle(snapshot),
    );
  }

  private async completeChallengeBattle(
    snapshot: BattleSnapshot,
  ): Promise<CompleteTrainingBattleResult> {
    const challenge = this.challengeForEncounter(snapshot.encounterId);
    if (snapshot.battleResult?.outcome !== "victory") {
      return {
        rewarded: false,
        challengeId: challenge.id,
        reason: "not_victory",
      };
    }

    const current = await this.dependencies.getCurrent();
    const progress = getTrainingProgress(current.root);
    if (progress.claimedRewardIds.includes(challenge.id)) {
      return {
        rewarded: false,
        challengeId: challenge.id,
        reason: "already_claimed",
      };
    }

    const root = copyRoot(current.root);
    root.training = {
      clearedChallengeIds: [
        ...new Set([...progress.clearedChallengeIds, challenge.id]),
      ],
      claimedRewardIds: [
        ...new Set([...progress.claimedRewardIds, challenge.id]),
      ],
      hiddenChallengeDiscovered: progress.hiddenChallengeDiscovered,
    };
    root.player.money += challenge.firstClearReward.money;
    for (const [itemId, count] of Object.entries(
      challenge.firstClearReward.items,
    )) {
      root.inventory.items[itemId] =
        (root.inventory.items[itemId] ?? 0) + count;
    }

    const next = this.dependencies.createNextRecord(root, current);
    await this.dependencies.saveCurrent(next);
    return {
      rewarded: true,
      challengeId: challenge.id,
      reward: {
        money: challenge.firstClearReward.money,
        items: { ...challenge.firstClearReward.items },
      },
    };
  }

  public async abortTrainingBattle(
    snapshot: BattleSnapshot,
  ): Promise<{ aborted: true }> {
    requireTrainingSource(snapshot);
    return { aborted: true };
  }

  public async submitPuzzleAnswer(
    answer: string,
  ): Promise<
    | { discovered: false; reason: "mismatch" }
    | { discovered: true; alreadyDiscovered: boolean }
  > {
    const catalogValidation = validateTrainingCatalog(
      this.dependencies.catalog,
      this.dependencies.puzzle,
    );
    if (!catalogValidation.ok) {
      throw new Error(
        `[TRAINING_PUZZLE_UNAVAILABLE] ${catalogValidation.errors.join("; ")}`,
      );
    }

    const current = await this.dependencies.getCurrent();
    const progress = getTrainingProgress(current.root);
    if (progress.hiddenChallengeDiscovered) {
      return { discovered: true, alreadyDiscovered: true };
    }
    if (!canRevealHiddenClue(this.dependencies.catalog, progress)) {
      throw new Error("[TRAINING_PUZZLE_LOCKED] Hidden clue is locked.");
    }

    const normalized = normalizeTrainingAnswer(
      answer,
      this.dependencies.puzzle.normalizationVersion,
    );
    const digest = this.dependencies.digestAnswer
      ? await this.dependencies.digestAnswer(normalized)
      : await digestTrainingAnswer(
          normalized,
          this.dependencies.puzzle.normalizationVersion,
        );
    if (digest !== this.dependencies.puzzle.answerDigest) {
      return { discovered: false, reason: "mismatch" };
    }

    const root = copyRoot(current.root);
    root.training = {
      ...progress,
      clearedChallengeIds: [...progress.clearedChallengeIds],
      claimedRewardIds: [...progress.claimedRewardIds],
      hiddenChallengeDiscovered: true,
    };
    await this.dependencies.saveCurrent(
      this.dependencies.createNextRecord(root, current),
    );
    return { discovered: true, alreadyDiscovered: false };
  }

  private createEncounterId(prefix: string): string {
    this.encounterSequence += 1;
    return `${prefix}/${this.encounterSequence}`;
  }

  private findEnabledChallenge(
    challengeId: string,
  ): TrainingChallengeDefinition {
    if (!this.dependencies.catalog.enabled) {
      throw new Error("[TRAINING_CATALOG_DISABLED] Training catalog is disabled.");
    }
    const challenge = this.dependencies.catalog.challenges.find(
      (candidate) => candidate.id === challengeId && candidate.enabled,
    );
    if (challenge == null) {
      throw new Error(
        `[TRAINING_CHALLENGE_NOT_FOUND] Challenge ${challengeId} is unavailable.`,
      );
    }
    return challenge;
  }

  private challengeForEncounter(
    encounterId: string,
  ): TrainingChallengeDefinition {
    const prefix = "training/challenge/";
    if (!encounterId.startsWith(prefix)) {
      throw new Error(
        `[TRAINING_CHALLENGE_ENCOUNTER_INVALID] ${encounterId} is not a challenge encounter.`,
      );
    }
    const encodedId = encounterId.slice(prefix.length).split("/")[0];
    return this.findEnabledChallenge(decodeURIComponent(encodedId));
  }
}