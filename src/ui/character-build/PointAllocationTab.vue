<script setup lang="ts">
import { getCharacterByName, getGrowth } from "@/content/contentRegistry";
import { statsAtLevel } from "@/engine/battle/formulaEngine";
import { useSessionStore } from "@/stores/sessionStore";
import { computed, onMounted, ref, watch } from "vue";
import type { VariableValueRecord } from "@/types/variables";

const props = defineProps<{
  characterId: string;
}>();

const sessionStore = useSessionStore();

const vars = ref<VariableValueRecord | null>(null);
const loading = ref(true);
const isDirty = ref(false);
const confirmMsg = ref<string | null>(null);

// Mutated directly in memory before confirm
const localAllocated = ref({ attack: 0, defense: 0, agility: 0, intelligence: 0 });
const localUnspent = ref(0);

// ── Load data ──

onMounted(() => loadState());

async function loadState() {
  loading.value = true;
  try {
    const result = await sessionStore.getVariableSnapshot();
    vars.value = result;
    readFromVars(result);
  } catch {
    // keep defaults
  } finally {
    loading.value = false;
    isDirty.value = false;
  }
}

function readFromVars(varState: VariableValueRecord | null) {
  if (!varState?.root) return;
  const isPlayer = getIsPlayer(varState);
  let alloc: { attack: number; defense: number; agility: number; intelligence: number } | undefined;
  let unspent: number | undefined;

  if (isPlayer) {
    alloc = varState.root.player.combat.allocatedPoints;
    unspent = varState.root.player.combat.unspentPoints;
  } else {
    const charData = varState.root.characters[props.characterId];
    alloc = charData?.combat?.allocatedPoints;
    unspent = charData?.combat?.unspentPoints;
  }

  localAllocated.value = {
    attack: alloc?.attack ?? 0,
    defense: alloc?.defense ?? 0,
    agility: alloc?.agility ?? 0,
    intelligence: alloc?.intelligence ?? 0,
  };
  localUnspent.value = unspent ?? 0;
}

function getIsPlayer(varState?: VariableValueRecord | null): boolean {
  if (props.characterId === "__player__") return true;
  const vs = varState ?? vars.value;
  if (!vs?.root) return false;
  const charData = vs.root.characters[props.characterId];
  return charData?.displayName === vs.root.player?.profile?.name;
}

const isPlayer = computed(() => getIsPlayer());

// ── Growth & level ──

const growthData = computed(() => {
  try {
    const growthId = props.characterId === "__player__"
      ? "player"
      : getCharacterByName(props.characterId).growthId;
    return getGrowth(growthId);
  } catch {
    return null;
  }
});

const currentLevel = computed(() => {
  const vs = vars.value;
  if (!vs?.root) return 1;
  if (isPlayer.value) return vs.root.player.combat.level;
  const charData = vs.root.characters[props.characterId];
  return charData?.combat?.level ?? 1;
});

const totalEarnedPoints = computed(() => {
  if (!growthData.value) return 0;
  return Math.max(0, (currentLevel.value - 1)) * (growthData.value.perLevel.freePoints ?? 0);
});

const baseStats = computed(() => {
  if (!growthData.value) return null;
  return statsAtLevel(growthData.value.base, growthData.value.perLevel, currentLevel.value);
});

const totalStats = computed(() => {
  if (!baseStats.value) return null;
  return {
    attack: baseStats.value.attack + localAllocated.value.attack,
    defense: baseStats.value.defense + localAllocated.value.defense,
    agility: baseStats.value.agility + localAllocated.value.agility,
    intelligence: baseStats.value.intelligence + localAllocated.value.intelligence,
  };
});

// ── Actions ──

function adjustStat(stat: "attack" | "defense" | "agility" | "intelligence", delta: number) {
  const current = localAllocated.value[stat];
  if (delta > 0 && localUnspent.value <= 0) return; // No points left
  if (delta < 0 && current <= 0) return; // Can't go below 0
  if (delta < 0 && current + delta < 0) return;

  localAllocated.value = { ...localAllocated.value, [stat]: current + delta };
  localUnspent.value -= delta;
  isDirty.value = true;
}

async function confirmAllocation() {
  const charId = isPlayer.value ? null : props.characterId;
  await sessionStore.allocatePoints(charId, localAllocated.value, localUnspent.value);
  isDirty.value = false;
  confirmMsg.value = "点数分配已保存";
  setTimeout(() => { confirmMsg.value = null; }, 2000);
}

function resetAllocation() {
  localAllocated.value = { attack: 0, defense: 0, agility: 0, intelligence: 0 };
  localUnspent.value = totalEarnedPoints.value;
  isDirty.value = true;
}

// Re-read when characterId changes
watch(() => props.characterId, () => loadState());
</script>

<template>
  <div class="points-tab">
    <!-- Confirm toast -->
    <div v-if="confirmMsg" class="points-tab__toast">{{ confirmMsg }}</div>

    <div v-if="loading" class="points-tab__loading">
      <i class="fas fa-spinner fa-spin"></i> 加载中...
    </div>

    <div v-else-if="!growthData" class="points-tab__empty">
      <i class="fas fa-exclamation-triangle"></i> 未找到角色成长数据
    </div>

    <div v-else class="points-tab__content">
      <!-- Header -->
      <div class="points-tab__header">
        <div class="points-tab__info">
          <span class="points-tab__level">Lv.{{ currentLevel }}</span>
          <span class="points-tab__points">
            可用点数: <strong>{{ localUnspent }}</strong> /
            {{ totalEarnedPoints }}
          </span>
        </div>
      </div>

      <!-- Stat rows -->
      <div class="points-tab__stats">
        <div class="points-tab__stat-row">
          <span class="points-tab__stat-label">攻击</span>
          <div class="points-tab__stat-values">
            <span class="points-tab__stat-base">{{ baseStats?.attack ?? 0 }}</span>
            <span class="points-tab__stat-plus">+</span>
            <span class="points-tab__stat-alloc">{{ localAllocated.attack }}</span>
            <span class="points-tab__stat-eq">=</span>
            <span class="points-tab__stat-total">{{ totalStats?.attack ?? 0 }}</span>
          </div>
          <div class="points-tab__stat-actions">
            <button
              class="points-tab__btn points-tab__btn--minus"
              :disabled="localAllocated.attack <= 0"
              @click="adjustStat('attack', -1)"
            >-</button>
            <button
              class="points-tab__btn points-tab__btn--plus"
              :disabled="localUnspent <= 0"
              @click="adjustStat('attack', 1)"
            >+</button>
          </div>
        </div>

        <div class="points-tab__stat-row">
          <span class="points-tab__stat-label">防御</span>
          <div class="points-tab__stat-values">
            <span class="points-tab__stat-base">{{ baseStats?.defense ?? 0 }}</span>
            <span class="points-tab__stat-plus">+</span>
            <span class="points-tab__stat-alloc">{{ localAllocated.defense }}</span>
            <span class="points-tab__stat-eq">=</span>
            <span class="points-tab__stat-total">{{ totalStats?.defense ?? 0 }}</span>
          </div>
          <div class="points-tab__stat-actions">
            <button
              class="points-tab__btn points-tab__btn--minus"
              :disabled="localAllocated.defense <= 0"
              @click="adjustStat('defense', -1)"
            >-</button>
            <button
              class="points-tab__btn points-tab__btn--plus"
              :disabled="localUnspent <= 0"
              @click="adjustStat('defense', 1)"
            >+</button>
          </div>
        </div>

        <div class="points-tab__stat-row">
          <span class="points-tab__stat-label">敏捷</span>
          <div class="points-tab__stat-values">
            <span class="points-tab__stat-base">{{ baseStats?.agility ?? 0 }}</span>
            <span class="points-tab__stat-plus">+</span>
            <span class="points-tab__stat-alloc">{{ localAllocated.agility }}</span>
            <span class="points-tab__stat-eq">=</span>
            <span class="points-tab__stat-total">{{ totalStats?.agility ?? 0 }}</span>
          </div>
          <div class="points-tab__stat-actions">
            <button
              class="points-tab__btn points-tab__btn--minus"
              :disabled="localAllocated.agility <= 0"
              @click="adjustStat('agility', -1)"
            >-</button>
            <button
              class="points-tab__btn points-tab__btn--plus"
              :disabled="localUnspent <= 0"
              @click="adjustStat('agility', 1)"
            >+</button>
          </div>
        </div>

        <div class="points-tab__stat-row">
          <span class="points-tab__stat-label">智力</span>
          <div class="points-tab__stat-values">
            <span class="points-tab__stat-base">{{ baseStats?.intelligence ?? 0 }}</span>
            <span class="points-tab__stat-plus">+</span>
            <span class="points-tab__stat-alloc">{{ localAllocated.intelligence }}</span>
            <span class="points-tab__stat-eq">=</span>
            <span class="points-tab__stat-total">{{ totalStats?.intelligence ?? 0 }}</span>
          </div>
          <div class="points-tab__stat-actions">
            <button
              class="points-tab__btn points-tab__btn--minus"
              :disabled="localAllocated.intelligence <= 0"
              @click="adjustStat('intelligence', -1)"
            >-</button>
            <button
              class="points-tab__btn points-tab__btn--plus"
              :disabled="localUnspent <= 0"
              @click="adjustStat('intelligence', 1)"
            >+</button>
          </div>
        </div>
      </div>

      <!-- HP/MP preview -->
      <div class="points-tab__preview">
        <span class="points-tab__preview-label">HP {{ baseStats?.hp.current ?? 0 }} / MP {{ baseStats?.mp.current ?? 0 }}</span>
      </div>

      <!-- Actions -->
      <div class="points-tab__actions">
        <button
          class="points-tab__btn points-tab__btn--confirm"
          :disabled="!isDirty"
          @click="confirmAllocation"
        >
          <i class="fas fa-check"></i> 确认分配
        </button>
        <button
          class="points-tab__btn points-tab__btn--reset"
          :disabled="!isDirty"
          @click="resetAllocation"
        >
          <i class="fas fa-undo"></i> 重置
        </button>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.points-tab {
  position: relative;
}

.points-tab__toast {
  position: absolute;
  top: 0;
  left: 50%;
  transform: translateX(-50%);
  z-index: 10;
  padding: 6px 16px;
  border-radius: var(--mg-radius-pill);
  background: var(--mg-success);
  color: var(--mg-ink-outline);
  font-weight: 700;
  font-size: 0.85rem;
  white-space: nowrap;
  animation: points-toast-in 0.2s ease;
}

@keyframes points-toast-in {
  from { opacity: 0; transform: translateX(-50%) translateY(-8px); }
  to   { opacity: 1; transform: translateX(-50%) translateY(0); }
}

.points-tab__loading,
.points-tab__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--mg-space-sm);
  padding: var(--mg-space-2xl);
  color: var(--mg-text-secondary);
  i { font-size: 2rem; opacity: 0.4; }
}

.points-tab__content {
  display: flex;
  flex-direction: column;
  gap: var(--mg-space-lg);
}

.points-tab__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.points-tab__info {
  display: flex;
  align-items: center;
  gap: var(--mg-space-lg);
}

.points-tab__level {
  font-family: var(--mg-font-heading);
  font-weight: 800;
  font-size: 1.2rem;
  color: var(--mg-accent);
}

.points-tab__points {
  font-size: 0.9rem;
  color: var(--mg-text-secondary);

  strong {
    color: var(--mg-text);
    font-variant-numeric: tabular-nums;
  }
}

.points-tab__stats {
  display: flex;
  flex-direction: column;
  gap: var(--mg-space-sm);
}

.points-tab__stat-row {
  display: flex;
  align-items: center;
  gap: var(--mg-space-md);
  padding: var(--mg-space-sm) var(--mg-space-md);
  border: var(--mg-border-width) solid var(--mg-border);
  border-radius: var(--mg-radius);
  background: var(--mg-bg-card);
  transition: border-color var(--mg-transition-fast);

  &:hover {
    border-color: var(--mg-accent-subtle);
  }
}

.points-tab__stat-label {
  width: 60px;
  font-weight: 700;
  font-size: 0.9rem;
  color: var(--mg-text);
}

.points-tab__stat-values {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 6px;
  font-variant-numeric: tabular-nums;
}

.points-tab__stat-base {
  min-width: 28px;
  text-align: right;
  color: var(--mg-text-secondary);
}

.points-tab__stat-plus,
.points-tab__stat-eq {
  color: var(--mg-text-muted);
  font-size: 0.8rem;
}

.points-tab__stat-alloc {
  min-width: 24px;
  text-align: right;
  color: var(--mg-accent);
  font-weight: 700;
}

.points-tab__stat-total {
  min-width: 28px;
  text-align: right;
  font-weight: 700;
  color: var(--mg-text);
}

.points-tab__stat-actions {
  display: flex;
  gap: 4px;
}

.points-tab__btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: var(--mg-border-width) solid var(--mg-border);
  border-radius: var(--mg-radius);
  background: var(--mg-bg-card);
  color: var(--mg-text);
  cursor: pointer;
  font-size: 1rem;
  font-weight: 700;
  transition: all var(--mg-transition-fast);

  &:hover:not(:disabled) {
    border-color: var(--mg-accent);
    background: var(--mg-surface-pink);
  }

  &:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }

  &--plus {
    color: var(--mg-success);
    &:hover:not(:disabled) { border-color: var(--mg-success); background: rgba(100, 220, 100, 0.08); }
  }

  &--minus {
    color: var(--mg-accent-strong);
    &:hover:not(:disabled) { border-color: var(--mg-accent-strong); background: rgba(255, 100, 100, 0.08); }
  }

  &--confirm,
  &--reset {
    width: auto;
    padding: 0 var(--mg-space-lg);
    gap: 6px;
    font-size: 0.85rem;
    min-height: 36px;
  }

  &--confirm {
    border-color: var(--mg-success);
    color: var(--mg-success);
    background: linear-gradient(135deg, var(--mg-bg-card) 0%, rgba(100, 220, 100, 0.06) 100%);
    &:hover:not(:disabled) { box-shadow: 0 0 6px rgba(100, 220, 100, 0.3); }
  }

  &--reset {
    border-color: var(--mg-warning);
    color: var(--mg-warning);
    &:hover:not(:disabled) { box-shadow: 0 0 6px rgba(255, 190, 92, 0.3); }
  }
}

.points-tab__preview {
  text-align: center;
  font-size: 0.8rem;
  color: var(--mg-text-muted);
}

.points-tab__actions {
  display: flex;
  gap: var(--mg-space-sm);
  justify-content: center;
  margin-top: var(--mg-space-sm);
}
</style>
