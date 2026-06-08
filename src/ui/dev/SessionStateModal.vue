<script setup lang="ts">
import { onMounted, onUnmounted } from "vue";
import { useSessionStore } from "@/stores/sessionStore";
import { storeToRefs } from "pinia";
import { stateTransitionHistory } from "@/composables/useStateTransitionHistory";

defineEmits<{
  (e: "close"): void;
}>();

const store = useSessionStore();
const { snapshot } = storeToRefs(store);

const stateColors: Record<string, string> = {
  IDLE: "#27ae60",
  GENERATING: "#f39c12",
  COMBAT_PENDING: "#e67e22",
  IN_COMBAT: "#e74c3c",
  POST_COMBAT_READY: "#3498db",
  ERROR_RECOVERY: "#e74c3c",
};

function stateColor(state: string): string {
  return stateColors[state] || "#95a5a6";
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString();
}

function onKeydown(e: KeyboardEvent): void {
  if (e.key === "Escape") {
    // emit close via parent — the emit won't cross component boundary here
    // so we dispatch a custom event that the parent listens for
    window.dispatchEvent(new CustomEvent("mg-close-state-modal"));
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
  <div class="mg-modal-overlay" @click.self="$emit('close')">
    <div class="mg-modal-card mg-modal-card--sm">
      <button class="mg-modal__close" @click="$emit('close')">
        <i class="fas fa-times"></i>
      </button>
      <h2 class="mg-modal__title">状态机</h2>
      <div class="mg-modal__body mg-scroll">
        <!-- Current state pill -->
        <div class="mg-state-current">
          <span>当前状态：</span>
          <span
            class="mg-state-pill"
            :style="{ background: stateColor(snapshot?.sessionState || '') }"
          >
            {{ snapshot?.sessionState }}
          </span>
        </div>

        <!-- Transition history -->
        <h3 class="mg-state-history-title">状态转换历史</h3>
        <ol v-if="stateTransitionHistory.length > 0" class="mg-state-history">
          <li
            v-for="(t, i) in stateTransitionHistory"
            :key="i"
            class="mg-state-history__item"
          >
            <span class="mg-state-time">{{ formatTime(t.timestamp) }}</span>
            <span class="mg-state-name mg-state-name--from">{{ t.from }}</span>
            <i class="fas fa-arrow-right mg-state-arrow"></i>
            <span class="mg-state-name mg-state-name--to">{{ t.to }}</span>
          </li>
        </ol>
        <p v-else class="mg-state-empty">暂无状态转换记录</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.mg-state-current {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 16px;
  font-size: 1rem;
}

.mg-state-pill {
  display: inline-block;
  padding: 4px 14px;
  border-radius: 999px;
  color: #fff;
  font-weight: 700;
  font-size: 0.85rem;
  letter-spacing: 0.03em;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
}

.mg-state-history-title {
  margin: 0 0 10px;
  font-size: 0.95rem;
  color: var(--mg-text, inherit);
}

.mg-state-history {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.mg-state-history__item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border-radius: var(--mg-radius-sm, 4px);
  background: var(--mg-bg-input, rgba(255, 255, 255, 0.04));
  font-size: 0.82rem;
  flex-wrap: wrap;
}

.mg-state-time {
  color: var(--mg-text-secondary, #999);
  font-variant-numeric: tabular-nums;
  min-width: 70px;
}

.mg-state-name {
  font-weight: 600;
  padding: 2px 8px;
  border-radius: var(--mg-radius-sm, 4px);
  font-size: 0.8rem;
}

.mg-state-name--from {
  background: rgba(255, 255, 255, 0.06);
  color: var(--mg-text-secondary, #999);
}

.mg-state-name--to {
  background: var(--mg-accent-subtle, rgba(255, 107, 157, 0.15));
  color: var(--mg-accent-strong, #ff6b9d);
}

.mg-state-arrow {
  font-size: 0.7rem;
  color: var(--mg-text-secondary, #999);
}

.mg-state-empty {
  color: var(--mg-text-muted, #777);
  font-size: 0.85rem;
  font-style: italic;
}
</style>
