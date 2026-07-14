import {
  getAllEnemies,
  getAllItems,
  isChallengeEnemyId,
} from "@/content/contentRegistry";
import type { ResolvedEnemyContent } from "@/types/content";
import type {
  TrainingCatalog,
  TrainingChallengeDefinition,
  TrainingProgress,
  TrainingPuzzleDefinition,
} from "@/types/training";

export interface TrainingValidationResult {
  ok: boolean;
  errors: string[];
}

function validationResult(errors: string[]): TrainingValidationResult {
  return { ok: errors.length === 0, errors };
}

function collectReservedEnemyIds(catalog: TrainingCatalog): Set<string> {
  return new Set(
    catalog.challenges.flatMap((challenge) =>
      challenge.enemies.map((enemy) => enemy.enemy_id),
    ),
  );
}

export function validateTrainingCatalog(
  catalog: TrainingCatalog,
  puzzle: TrainingPuzzleDefinition,
): TrainingValidationResult {
  const errors: string[] = [];

  if (!catalog.enabled) {
    if (catalog.challenges.length !== 0) errors.push("disabled catalog must be empty");
    if (puzzle.enabled) errors.push("disabled catalog cannot enable puzzle");
    if (puzzle.normalizationVersion !== 1) errors.push("unsupported puzzle normalization version");
    return validationResult(errors);
  }

  const normalChallenges = catalog.challenges.filter((challenge) => !challenge.hidden);
  const hiddenChallenges = catalog.challenges.filter((challenge) => challenge.hidden);
  if (catalog.challenges.length !== 6 || normalChallenges.length !== 5 || hiddenChallenges.length !== 1) {
    errors.push("enabled catalog requires exactly five normal challenges and one hidden challenge");
  }

  const ids = new Set<string>();
  const orders = new Set<number>();
  const enemies = getAllEnemies();
  const items = getAllItems();
  for (const challenge of catalog.challenges) {
    if (challenge.id.trim().length === 0 || ids.has(challenge.id)) errors.push("challenge ids must be non-empty and unique");
    ids.add(challenge.id);
    if (!Number.isInteger(challenge.order) || challenge.order < 1 || orders.has(challenge.order)) errors.push("challenge orders must be unique positive integers");
    orders.add(challenge.order);
    if (!challenge.enabled || challenge.name.trim().length === 0) errors.push("enabled catalog challenges must be enabled and named");
    if (challenge.enemies.length === 0 || challenge.enemies.some((enemy) => enemy.enemy_id.trim().length === 0 || !Number.isInteger(enemy.count) || enemy.count < 1)) errors.push("challenge enemies require positive integer counts");
    if (challenge.enemies.some((enemy) => !enemies.has(enemy.enemy_id))) errors.push("challenge enemies must reference existing enemies");
    if (!Number.isInteger(challenge.firstClearReward.money) || challenge.firstClearReward.money < 0 || Object.entries(challenge.firstClearReward.items).some(([itemId, count]) => itemId.trim().length === 0 || !Number.isInteger(count) || count < 0)) errors.push("challenge rewards require non-negative integer amounts");
    if (Object.keys(challenge.firstClearReward.items).some((itemId) => !items.has(itemId))) errors.push("challenge rewards must reference existing items");
  }

  const orderedNormals = [...normalChallenges].sort((left, right) => left.order - right.order);
  orderedNormals.forEach((challenge, index) => {
    const expectedOrder = index + 1;
    const expectedPrerequisite = index === 0 ? null : orderedNormals[index - 1]!.id;
    if (challenge.order !== expectedOrder) errors.push("normal challenge orders must be exactly one through five");
    if (challenge.prerequisiteId !== expectedPrerequisite) errors.push("normal challenge prerequisite chain is invalid");
  });

  const hidden = hiddenChallenges[0];
  if (hidden != null && (hidden.order !== 6 || hidden.prerequisiteId !== null)) errors.push("hidden challenge must be order six without a prerequisite");
  if (!puzzle.enabled || puzzle.clueText.trim().length === 0 || puzzle.imageUrl == null || puzzle.imageUrl.trim().length === 0 || puzzle.answerDigest == null || !/^[0-9a-f]{64}$/i.test(puzzle.answerDigest) || puzzle.normalizationVersion !== 1) errors.push("enabled puzzle configuration is incomplete");
  return validationResult(errors);
}

export function listFreeTrainingEnemies(protagonistLevel: number, catalog: TrainingCatalog): ResolvedEnemyContent[] {
  const reservedEnemyIds = collectReservedEnemyIds(catalog);
  return [...getAllEnemies().values()].filter((enemy) => enemy.baseLevel <= protagonistLevel &&
      !isChallengeEnemyId(enemy.id) &&
      !reservedEnemyIds.has(enemy.id));
}

export function validateFreeTrainingSelection(enemyIds: string[], protagonistLevel: number, catalog: TrainingCatalog): TrainingValidationResult {
  const errors: string[] = [];
  if (enemyIds.length < 1) errors.push("select at least one enemy");
  if (enemyIds.length > 4) errors.push("select at most four enemies");
  const enemies = getAllEnemies();
  const reservedEnemyIds = collectReservedEnemyIds(catalog);
  for (const enemyId of enemyIds) {
    const enemy = enemies.get(enemyId);
    if (enemy == null) { errors.push(`unknown enemy: ${enemyId}`); continue; }
    if (enemy.baseLevel > protagonistLevel) errors.push(`enemy above protagonist level: ${enemyId}`);
    if (isChallengeEnemyId(enemyId)) errors.push(`enemy reserved for challenge mode: ${enemyId}`);
    if (reservedEnemyIds.has(enemyId)) errors.push(`enemy reserved for a challenge: ${enemyId}`);
  }
  return validationResult(errors);
}

export function isChallengeUnlocked(challenge: TrainingChallengeDefinition, progress: TrainingProgress): boolean {
  if (!challenge.enabled) return false;
  if (challenge.hidden) return progress.hiddenChallengeDiscovered;
  return challenge.prerequisiteId === null || progress.clearedChallengeIds.includes(challenge.prerequisiteId);
}

export function canRevealHiddenClue(catalog: TrainingCatalog, progress: TrainingProgress): boolean {
  if (!catalog.enabled || progress.hiddenChallengeDiscovered) return false;
  const normalChallengeIds = catalog.challenges.filter((challenge) => challenge.enabled && !challenge.hidden).map((challenge) => challenge.id);
  return normalChallengeIds.length === 5 && normalChallengeIds.every((id) => progress.clearedChallengeIds.includes(id));
}

export function normalizeTrainingAnswer(answer: string, normalizationVersion: 1): string {
  if (normalizationVersion !== 1) throw new Error(`Unsupported training answer normalization version: ${normalizationVersion}`);
  return answer.trim().toLocaleLowerCase("en-US");
}

export async function digestTrainingAnswer(answer: string, normalizationVersion: 1): Promise<string> {
  const normalized = normalizeTrainingAnswer(answer, normalizationVersion);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(normalized));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
