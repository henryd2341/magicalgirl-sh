<script setup lang="ts">
import { canRevealHiddenClue } from "@/engine/training/trainingRules";
import { TRAINING_CATALOG } from "@/content/trainingCatalog";
import { useTrainingStore } from "@/stores/trainingStore";
import ChallengeLadderPanel from "@/ui/training/ChallengeLadderPanel.vue";
import FreeTrainingPanel from "@/ui/training/FreeTrainingPanel.vue";
import HiddenChallengePuzzle from "@/ui/training/HiddenChallengePuzzle.vue";
import TrainingBattleConfirm from "@/ui/training/TrainingBattleConfirm.vue";
import { computed, nextTick, onMounted, ref } from "vue";

const emit = defineEmits<{ close: [] }>();
const store = useTrainingStore();
const dialog = ref<HTMLElement | null>(null);
const closeButton = ref<HTMLButtonElement | null>(null);
const clueAvailable = computed(() =>
  canRevealHiddenClue(TRAINING_CATALOG, store.progress) ||
  store.progress.hiddenChallengeDiscovered,
);

function close() {
  store.close();
  emit("close");
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === "Escape") {
    event.preventDefault();
    close();
    return;
  }
  if (event.key !== "Tab" || dialog.value == null) return;
  const focusable = [...dialog.value.querySelectorAll<HTMLElement>(
    'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
  )];
  if (focusable.length === 0) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

onMounted(async () => {
  await nextTick();
  closeButton.value?.focus();
});
</script>

<template>
  <div class="training-overlay" @click.self="close">
    <section
      ref="dialog"
      class="training-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="training-title"
      @keydown="onKeydown"
    >
      <header class="training-header">
        <div><p class="training-kicker">SANDBOX COMBAT</p><h2 id="training-title">训练场</h2></div>
        <button ref="closeButton" type="button" class="training-close" aria-label="关闭训练场" @click="close">×</button>
      </header>

      <p class="training-rule"><strong>沙盒规则：</strong>自由练习无消耗、无奖励；挑战仅在首次胜利时写入奖励与进度。</p>
      <p v-if="store.contentDisabledReason" class="training-disabled" role="status">{{ store.contentDisabledReason }}</p>

      <div class="training-tabs" role="tablist" aria-label="训练模式">
        <button id="training-tab-free" role="tab" :aria-selected="store.activeTab === 'free'" aria-controls="training-panel-free" @click="store.setTab('free')">自由练习</button>
        <button id="training-tab-challenge" role="tab" :aria-selected="store.activeTab === 'challenge'" aria-controls="training-panel-challenge" @click="store.setTab('challenge')">挑战模式</button>
      </div>

      <div class="training-body mg-scroll">
        <div v-if="store.activeTab === 'free'" id="training-panel-free" role="tabpanel" aria-labelledby="training-tab-free">
          <FreeTrainingPanel
            :enemies="store.eligibleEnemies"
            :selected="store.selectedEnemies"
            :search-query="store.searchQuery"
            @update:search-query="store.searchQuery = $event"
            @add="store.addEnemy"
            @remove="store.removeEnemyAt"
          />
        </div>
        <div v-else id="training-panel-challenge" role="tabpanel" aria-labelledby="training-tab-challenge">
          <ChallengeLadderPanel :challenges="store.challenges" :selected-id="store.selectedChallengeId" :progress="store.progress" @select="store.selectChallenge" />
          <HiddenChallengePuzzle :puzzle="store.puzzle" :clue-available="clueAvailable" @submit="store.submitPuzzleAnswer" />
        </div>
      </div>

      <p v-if="store.errorMessage" class="training-error" role="alert">{{ store.errorMessage }}</p>
      <footer class="training-footer">
        <span>当前先锋将作为训练队伍</span>
        <button type="button" class="mg-btn mg-btn--primary" :disabled="!store.canStart" @click="store.requestBattleConfirmation">开战确认</button>
      </footer>

      <TrainingBattleConfirm v-if="store.showBattleConfirm" :busy="store.isBusy" @cancel="store.showBattleConfirm = false" @confirm="store.confirmBattle" />
    </section>
  </div>
</template>

<style scoped>
.training-overlay { position: fixed; inset: 0; z-index: 1000; display: grid; place-items: center; padding: var(--mg-space-md); background: color-mix(in srgb, var(--mg-bg) 72%, transparent); backdrop-filter: blur(8px); }
.training-dialog { position: relative; display: flex; flex-direction: column; width: min(100%, 1000px); max-height: min(90dvh, 820px); overflow: hidden; border: 3px solid var(--mg-border-strong); border-radius: var(--mg-radius-xl); background: var(--mg-bg-card); color: var(--mg-text); box-shadow: var(--mg-shadow-card); }
.training-header, .training-footer { display: flex; align-items: center; justify-content: space-between; gap: var(--mg-space-md); padding: var(--mg-space-md) var(--mg-space-lg); }
.training-header { border-bottom: 1px solid var(--mg-border-light); }
.training-header h2, .training-header p { margin: 0; }
.training-kicker { color: var(--mg-accent); font: 700 .75rem/1 var(--mg-font-mono); letter-spacing: .14em; }
.training-close { width: 44px; height: 44px; border-radius: var(--mg-radius-pill); font-size: 1.5rem; }
.training-rule, .training-disabled, .training-error { margin: var(--mg-space-sm) var(--mg-space-lg) 0; padding: var(--mg-space-sm) var(--mg-space-md); border-radius: var(--mg-radius); background: var(--mg-bg-input); }
.training-disabled, .training-error { color: var(--mg-accent); }
.training-tabs { display: flex; gap: var(--mg-space-sm); padding: var(--mg-space-md) var(--mg-space-lg) 0; }
.training-tabs button { min-height: 44px; padding-inline: var(--mg-space-lg); border-bottom: 3px solid transparent; }
.training-tabs button[aria-selected="true"] { border-color: var(--mg-accent); color: var(--mg-accent); }
.training-body { min-height: 0; overflow: auto; padding: var(--mg-space-lg); }
.training-footer { border-top: 1px solid var(--mg-border-light); }
.training-footer button { min-height: 44px; }
.training-confirm { position: absolute; inset: 0; display: grid; place-items: center; padding: var(--mg-space-lg); background: color-mix(in srgb, var(--mg-bg) 75%, transparent); }
.training-confirm__card { max-width: 460px; padding: var(--mg-space-xl); border: 2px solid var(--mg-border-strong); border-radius: var(--mg-radius-lg); background: var(--mg-bg-card); }
.training-actions { display: flex; justify-content: flex-end; gap: var(--mg-space-sm); }
:deep(.training-free) { display: grid; grid-template-columns: 1.25fr .75fr; gap: var(--mg-space-lg); }
:deep(.training-panel) { padding: var(--mg-space-md); border: 1px solid var(--mg-border-light); border-radius: var(--mg-radius-lg); background: var(--mg-bg-input); }
:deep(.training-panel h3) { margin-top: 0; }
:deep(.training-panel input) { width: 100%; min-height: 44px; margin-block: var(--mg-space-xs) var(--mg-space-sm); }
:deep(.training-list), :deep(.challenge-ladder) { display: grid; gap: var(--mg-space-sm); margin: 0; padding: 0; list-style: none; }
:deep(.training-list li) { display: flex; align-items: center; justify-content: space-between; gap: var(--mg-space-sm); padding: var(--mg-space-sm); border-radius: var(--mg-radius); background: var(--mg-bg-card); }
:deep(.training-list span), :deep(.challenge-card span) { display: grid; text-align: left; }
:deep(.training-list small), :deep(.challenge-card small) { color: var(--mg-text-muted); }
:deep(.challenge-card) { display: flex; align-items: center; gap: var(--mg-space-md); width: 100%; min-height: 56px; padding: var(--mg-space-sm) var(--mg-space-md); }
:deep(.challenge-card--selected) { outline: 3px solid var(--mg-accent); }
:deep(.challenge-card__order) { display: grid; place-items: center; width: 36px; height: 36px; border-radius: 50%; background: var(--mg-accent-subtle); }
:deep(.training-puzzle) { margin-top: var(--mg-space-md); padding: var(--mg-space-md); border: 1px dashed var(--mg-accent); border-radius: var(--mg-radius-lg); }
:deep(.training-hint), .training-empty { color: var(--mg-text-muted); }
button { cursor: pointer; }
button:disabled { cursor: not-allowed; opacity: .45; }
button:focus-visible, input:focus-visible { outline: 3px solid var(--mg-accent); outline-offset: 2px; }
@media (max-width: 767px) { .training-overlay { padding: 0; } .training-dialog { width: 100%; max-height: 100dvh; min-height: 100dvh; border-radius: 0; } :deep(.training-free) { grid-template-columns: 1fr; } .training-footer { align-items: stretch; flex-direction: column; } }
@media (prefers-reduced-motion: reduce) { .training-dialog { scroll-behavior: auto; } }
</style>
