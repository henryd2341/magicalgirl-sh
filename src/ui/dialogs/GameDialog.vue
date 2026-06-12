<script setup lang="ts">
import { useGameDialog } from "@/composables/useGameDialog";
import { onMounted, onUnmounted } from "vue";

const { state, handleConfirm, handleCancel } = useGameDialog();

function onKeydown(e: KeyboardEvent) {
  if (!state.visible) return;
  if (e.key === "Escape") {
    e.preventDefault();
    handleCancel();
  } else if (e.key === "Enter") {
    e.preventDefault();
    handleConfirm();
  }
}

onMounted(() => {
  document.addEventListener("keydown", onKeydown);
});

onUnmounted(() => {
  document.removeEventListener("keydown", onKeydown);
});
</script>

<template>
  <div
    v-if="state.visible"
    class="mg-modal-overlay"
    @click.self="handleCancel"
  >
    <div class="mg-modal-card game-dialog">
      <h2 class="mg-modal__title">
        <i :class="state.type === 'alert' ? 'fas fa-info-circle' : 'fas fa-question-circle'"></i>
        {{ state.type === "alert" ? "提示" : "确认" }}
      </h2>
      <div class="mg-modal__body game-dialog__body">
        <p class="game-dialog__message">{{ state.message }}</p>
      </div>
      <div class="game-dialog__actions">
        <button
          v-if="state.type === 'confirm'"
          class="mg-btn mg-btn--ghost"
          @click.stop="handleCancel"
        >
          {{ state.cancelText }}
        </button>
        <button
          class="mg-btn mg-btn--primary"
          @click.stop="handleConfirm"
        >
          {{ state.confirmText }}
        </button>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.game-dialog {
  max-width: 420px;
}

.game-dialog__body {
  text-align: center;
}

.game-dialog__message {
  margin: 0;
  font-size: var(--mg-font-base);
  line-height: var(--mg-leading-relaxed);
  color: var(--mg-text);
  white-space: pre-wrap;
}

.game-dialog__actions {
  display: flex;
  justify-content: center;
  gap: 12px;
  padding: 0 var(--mg-space-lg) var(--mg-space-lg);
}
</style>
