<script setup lang="ts">
import { computed, ref, watch } from "vue";
import type { InPartyCharacter } from "@/stores/formationStore";

const props = withDefaults(
  defineProps<{
    visible: boolean;
    inPartyCharacters: InPartyCharacter[];
  }>(),
  {
    inPartyCharacters: () => [],
  },
);

const emit = defineEmits<{
  close: [];
  save: [vanguardIds: string[], reserveIds: string[]];
}>();

// ── Local editing state ──
const localVanguard = ref<InPartyCharacter[]>([]);
const localReserve = ref<InPartyCharacter[]>([]);

watch(
  () => props.inPartyCharacters,
  (chars) => {
    const playerChar = chars.find((c) => c.isPlayer);
    const others = chars.filter((c) => !c.isPlayer);

    // Vanguard: protagonist first, then non-player vanguard chars
    const vanguard: InPartyCharacter[] = [];
    if (playerChar) vanguard.push(playerChar);
    vanguard.push(...others.filter((c) => c.isVanguard));

    // Reserve: non-player non-vanguard chars
    const reserve = others.filter((c) => !c.isVanguard);

    localVanguard.value = vanguard;
    localReserve.value = reserve;
  },
  { immediate: true },
);

const protagonist = computed(() => localVanguard.value[0] ?? null);
const vanguardRemovable = computed(() => localVanguard.value.slice(1));
const hasSpaceInVanguard = computed(() => localVanguard.value.length < 4);

function moveToReserve(charId: string) {
  const char = localVanguard.value.find((c) => c.id === charId);
  if (!char || char.isPlayer) return;
  localVanguard.value = localVanguard.value.filter((c) => c.id !== charId);
  localReserve.value = [...localReserve.value, { ...char, isVanguard: false }];
}

function moveToVanguard(charId: string) {
  if (!hasSpaceInVanguard.value) return;
  const char = localReserve.value.find((c) => c.id === charId);
  if (!char) return;
  localReserve.value = localReserve.value.filter((c) => c.id !== charId);
  localVanguard.value = [
    ...localVanguard.value,
    { ...char, isVanguard: true },
  ];
}

function moveUp(index: number) {
  if (index <= 1 || index >= localVanguard.value.length) return;
  const arr = [...localVanguard.value];
  [arr[index - 1], arr[index]] = [arr[index], arr[index - 1]];
  localVanguard.value = arr;
}

function moveDown(index: number) {
  if (index < 1 || index >= localVanguard.value.length - 1) return;
  const arr = [...localVanguard.value];
  [arr[index], arr[index + 1]] = [arr[index + 1], arr[index]];
  localVanguard.value = arr;
}

function handleClose() {
  emit("close");
}

function handleSave() {
  const vanguardIds = localVanguard.value.map((c) => c.id);
  const reserveIds = localReserve.value.map((c) => c.id);
  emit("save", vanguardIds, reserveIds);
}

</script>

<template>
  <div
    v-if="visible"
    class="mg-modal-overlay"
    @click.self="handleClose"
  >
    <div class="mg-modal-card formation-modal">
      <button class="mg-modal__close" @click="handleClose">
        <i class="fas fa-times"></i>
      </button>
      <h2 class="mg-modal__title">
        <i class="fas fa-users"></i> 队伍编组
      </h2>

      <div class="mg-modal__body mg-scroll formation-modal__body">
        <!-- ── Vanguard Zone ── -->
        <section class="formation-zone" aria-label="前锋区域">
          <h3 class="formation-zone__title">
            <i class="fas fa-shield-alt"></i> 前锋 ({{ localVanguard.length }}/4)
          </h3>
          <div class="formation-zone__slots">
            <!-- Slot 1: protagonist (fixed) -->
            <div
              class="formation-slot formation-slot--protagonist"
              :class="{ 'formation-slot--empty': !protagonist }"
            >
              <template v-if="protagonist">
                <span class="formation-slot__icon">
                  <i class="fas fa-crown"></i>
                </span>
                <span class="formation-slot__label">主角</span>
                <span class="formation-slot__name">{{ protagonist.displayName }}</span>
                <span class="formation-slot__locked">
                  <i class="fas fa-lock"></i>
                </span>
              </template>
              <template v-else>
                <span class="formation-slot__empty-label">空</span>
              </template>
            </div>

            <!-- Slots 2-4: sortable vanguard -->
            <div
              v-for="(character, index) in vanguardRemovable"
              :key="character.id"
              class="formation-slot formation-slot--movable"
            >
              <span class="formation-slot__index">{{ index + 2 }}</span>
              <span class="formation-slot__name">{{ character.displayName }}</span>
              <div class="formation-slot__actions">
                <button
                  type="button"
                  class="formation-slot__btn formation-slot__btn--up"
                  :disabled="index === 0"
                  :title="index > 0 ? '上移' : '已是最前'"
                  @click="moveUp(index + 1)"
                >
                  <i class="fas fa-chevron-up"></i>
                </button>
                <button
                  type="button"
                  class="formation-slot__btn formation-slot__btn--down"
                  :disabled="index === vanguardRemovable.length - 1"
                  :title="index < vanguardRemovable.length - 1 ? '下移' : '已是最后'"
                  @click="moveDown(index + 1)"
                >
                  <i class="fas fa-chevron-down"></i>
                </button>
                <button
                  type="button"
                  class="formation-slot__btn formation-slot__btn--remove"
                  title="移入后备"
                  @click="moveToReserve(character.id)"
                >
                  <i class="fas fa-arrow-right"></i>
                </button>
              </div>
            </div>

            <!-- Empty fill slots -->
            <div
              v-for="n in Math.max(0, 3 - localVanguard.length + 1)"
              :key="'empty-' + n"
              class="formation-slot formation-slot--empty"
            >
              <span class="formation-slot__empty-label">空</span>
            </div>
          </div>
        </section>

        <!-- ── Reserve Zone ── -->
        <section class="formation-zone" aria-label="后备区域">
          <h3 class="formation-zone__title">
            <i class="fas fa-box"></i> 后备 ({{ localReserve.length }})
          </h3>
          <div class="formation-zone__reserve">
            <div
              v-for="character in localReserve"
              :key="character.id"
              class="formation-reserve-card"
            >
              <span class="formation-reserve-card__name">
                {{ character.displayName }}
              </span>
              <button
                type="button"
                class="formation-reserve-card__add"
                :disabled="!hasSpaceInVanguard"
                :title="
                  hasSpaceInVanguard ? '移入前锋' : '前锋已满'
                "
                @click="moveToVanguard(character.id)"
              >
                <i class="fas fa-arrow-left"></i>
              </button>
            </div>
            <div
              v-if="localReserve.length === 0"
              class="formation-zone__empty"
            >
              后备为空
            </div>
          </div>
        </section>
      </div>

      <!-- ── Footer actions ── -->
      <div class="formation-modal__footer">
        <button
          type="button"
          class="mg-btn mg-btn--sm mg-btn--ghost"
          @click="handleClose"
        >
          取消
        </button>
        <button
          type="button"
          class="mg-btn mg-btn--sm mg-btn--primary"
          @click="handleSave"
        >
          保存编队
        </button>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.formation-modal {
  max-width: 520px;
  max-height: 85vh;
  display: flex;
  flex-direction: column;
}

.formation-modal__body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: var(--mg-space-lg, 16px);
}

.formation-modal__footer {
  display: flex;
  justify-content: flex-end;
  gap: var(--mg-space-sm, 8px);
  padding: var(--mg-space-md, 12px);
  border-top: var(--mg-border-width, 1px) solid var(--mg-border, rgba(255, 255, 255, 0.08));
}

// ── Zone headers ──
.formation-zone__title {
  font-family: var(--mg-font-heading);
  font-size: 0.95rem;
  font-weight: 700;
  color: var(--mg-text);
  margin: 0 0 var(--mg-space-sm, 8px);

  i {
    color: var(--mg-accent, #ff6b9d);
    margin-right: 6px;
  }
}

// ── Vanguard slots ──
.formation-zone__slots {
  display: flex;
  flex-direction: column;
  gap: var(--mg-space-xs, 6px);
}

.formation-slot {
  display: flex;
  align-items: center;
  gap: var(--mg-space-sm, 8px);
  padding: var(--mg-space-sm, 8px) var(--mg-space-md, 12px);
  border-radius: var(--mg-radius, 8px);
  background: var(--mg-bg-card);
  border: var(--mg-border-width, 2px) solid var(--mg-border, rgba(255, 255, 255, 0.1));
  transition: border-color var(--mg-transition-fast, 0.15s ease), box-shadow var(--mg-transition-fast, 0.15s ease);
}

.formation-slot--protagonist {
  border-color: var(--mg-accent, #ff6b9d);
  background: var(--mg-surface-pink, rgba(255, 107, 157, 0.08));
  box-shadow: var(--mg-glow-pink, 0 0 6px rgba(255, 107, 157, 0.3));
}

.formation-slot--movable:hover {
  border-color: var(--mg-accent, #ff6b9d);
  box-shadow: var(--mg-glow-pink, 0 0 6px rgba(255, 107, 157, 0.15));
}

.formation-slot--empty {
  opacity: 0.35;
  justify-content: center;
  border-style: dashed;
}

.formation-slot__icon {
  font-size: 0.9rem;
  color: var(--mg-accent, #ff6b9d);
}

.formation-slot__label {
  font-size: 0.75rem;
  font-weight: 700;
  color: var(--mg-accent-strong, #e0558a);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.formation-slot__name {
  flex: 1;
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--mg-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.formation-slot__locked {
  font-size: 0.75rem;
  color: var(--mg-text-muted, rgba(255, 255, 255, 0.35));
}

.formation-slot__index {
  width: 20px;
  text-align: center;
  font-size: 0.75rem;
  font-weight: 700;
  color: var(--mg-text-secondary);
}

.formation-slot__actions {
  display: flex;
  gap: 2px;
  flex-shrink: 0;
}

.formation-slot__btn {
  width: 24px;
  height: 24px;
  border: none;
  border-radius: var(--mg-radius-sm, 4px);
  background: transparent;
  color: var(--mg-text-secondary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.7rem;
  transition: all var(--mg-transition-fast, 0.15s ease);

  &:hover:not(:disabled) {
    color: var(--mg-accent, #ff6b9d);
    background: var(--mg-bg-surface, rgba(255, 255, 255, 0.06));
  }

  &:disabled {
    opacity: 0.25;
    cursor: not-allowed;
  }
}

.formation-slot__btn--remove {
  margin-left: 2px;
  &:hover:not(:disabled) {
    color: #ff6b6b;
  }
}

// ── Reserve zone ──
.formation-zone__reserve {
  display: flex;
  flex-direction: column;
  gap: var(--mg-space-xs, 6px);
}

.formation-reserve-card {
  display: flex;
  align-items: center;
  gap: var(--mg-space-sm, 8px);
  padding: var(--mg-space-sm, 8px) var(--mg-space-md, 12px);
  border-radius: var(--mg-radius, 8px);
  background: var(--mg-bg-card);
  border: var(--mg-border-width, 2px) solid var(--mg-border, rgba(255, 255, 255, 0.1));
  transition: border-color var(--mg-transition-fast, 0.15s ease);

  &:hover {
    border-color: var(--mg-accent, #ff6b9d);
  }
}

.formation-reserve-card__name {
  flex: 1;
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--mg-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.formation-reserve-card__add {
  width: 28px;
  height: 28px;
  border: none;
  border-radius: var(--mg-radius-sm, 4px);
  background: var(--mg-bg-surface, rgba(255, 255, 255, 0.06));
  color: var(--mg-accent, #ff6b9d);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.75rem;
  transition: all var(--mg-transition-fast, 0.15s ease);

  &:hover:not(:disabled) {
    background: var(--mg-accent, #ff6b9d);
    color: #fff;
  }

  &:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }
}

.formation-zone__empty {
  text-align: center;
  padding: var(--mg-space-md, 12px);
  color: var(--mg-text-secondary);
  font-size: 0.85rem;
  opacity: 0.5;
}

// ── Mobile touch targets ──
@media (max-width: 639px) {
  .formation-slot__btn {
    width: 36px;
    height: 36px;
    font-size: 0.85rem;
  }

  .formation-reserve-card__add {
    width: 36px;
    height: 36px;
    font-size: 0.85rem;
  }

  .formation-slot__name {
    font-size: 0.8rem;
  }
}
</style>
