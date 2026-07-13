import { TRAINING_CATALOG, TRAINING_PUZZLE } from "@/content/trainingCatalog";
import { getAllEnemies } from "@/content/contentRegistry";
import {
  isChallengeUnlocked,
  listFreeTrainingEnemies,
  validateFreeTrainingSelection,
} from "@/engine/training/trainingRules";
import { getTrainingProgress } from "@/engine/variablePolicy";
import { useSessionStore } from "@/stores/sessionStore";
import type { TrainingProgress } from "@/types/training";
import { computed, ref } from "vue";
import { defineStore } from "pinia";

export type TrainingTab = "free" | "challenge";

const EMPTY_PROGRESS: TrainingProgress = {
  clearedChallengeIds: [],
  claimedRewardIds: [],
  hiddenChallengeDiscovered: false,
};

export const useTrainingStore = defineStore("training", () => {
  const isOpen = ref(false);
  const activeTab = ref<TrainingTab>("free");
  const searchQuery = ref("");
  const selectedEnemyIds = ref<string[]>([]);
  const selectedChallengeId = ref<string | null>(null);
  const showBattleConfirm = ref(false);
  const lastResult = ref<unknown>(null);
  const errorMessage = ref<string | null>(null);
  const isBusy = ref(false);
  const protagonistLevel = ref(1);
  const progress = ref<TrainingProgress>({ ...EMPTY_PROGRESS });

  const contentDisabledReason = computed(() =>
    TRAINING_CATALOG.enabled ? null : "训练场内容尚未开放",
  );
  const eligibleEnemies = computed(() => {
    const query = searchQuery.value.trim().toLocaleLowerCase("zh-CN");
    return listFreeTrainingEnemies(protagonistLevel.value, TRAINING_CATALOG)
      .filter((enemy) =>
        query.length === 0
          ? true
          : enemy.name.toLocaleLowerCase("zh-CN").includes(query) ||
            enemy.id.toLocaleLowerCase("en-US").includes(query),
      );
  });
  const selectedEnemies = computed(() => {
    const enemies = getAllEnemies();
    return selectedEnemyIds.value.flatMap((id) => {
      const enemy = enemies.get(id);
      return enemy == null ? [] : [enemy];
    });
  });
  const challenges = computed(() =>
    [...TRAINING_CATALOG.challenges]
      .filter(
        (challenge) =>
          challenge.enabled &&
          (!challenge.hidden || progress.value.hiddenChallengeDiscovered),
      )
      .sort((left, right) => left.order - right.order),
  );
  const selectedChallenge = computed(() =>
    challenges.value.find(
      (challenge) => challenge.id === selectedChallengeId.value,
    ) ?? null,
  );
  const canStart = computed(() => {
    if (!TRAINING_CATALOG.enabled || isBusy.value) return false;
    if (activeTab.value === "free") {
      return validateFreeTrainingSelection(
        selectedEnemyIds.value,
        protagonistLevel.value,
        TRAINING_CATALOG,
      ).ok;
    }
    return (
      selectedChallenge.value != null &&
      isChallengeUnlocked(selectedChallenge.value, progress.value)
    );
  });

  async function refreshProgress(): Promise<void> {
    const current = await useSessionStore().getVariableSnapshot();
    if (current == null) return;
    protagonistLevel.value = current.root.player.combat.level;
    progress.value = getTrainingProgress(current.root);
  }

  async function open(): Promise<void> {
    errorMessage.value = null;
    await refreshProgress();
    isOpen.value = true;
  }

  function close(): void {
    isOpen.value = false;
    showBattleConfirm.value = false;
  }

  function setTab(tab: TrainingTab): void {
    activeTab.value = tab;
    showBattleConfirm.value = false;
    errorMessage.value = null;
  }

  function addEnemy(enemyId: string): boolean {
    if (selectedEnemyIds.value.length >= 4) {
      errorMessage.value = "最多选择 4 名敌人";
      return false;
    }
    selectedEnemyIds.value.push(enemyId);
    errorMessage.value = null;
    return true;
  }

  function removeEnemyAt(index: number): void {
    selectedEnemyIds.value.splice(index, 1);
    errorMessage.value = null;
  }

  function selectChallenge(challengeId: string): boolean {
    const challenge = challenges.value.find((entry) => entry.id === challengeId);
    if (challenge == null || !isChallengeUnlocked(challenge, progress.value)) {
      errorMessage.value = "该挑战尚未解锁";
      return false;
    }
    selectedChallengeId.value = challengeId;
    errorMessage.value = null;
    return true;
  }

  function requestBattleConfirmation(): boolean {
    if (!canStart.value) {
      errorMessage.value = contentDisabledReason.value ?? "当前配置不可开战";
      return false;
    }
    showBattleConfirm.value = true;
    return true;
  }

  async function confirmBattle(): Promise<void> {
    if (!canStart.value) {
      requestBattleConfirmation();
      return;
    }
    isBusy.value = true;
    errorMessage.value = null;
    try {
      const session = useSessionStore();
      lastResult.value = activeTab.value === "free"
        ? await session.startTrainingBattle({
            mode: "free",
            enemyIds: [...selectedEnemyIds.value],
          })
        : await session.startTrainingBattle({
            mode: "challenge",
            challengeId: selectedChallengeId.value!,
          });
      showBattleConfirm.value = false;
      isOpen.value = false;
    } catch (error) {
      errorMessage.value = error instanceof Error ? error.message : String(error);
    } finally {
      isBusy.value = false;
    }
  }

  async function submitPuzzleAnswer(answer: string) {
    isBusy.value = true;
    errorMessage.value = null;
    try {
      const result = await useSessionStore().submitTrainingPuzzleAnswer(answer);
      lastResult.value = result;
      if (result.discovered) await refreshProgress();
      return result;
    } catch (error) {
      errorMessage.value = error instanceof Error ? error.message : String(error);
      throw error;
    } finally {
      isBusy.value = false;
    }
  }

  return {
    isOpen,
    activeTab,
    searchQuery,
    selectedEnemyIds,
    selectedChallengeId,
    showBattleConfirm,
    lastResult,
    errorMessage,
    isBusy,
    protagonistLevel,
    progress,
    contentDisabledReason,
    puzzle: TRAINING_PUZZLE,
    eligibleEnemies,
    selectedEnemies,
    challenges,
    selectedChallenge,
    canStart,
    open,
    close,
    setTab,
    addEnemy,
    removeEnemyAt,
    selectChallenge,
    requestBattleConfirmation,
    confirmBattle,
    refreshProgress,
    submitPuzzleAnswer,
  };
});
