<script setup lang="ts">
import {
  useBattleBroadcastPreferences,
  type BattleBroadcastViewport,
} from "@/composables/useBattleBroadcastPreferences";
import type { BattleLogEntry } from "@/types/battle";
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";

const props = defineProps<{
  entries: BattleLogEntry[];
  turnCount: number;
}>();

const { preferences, updatePreferences } = useBattleBroadcastPreferences();
const logElement = ref<HTMLElement | null>(null);
const unreadCount = ref(0);
const isAtLatest = ref(true);

type PointerInteraction =
  | {
      kind: "drag";
      pointerId: number;
      captureTarget: HTMLElement;
      startClientX: number;
      startClientY: number;
      startX: number;
      startY: number;
      activationThreshold: number;
      didMove: boolean;
    }
  | {
      kind: "resize";
      pointerId: number;
      captureTarget: HTMLElement;
      startClientX: number;
      startClientY: number;
      startWidth: number;
      startHeight: number;
    };

const pointerInteraction = ref<PointerInteraction | null>(null);
const suppressMinimizedRestoreClick = ref(false);

const visibleEntries = computed(() =>
  preferences.value.density === "detail"
    ? props.entries
    : props.entries.filter((entry) => entry.visibility === "both"),
);

const latestKeyAnnouncement = computed(() => {
  const latest = props.entries.at(-1);
  return latest == null ? "" : `第 ${props.turnCount} 回合：${latest.summary}`;
});

const windowStyle = computed(() => ({
  left: `${preferences.value.x}px`,
  top: `${preferences.value.y}px`,
  width: `${preferences.value.width}px`,
  height: `${preferences.value.height}px`,
}));

const iconStyle = computed(() => ({
  left: `${preferences.value.x}px`,
  top: `${preferences.value.y}px`,
}));

function currentViewport(): BattleBroadcastViewport {
  return {
    width: window.innerWidth,
    height: window.innerHeight,
  };
}

function capturePointer(event: PointerEvent): {
  pointerId: number;
  captureTarget: HTMLElement;
} {
  const pointerId = event.pointerId ?? 0;
  const captureTarget = event.currentTarget as HTMLElement;
  captureTarget.setPointerCapture?.(pointerId);
  return { pointerId, captureTarget };
}

function startDrag(event: PointerEvent, activationThreshold = 0): void {
  if (event.button !== 0 && event.button !== -1) {
    return;
  }

  event.preventDefault();
  pointerInteraction.value = {
    kind: "drag",
    ...capturePointer(event),
    startClientX: event.clientX,
    startClientY: event.clientY,
    startX: preferences.value.x,
    startY: preferences.value.y,
    activationThreshold,
    didMove: false,
  };
}

function startMinimizedDrag(event: PointerEvent): void {
  suppressMinimizedRestoreClick.value = false;
  startDrag(event, 5);
}

function moveDrag(event: PointerEvent): void {
  const interaction = pointerInteraction.value;
  if (
    interaction?.kind !== "drag" ||
    (event.pointerId != null && event.pointerId !== interaction.pointerId)
  ) {
    return;
  }

  const deltaX = event.clientX - interaction.startClientX;
  const deltaY = event.clientY - interaction.startClientY;
  if (Math.hypot(deltaX, deltaY) < interaction.activationThreshold) {
    return;
  }

  interaction.didMove = true;
  updatePreferences(
    {
      x: interaction.startX + deltaX,
      y: interaction.startY + deltaY,
    },
    currentViewport(),
  );
}

function startResize(event: PointerEvent): void {
  if (event.button !== 0 && event.button !== -1) {
    return;
  }

  event.stopPropagation();
  event.preventDefault();
  pointerInteraction.value = {
    kind: "resize",
    ...capturePointer(event),
    startClientX: event.clientX,
    startClientY: event.clientY,
    startWidth: preferences.value.width,
    startHeight: preferences.value.height,
  };
}

function moveResize(event: PointerEvent): void {
  const interaction = pointerInteraction.value;
  if (
    interaction?.kind !== "resize" ||
    (event.pointerId != null && event.pointerId !== interaction.pointerId)
  ) {
    return;
  }

  updatePreferences(
    {
      width:
        interaction.startWidth + event.clientX - interaction.startClientX,
      height:
        interaction.startHeight + event.clientY - interaction.startClientY,
    },
    currentViewport(),
  );
}

function movePointerInteraction(event: PointerEvent): void {
  if (pointerInteraction.value?.kind === "drag") {
    moveDrag(event);
  } else if (pointerInteraction.value?.kind === "resize") {
    moveResize(event);
  }
}

function endPointerInteraction(event: PointerEvent): void {
  const interaction = pointerInteraction.value;
  if (
    interaction == null ||
    (event.pointerId != null && event.pointerId !== interaction.pointerId)
  ) {
    return;
  }

  interaction.captureTarget.releasePointerCapture?.(interaction.pointerId);
  if (
    interaction.kind === "drag" &&
    interaction.activationThreshold > 0 &&
    interaction.didMove
  ) {
    suppressMinimizedRestoreClick.value = true;
  }
  pointerInteraction.value = null;
}

function moveFromKeyboard(event: KeyboardEvent): void {
  if (event.target !== event.currentTarget) {
    return;
  }

  const step = event.shiftKey ? 1 : 16;
  const deltaByKey: Record<string, { x: number; y: number }> = {
    ArrowLeft: { x: -step, y: 0 },
    ArrowRight: { x: step, y: 0 },
    ArrowUp: { x: 0, y: -step },
    ArrowDown: { x: 0, y: step },
  };
  const delta = deltaByKey[event.key];
  if (delta == null) {
    return;
  }

  event.preventDefault();
  updatePreferences({
    x: preferences.value.x + delta.x,
    y: preferences.value.y + delta.y,
  });
}

function toggleDensity(): void {
  updatePreferences({
    density:
      preferences.value.density === "compact" ? "detail" : "compact",
  });
}

function minimize(): void {
  updatePreferences({ minimized: true });
}

function restore(): void {
  updatePreferences({ minimized: false });
}

function restoreFromMinimizedClick(event: MouseEvent): void {
  if (suppressMinimizedRestoreClick.value) {
    event.preventDefault();
    suppressMinimizedRestoreClick.value = false;
    return;
  }

  restore();
}

function updateScrollPosition(): void {
  const element = logElement.value;
  if (element == null) {
    return;
  }

  isAtLatest.value =
    element.scrollHeight - element.scrollTop - element.clientHeight <= 8;
  if (isAtLatest.value) {
    unreadCount.value = 0;
  }
}

function jumpToLatest(): void {
  const element = logElement.value;
  if (element != null) {
    element.scrollTop = element.scrollHeight;
  }
  isAtLatest.value = true;
  unreadCount.value = 0;
}

function clampToViewport(): void {
  updatePreferences({}, currentViewport());
}

watch(
  () => props.entries.length,
  (nextLength, previousLength) => {
    const addedCount = Math.max(0, nextLength - previousLength);
    if (addedCount > 0 && !isAtLatest.value) {
      unreadCount.value += addedCount;
    }
  },
);

onMounted(() => {
  window.addEventListener("resize", clampToViewport);
  window.addEventListener("pointermove", movePointerInteraction);
  window.addEventListener("pointerup", endPointerInteraction);
  window.addEventListener("pointercancel", endPointerInteraction);
});

onBeforeUnmount(() => {
  window.removeEventListener("resize", clampToViewport);
  window.removeEventListener("pointermove", movePointerInteraction);
  window.removeEventListener("pointerup", endPointerInteraction);
  window.removeEventListener("pointercancel", endPointerInteraction);
});
</script>

<template>
  <Teleport to="body">
    <button
      v-if="preferences.minimized"
      type="button"
      class="battle-broadcast-icon"
      :style="iconStyle"
      aria-label="恢复战斗播报"
      @pointerdown="startMinimizedDrag"
      @click="restoreFromMinimizedClick"
    >
      <span aria-hidden="true">LOG</span>
      <span v-if="unreadCount > 0" class="battle-broadcast-icon__badge">
        {{ unreadCount }}
      </span>
    </button>

    <aside
      v-else
      class="battle-broadcast"
      :style="windowStyle"
      role="complementary"
      aria-label="战斗播报"
      draggable="true"
    >
      <header
        class="battle-broadcast__header"
        role="banner"
        aria-label="拖动战斗播报窗口"
        tabindex="0"
        @pointerdown="startDrag"
        @keydown="moveFromKeyboard"
      >
        <span class="battle-broadcast__title">
          战斗播报
          <small>TURN {{ turnCount }}</small>
        </span>
        <span class="battle-broadcast__controls">
          <button
            type="button"
            :aria-label="
              preferences.density === 'compact'
                ? '显示详细播报'
                : '显示精简播报'
            "
            @pointerdown.stop
            @click.stop="toggleDensity"
          >
            {{ preferences.density === "compact" ? "详细" : "精简" }}
          </button>
          <button
            type="button"
            aria-label="最小化战斗播报"
            @pointerdown.stop
            @click.stop="minimize"
          >
            <span aria-hidden="true">—</span>
          </button>
        </span>
      </header>

      <div
        ref="logElement"
        role="log"
        aria-label="战斗播报记录"
        aria-live="off"
        class="battle-broadcast__log"
        @scroll="updateScrollPosition"
      >
        <ol v-if="visibleEntries.length > 0">
          <li
            v-for="entry in visibleEntries"
            :key="entry.id"
            class="battle-broadcast__entry"
            :class="`battle-broadcast__entry--${entry.kind}`"
          >
            <span class="battle-broadcast__sequence">
              {{ String(entry.sequence).padStart(3, "0") }}
            </span>
            <div>
              <p>{{ entry.summary }}</p>
              <ul
                v-if="
                  preferences.density === 'detail' &&
                  entry.details != null &&
                  entry.details.length > 0
                "
                class="battle-broadcast__details"
              >
                <li v-for="detail in entry.details" :key="detail">
                  {{ detail }}
                </li>
              </ul>
            </div>
          </li>
        </ol>
        <p v-else class="battle-broadcast__empty">等待战斗行动……</p>
      </div>

      <footer class="battle-broadcast__footer">
        <span>{{ visibleEntries.length }} 条记录</span>
        <button
          v-if="unreadCount > 0"
          type="button"
          aria-label="跳到最新播报"
          @click="jumpToLatest"
        >
          {{ unreadCount }} 条新播报
        </button>
      </footer>

      <button
        type="button"
        class="battle-broadcast__resize"
        aria-label="调整战斗播报窗口尺寸"
        @pointerdown="startResize"
      />
    </aside>

    <p class="battle-broadcast__sr-only" aria-live="polite">
      {{ latestKeyAnnouncement }}
    </p>
  </Teleport>
</template>

<style scoped>
.battle-broadcast,
.battle-broadcast-icon {
  position: fixed;
  z-index: 1050;
  color: var(--mg-text, #f8f4ff);
}

.battle-broadcast {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  min-width: 280px;
  min-height: 180px;
  overflow: hidden;
  border: 1px solid var(--mg-border-light, rgba(207, 140, 255, 0.52));
  border-radius: var(--mg-radius-lg, 16px);
  background: color-mix(
    in srgb,
    var(--mg-bg-card, #241c36) 88%,
    transparent
  );
  box-shadow: var(--mg-shadow-card, 0 18px 48px rgba(0, 0, 0, 0.34));
  backdrop-filter: blur(10px);
}

.battle-broadcast__header {
  display: flex;
  min-height: 44px;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 6px 8px 6px 14px;
  border-bottom: 1px solid var(--mg-border-light, rgba(255, 255, 255, 0.12));
  background: color-mix(
    in srgb,
    var(--mg-accent, #cf8cff) 16%,
    var(--mg-bg-card, #241c36)
  );
  cursor: grab;
  touch-action: none;
  user-select: none;
}

.battle-broadcast__header:active {
  cursor: grabbing;
}

.battle-broadcast__header:focus-visible,
.battle-broadcast button:focus-visible,
.battle-broadcast-icon:focus-visible {
  outline: 3px solid var(--mg-accent, #cf8cff);
  outline-offset: -3px;
}

.battle-broadcast__title {
  display: flex;
  align-items: baseline;
  gap: 8px;
  font-weight: 700;
  letter-spacing: 0.04em;
}

.battle-broadcast__title small {
  color: var(--mg-text-muted, #c5b9d7);
  font-size: 0.7rem;
  font-variant-numeric: tabular-nums;
}

.battle-broadcast__controls {
  display: flex;
  gap: 8px;
}

.battle-broadcast button,
.battle-broadcast-icon {
  min-width: 44px;
  min-height: 44px;
  border: 1px solid var(--mg-border-light, rgba(255, 255, 255, 0.16));
  color: inherit;
  background: var(--mg-surface-pink, rgba(255, 255, 255, 0.08));
  cursor: pointer;
}

.battle-broadcast__controls button {
  border-radius: 10px;
  font: inherit;
  font-size: 0.78rem;
  font-weight: 650;
}

.battle-broadcast button:hover,
.battle-broadcast-icon:hover {
  background: var(--mg-surface-hover, rgba(255, 255, 255, 0.16));
}

.battle-broadcast__log {
  min-height: 0;
  padding: 10px 12px;
  overflow: auto;
  overscroll-behavior: contain;
  scrollbar-gutter: stable;
}

.battle-broadcast__log ol,
.battle-broadcast__details {
  padding: 0;
  margin: 0;
  list-style: none;
}

.battle-broadcast__entry {
  display: grid;
  grid-template-columns: 3ch minmax(0, 1fr);
  gap: 10px;
  padding: 8px 2px;
  border-bottom: 1px solid var(--mg-border-light, rgba(255, 255, 255, 0.08));
  font-size: 0.875rem;
  line-height: 1.5;
}

.battle-broadcast__entry p {
  margin: 0;
  overflow-wrap: anywhere;
}

.battle-broadcast__entry--mechanic,
.battle-broadcast__entry--result {
  color: var(--mg-accent, #e0b4ff);
  font-weight: 650;
}

.battle-broadcast__sequence {
  color: var(--mg-text-muted, #b9adc9);
  font-size: 0.75rem;
  font-variant-numeric: tabular-nums;
}

.battle-broadcast__details {
  margin-top: 4px;
  color: var(--mg-text-muted, #d1c7dc);
  font-size: 0.78rem;
}

.battle-broadcast__details li::before {
  content: "· ";
}

.battle-broadcast__empty {
  margin: 24px 0;
  color: var(--mg-text-muted, #c5b9d7);
  text-align: center;
}

.battle-broadcast__footer {
  display: flex;
  min-height: 44px;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 4px 12px;
  border-top: 1px solid var(--mg-border-light, rgba(255, 255, 255, 0.1));
  color: var(--mg-text-muted, #c5b9d7);
  font-size: 0.75rem;
}

.battle-broadcast__footer button {
  width: auto;
  padding: 0 12px;
  border-radius: 999px;
  color: var(--mg-text, #fff);
  font: inherit;
}

.battle-broadcast__resize {
  position: absolute;
  right: 0;
  bottom: 0;
  width: 44px;
  min-width: 44px;
  height: 44px;
  min-height: 44px;
  border: 0;
  background:
    linear-gradient(
      135deg,
      transparent 48%,
      var(--mg-text-muted, rgba(255, 255, 255, 0.48)) 50%,
      transparent 54%
    )
    14px 14px / 22px 22px no-repeat;
  cursor: nwse-resize;
  touch-action: none;
}

.battle-broadcast-icon {
  width: 52px;
  height: 52px;
  border-radius: 16px;
  background: color-mix(
    in srgb,
    var(--mg-bg-card, #241c36) 90%,
    transparent
  );
  box-shadow: 0 10px 28px rgba(0, 0, 0, 0.3);
  backdrop-filter: blur(10px);
  font-size: 0.7rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  cursor: grab;
  touch-action: none;
  user-select: none;
}

.battle-broadcast-icon:active {
  cursor: grabbing;
}

.battle-broadcast-icon__badge {
  position: absolute;
  top: -6px;
  right: -6px;
  display: grid;
  min-width: 22px;
  height: 22px;
  place-items: center;
  padding: 0 5px;
  border-radius: 999px;
  background: var(--mg-danger, #ff5f86);
  color: #fff;
  font-size: 0.7rem;
}

.battle-broadcast__sr-only {
  position: fixed;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}

@media (prefers-reduced-motion: reduce) {
  .battle-broadcast,
  .battle-broadcast-icon {
    scroll-behavior: auto;
  }
}
</style>
