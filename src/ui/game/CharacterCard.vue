<template>
  <div class="mg-character-card" :class="{ 'mg-character-card--expanded': expanded }">
    <!-- Loading state -->
    <div v-if="loading" class="mg-character-card__skeleton mg-skeleton-pulse" aria-busy="true">
      <div class="mg-character-card__skeleton-avatar"></div>
      <div class="mg-character-card__skeleton-lines">
        <div class="mg-character-card__skeleton-line"></div>
        <div class="mg-character-card__skeleton-line mg-character-card__skeleton-line--short"></div>
        <div class="mg-character-card__skeleton-line mg-character-card__skeleton-line--short"></div>
      </div>
    </div>
    <!-- Error state -->
    <div v-else-if="error || !vars" class="mg-character-card__error">
      <i class="fas fa-user-circle"></i>
      <span>角色信息暂不可用</span>
    </div>
    <!-- Normal state -->
    <template v-else>
      <div class="mg-character-card__body" @click="toggleExpanded">
        <!-- Avatar -->
        <div class="mg-character-card__avatar-wrap">
          <img
            v-if="avatarUrl && !imgError"
            :src="avatarUrl"
            :alt="displayName"
            class="mg-character-card__avatar"
            @error="imgError = true"
          />
          <div v-else class="mg-character-card__avatar-fallback">
            <i class="fas fa-user-circle"></i>
          </div>
        </div>
        <!-- Info area -->
        <div class="mg-character-card__info">
          <div class="mg-character-card__name">{{ displayName }}</div>
          <!-- Stat bars -->
          <div v-if="playerCombat" class="mg-character-card__bars">
            <div class="mg-character-card__bar">
              <span class="mg-character-card__bar-label">HP</span>
              <div class="mg-character-card__bar-track">
                <div
                  class="mg-character-card__bar-fill mg-character-card__bar-fill--hp"
                  :style="{ width: barPercent(playerCombat.hp.current, playerCombat.hp.max) }"
                ></div>
              </div>
              <span class="mg-character-card__bar-value">{{ playerCombat.hp.current }}/{{ playerCombat.hp.max }}</span>
            </div>
            <div class="mg-character-card__bar">
              <span class="mg-character-card__bar-label">MP</span>
              <div class="mg-character-card__bar-track">
                <div
                  class="mg-character-card__bar-fill mg-character-card__bar-fill--mp"
                  :style="{ width: barPercent(playerCombat.mp.current, playerCombat.mp.max) }"
                ></div>
              </div>
              <span class="mg-character-card__bar-value">{{ playerCombat.mp.current }}/{{ playerCombat.mp.max }}</span>
            </div>
          </div>
          <!-- Expand hint -->
          <span class="mg-character-card__toggle-hint">
            <i :class="expanded ? 'fas fa-chevron-up' : 'fas fa-chevron-down'"></i>
          </span>
        </div>
      </div>
      <!-- Expanded variable list -->
      <div v-if="expanded" class="mg-character-card__variables">
        <div
          v-for="variable in characterVariables"
          :key="variable.label"
          class="mg-character-card__variable"
          :title="variable.desc || variable.label"
        >
          <span class="mg-character-card__variable-label">{{ variable.label }}</span>
          <span class="mg-character-card__variable-value">{{ variable.value }}</span>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { useSessionStore } from "@/stores/sessionStore";
import { storeToRefs } from "pinia";
import type { VariableValueRecord } from "@/types/variables";

const sessionStore = useSessionStore();
const { snapshot: sessionSnapshot } = storeToRefs(sessionStore);

const loading = ref(true);
const error = ref(false);
const vars = ref<VariableValueRecord | null>(null);
const expanded = ref(false);
const imgError = ref(false);

const avatarImages = import.meta.glob("../../assets/avatars/normal/*.png", {
  eager: true,
  query: "?url",
  import: "default",
}) as Record<string, string>;

watch(
  () => sessionSnapshot.value?.sessionState,
  async () => {
    loading.value = true;
    error.value = false;
    imgError.value = false;
    try {
      const result = await sessionStore.getVariableSnapshot();
      vars.value = result;
      if (!result) error.value = true;
    } catch {
      error.value = true;
    } finally {
      loading.value = false;
    }
  },
  { immediate: true },
);

function barPercent(current: number, max: number): string {
  if (max <= 0) return "0%";
  return Math.min((current / max) * 100, 100) + "%";
}

const playerName = computed(() => vars.value?.root?.player?.profile?.name ?? "");
const playerCombat = computed(() => vars.value?.root?.player?.combat);

const matchingCharacter = computed(() => {
  const characters = vars.value?.root?.characters;
  const name = playerName.value;
  if (!characters || !name) return null;
  for (const [, charData] of Object.entries(characters)) {
    if (charData.displayName === name) return charData;
  }
  return null;
});

const avatarUrl = computed(() => {
  const name = matchingCharacter.value?.displayName || playerName.value;
  if (!name) return "";
  return avatarImages[`../../assets/avatars/normal/${name}.png`] ?? "";
});

const displayName = computed(() => matchingCharacter.value?.displayName || playerName.value || "角色");

function toggleExpanded() {
  expanded.value = !expanded.value;
}

const characterVariables = computed(() => {
  const char = matchingCharacter.value;
  const entries: { label: string; value: string; desc?: string }[] = [];

  if (char) {
    if (char.identity) entries.push({ label: "身份", value: char.identity, desc: "角色身份/职业" });
    if (char.relationshipTag) entries.push({ label: "关系", value: char.relationshipTag, desc: "与玩家的关系" });
    if (char.awakeningStatus) entries.push({ label: "觉醒", value: char.awakeningStatus, desc: "魔法少女觉醒状态" });
    if (char.currentState) entries.push({ label: "状态", value: char.currentState, desc: "当前状态描述" });
    if (char.inParty !== undefined) entries.push({ label: "在队", value: char.inParty ? "是" : "否", desc: "是否在队伍中" });
  }

  const combat = char?.combat || playerCombat.value;
  if (combat) {
    entries.push({ label: "等级", value: String(combat.level), desc: "当前等级" });
    entries.push({ label: "经验", value: String(combat.exp), desc: "当前经验值" });
    entries.push({ label: "攻击", value: String(combat.attack), desc: "攻击力" });
    entries.push({ label: "防御", value: String(combat.defense), desc: "防御力" });
    entries.push({ label: "敏捷", value: String(combat.agility), desc: "敏捷值" });
    entries.push({ label: "智力", value: String(combat.intelligence), desc: "智力值" });
  }

  return entries;
});
</script>

<style lang="scss" scoped>
.mg-character-card {
  border-radius: var(--mg-radius);
  background: var(--mg-bg-card);
  border: var(--mg-border-width, 2px) solid var(--mg-border, rgba(255, 255, 255, 0.1));
  overflow: hidden;
  transition: all var(--mg-transition-normal, 0.3s ease);
}

.mg-character-card--expanded {
  border-color: var(--mg-accent, #ff6b9d);
}

.mg-character-card__body {
  display: flex;
  gap: var(--mg-space-md, 12px);
  padding: var(--mg-space-md, 12px);
  cursor: pointer;
  user-select: none;
}

/* ── Avatar ── */
.mg-character-card__avatar-wrap {
  flex-shrink: 0;
  width: 76px;
  aspect-ratio: 2 / 3;
  border-radius: var(--mg-radius);
  overflow: hidden;
  background: var(--mg-bg-surface, rgba(255, 255, 255, 0.05));
}

.mg-character-card__avatar {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.mg-character-card__avatar-fallback {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;

  i {
    font-size: 2rem;
    color: var(--mg-text-secondary);
    opacity: 0.5;
  }
}

/* ── Info ── */
.mg-character-card__info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: var(--mg-space-xs, 6px);
}

.mg-character-card__name {
  font-family: var(--mg-font-heading);
  font-weight: 800;
  font-size: var(--mg-font-base, 1rem);
  color: var(--mg-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* ── Stat bars ── */
.mg-character-card__bars {
  display: flex;
  flex-direction: column;
  gap: var(--mg-space-xxs, 4px);
}

.mg-character-card__bar {
  display: flex;
  align-items: center;
  gap: var(--mg-space-xxs, 4px);
  font-size: 0.75rem;
}

.mg-character-card__bar-label {
  width: 24px;
  flex-shrink: 0;
  font-weight: 700;
  color: var(--mg-text-secondary);
}

.mg-character-card__bar-track {
  flex: 1;
  height: 8px;
  border-radius: 4px;
  background: var(--mg-bg-surface, rgba(255, 255, 255, 0.08));
  overflow: hidden;
}

.mg-character-card__bar-fill {
  height: 100%;
  border-radius: 4px;
  transition: width var(--mg-transition-normal, 0.3s ease);
}

.mg-character-card__bar-fill--hp {
  background: linear-gradient(90deg, #ff6b6b, #ee5a24);
}

.mg-character-card__bar-fill--mp {
  background: linear-gradient(90deg, #74b9ff, #0984e3);
}

.mg-character-card__bar-value {
  width: 56px;
  flex-shrink: 0;
  text-align: right;
  color: var(--mg-text-secondary);
  font-variant-numeric: tabular-nums;
}

/* ── Toggle hint ── */
.mg-character-card__toggle-hint {
  display: flex;
  justify-content: center;
  margin-top: auto;
  color: var(--mg-text-secondary);
  opacity: 0.5;
  font-size: 0.7rem;
}

/* ── Expanded variable list ── */
.mg-character-card__variables {
  border-top: var(--mg-border-width, 1px) solid var(--mg-border, rgba(255, 255, 255, 0.08));
  max-height: 240px;
  overflow-y: auto;
  overscroll-behavior: contain;
}

.mg-character-card__variable {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--mg-space-xs, 6px) var(--mg-space-md, 12px);
  font-size: var(--mg-font-sm, 0.85rem);
  transition: background var(--mg-transition-fast, 0.15s ease);

  &:hover {
    background: var(--mg-bg-surface, rgba(255, 255, 255, 0.04));
  }

  &:nth-child(even) {
    background: var(--mg-bg-surface, rgba(255, 255, 255, 0.02));
  }
}

.mg-character-card__variable-label {
  color: var(--mg-text-secondary);
  font-weight: 600;
}

.mg-character-card__variable-value {
  color: var(--mg-text);
  font-variant-numeric: tabular-nums;
  transition: color 0.3s, transform 0.2s;
  cursor: help;
}

/* ── Loading skeleton ── */
.mg-character-card__skeleton {
  display: flex;
  gap: var(--mg-space-md, 12px);
  padding: var(--mg-space-md, 12px);
  animation: mg-skeleton-pulse 1.5s ease-in-out infinite;
}

.mg-character-card__skeleton-avatar {
  width: 76px;
  aspect-ratio: 2 / 3;
  border-radius: var(--mg-radius);
  background: var(--mg-bg-surface, rgba(255, 255, 255, 0.08));
  flex-shrink: 0;
}

.mg-character-card__skeleton-lines {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: var(--mg-space-sm, 8px);
  padding-top: var(--mg-space-xs, 4px);
}

.mg-character-card__skeleton-line {
  height: 12px;
  border-radius: 6px;
  background: var(--mg-bg-surface, rgba(255, 255, 255, 0.08));
}

.mg-character-card__skeleton-line--short {
  width: 60%;
}

/* ── Error state ── */
.mg-character-card__error {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--mg-space-sm, 8px);
  padding: var(--mg-space-xl, 24px);
  color: var(--mg-text-secondary);
  font-size: var(--mg-font-sm, 0.85rem);

  i {
    font-size: 2.5rem;
    opacity: 0.4;
  }
}
</style>
