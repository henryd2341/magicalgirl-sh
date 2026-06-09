<script setup lang="ts">
import { getCharacterByName, getSkill } from "@/content/contentRegistry";
import { useSessionStore } from "@/stores/sessionStore";
import { computed, onMounted, ref, watch } from "vue";
import type { ResolvedSkillContent } from "@/types/content";

const props = defineProps<{
  characterId: string;
}>();

const sessionStore = useSessionStore();
const loading = ref(true);
const equipResult = ref<string | null>(null);

const INNATE_IDS = new Set(["0", "130"]); // Attack, Guard
const MAX_SLOTS = 8;

// ── Data ──

interface SkillEntry {
  skillId: string;
  name: string;
  category: string;
  mpCost: number;
  description: string;
}

const learnedSkills = ref<SkillEntry[]>([]);
const equippedIds = ref<Set<string>>(new Set());

onMounted(() => loadData());
watch(() => props.characterId, () => loadData());

async function loadData() {
  loading.value = true;
  equippedIds.value = new Set();
  learnedSkills.value = [];

  try {
    const varState = await sessionStore.getVariableSnapshot();
    if (!varState?.root) return;

    // Determine the learned skills key for this character
    const isPlayer = props.characterId === "__player__";
    const contentId = isPlayer ? "player" : props.characterId;

    // Get learned skills
    const allLearned = sessionStore.learnedSkills as unknown as Map<string, Set<string>>;
    let lsKey = contentId;
    // Try variable-state key (display name) if content ID doesn't work
    if (!allLearned.has(lsKey)) {
      try {
        const ch = getCharacterByName(props.characterId);
        if (allLearned.has(ch.id)) lsKey = ch.id;
      } catch { /* fall through */ }
    }
    const learnedSet = allLearned.get(lsKey) ?? new Set<string>();

    // Get equipped skills
    let equipped: string[] = [];
    if (isPlayer || props.characterId === "__player__") {
      equipped = varState.root.player.equippedSkills ?? [];
    } else {
      const charData = varState.root.characters[props.characterId];
      equipped = charData?.equippedSkills ?? [];
    }
    equippedIds.value = new Set(equipped.filter(id => !INNATE_IDS.has(id)));

    // Build skill entries
    const entries: SkillEntry[] = [];
    for (const skillId of learnedSet) {
      if (INNATE_IDS.has(skillId)) continue;
      try {
        const skill = getSkill(skillId);
        entries.push({
          skillId,
          name: skill.name,
          category: skill.category,
          mpCost: skill.mpCost ?? 0,
          description: skill.description,
        });
      } catch { /* skip unknown skills */ }
    }

    learnedSkills.value = entries.sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    // keep defaults
  } finally {
    loading.value = false;
  }
}

const equippedCount = computed(() => equippedIds.value.size);

const equippedList = computed(() =>
  learnedSkills.value.filter(s => equippedIds.value.has(s.skillId))
);

const availableList = computed(() =>
  learnedSkills.value.filter(s => !equippedIds.value.has(s.skillId))
);

// ── Actions ──

function getContentCharId(): string {
  return props.characterId === "__player__" ? "player" : props.characterId;
}

async function handleEquip(skillId: string) {
  if (equippedIds.value.size >= MAX_SLOTS) {
    equipResult.value = "技能栏已满（最多8个）";
    setTimeout(() => { equipResult.value = null; }, 2000);
    return;
  }
  const result = await sessionStore.equipSkill(getContentCharId(), skillId);
  if (result === "ok") {
    equippedIds.value = new Set([...equippedIds.value, skillId]);
  } else {
    const messages: Record<string, string> = {
      not_learned: "技能未学习",
      innate_skill: "固有技能无需装备",
      slots_full: "技能栏已满（最多8个）",
      already_equipped: "技能已装备",
    };
    equipResult.value = messages[result] ?? "装备失败";
    setTimeout(() => { equipResult.value = null; }, 2000);
  }
}

async function handleUnequip(skillId: string) {
  const result = await sessionStore.unequipSkill(getContentCharId(), skillId);
  if (result === "ok") {
    const next = new Set(equippedIds.value);
    next.delete(skillId);
    equippedIds.value = next;
  }
}

const CATEGORY_LABELS: Record<string, string> = {
  physical: "物理",
  magic: "魔法",
  heal: "回复",
  support: "辅助",
  passive: "被动",
};
</script>

<template>
  <div class="equip-tab">
    <!-- Toast -->
    <div v-if="equipResult" class="equip-tab__toast">{{ equipResult }}</div>

    <!-- Loading -->
    <div v-if="loading" class="equip-tab__loading">
      <i class="fas fa-spinner fa-spin"></i> 加载技能装备...
    </div>

    <template v-else>
      <!-- Header -->
      <div class="equip-tab__header">
        <span class="equip-tab__header-title">装备技能</span>
        <span
          class="equip-tab__header-count"
          :class="{ 'equip-tab__header-count--full': equippedCount >= MAX_SLOTS }"
        >
          {{ equippedCount }} / {{ MAX_SLOTS }}
        </span>
      </div>

      <!-- No learned skills -->
      <div v-if="learnedSkills.length === 0" class="equip-tab__empty">
        <i class="fas fa-book"></i>
        <p>该角色还没有学习任何技能</p>
        <p class="equip-tab__empty-hint">请先在「技能学习」中学习技能</p>
      </div>

      <div v-else class="equip-tab__layout">
        <!-- Equipped column -->
        <section class="equip-tab__col">
          <h4 class="equip-tab__col-title">
            <i class="fas fa-check-circle"></i> 已装备 ({{ equippedCount }}/{{ MAX_SLOTS }})
          </h4>
          <div v-if="equippedList.length === 0" class="equip-tab__col-empty">
            暂未装备技能
          </div>
          <div
            v-for="skill in equippedList"
            :key="skill.skillId"
            class="equip-tab__row equip-tab__row--equipped"
          >
            <div class="equip-tab__row-info">
              <span class="equip-tab__row-name">{{ skill.name }}</span>
              <span class="equip-tab__row-detail">
                <span class="equip-tab__row-cat">{{ CATEGORY_LABELS[skill.category] ?? skill.category }}</span>
                <span v-if="skill.mpCost > 0" class="equip-tab__row-mp">{{ skill.mpCost }} MP</span>
              </span>
            </div>
            <button class="equip-tab__row-btn equip-tab__row-btn--remove" @click="handleUnequip(skill.skillId)">
              <i class="fas fa-times"></i> 卸下
            </button>
          </div>
        </section>

        <!-- Available column -->
        <section class="equip-tab__col">
          <h4 class="equip-tab__col-title">
            <i class="fas fa-book"></i> 可装备
          </h4>
          <div v-if="availableList.length === 0" class="equip-tab__col-empty">
            所有技能已装备
          </div>
          <div
            v-for="skill in availableList"
            :key="skill.skillId"
            class="equip-tab__row"
          >
            <div class="equip-tab__row-info">
              <span class="equip-tab__row-name">{{ skill.name }}</span>
              <span class="equip-tab__row-detail">
                <span class="equip-tab__row-cat">{{ CATEGORY_LABELS[skill.category] ?? skill.category }}</span>
                <span v-if="skill.mpCost > 0" class="equip-tab__row-mp">{{ skill.mpCost }} MP</span>
              </span>
            </div>
            <button
              class="equip-tab__row-btn equip-tab__row-btn--add"
              :disabled="equippedCount >= MAX_SLOTS"
              @click="handleEquip(skill.skillId)"
            >
              <i class="fas fa-plus"></i> 装备
            </button>
          </div>
        </section>
      </div>
    </template>
  </div>
</template>

<style lang="scss" scoped>
.equip-tab {
  position: relative;
  min-height: 200px;
}

.equip-tab__toast {
  position: absolute;
  top: 0;
  left: 50%;
  transform: translateX(-50%);
  z-index: 10;
  padding: 6px 16px;
  border-radius: var(--mg-radius-pill);
  background: var(--mg-accent);
  color: var(--mg-ink-outline);
  font-weight: 700;
  font-size: 0.85rem;
  white-space: nowrap;
}

.equip-tab__loading,
.equip-tab__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--mg-space-sm);
  padding: var(--mg-space-2xl);
  color: var(--mg-text-secondary);
  text-align: center;

  i { font-size: 2rem; opacity: 0.4; }
}

.equip-tab__empty-hint {
  font-size: 0.78rem;
  opacity: 0.6;
}

// ── Header ──
.equip-tab__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--mg-space-md);
}

.equip-tab__header-title {
  font-family: var(--mg-font-heading);
  font-weight: 700;
  font-size: 0.95rem;
}

.equip-tab__header-count {
  font-size: 0.85rem;
  font-weight: 700;
  color: var(--mg-success);
  font-variant-numeric: tabular-nums;

  &--full { color: var(--mg-warning); }
}

// ── Two-column layout ──
.equip-tab__layout {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--mg-space-md);
  align-items: start;
}

.equip-tab__col {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.equip-tab__col-title {
  margin: 0 0 4px;
  font-family: var(--mg-font-heading);
  font-size: 0.78rem;
  color: var(--mg-text-secondary);
  display: flex;
  align-items: center;
  gap: 4px;

  i { font-size: 0.7rem; }
}

.equip-tab__col-empty {
  padding: var(--mg-space-lg);
  text-align: center;
  font-size: 0.78rem;
  color: var(--mg-text-muted);
  border: 1px dashed var(--mg-border);
  border-radius: var(--mg-radius);
}

// ── Skill row ──
.equip-tab__row {
  display: flex;
  align-items: center;
  gap: var(--mg-space-sm);
  padding: 6px 10px;
  border: var(--mg-border-width) solid var(--mg-border);
  border-radius: var(--mg-radius);
  background: var(--mg-bg-card);
  font-size: 0.8rem;
  transition: border-color var(--mg-transition-fast);

  &--equipped {
    border-color: var(--mg-success);
    background: rgba(100,220,100,0.05);
  }
}

.equip-tab__row-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}

.equip-tab__row-name {
  font-weight: 700;
  font-size: 0.82rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.equip-tab__row-detail {
  display: flex;
  gap: 6px;
  font-size: 0.68rem;
}

.equip-tab__row-cat {
  color: var(--mg-text-secondary);
}

.equip-tab__row-mp {
  color: var(--mg-accent);
  font-weight: 600;
}

.equip-tab__row-btn {
  flex-shrink: 0;
  padding: 3px 10px;
  border-radius: var(--mg-radius-pill);
  border: 1px solid var(--mg-border);
  background: var(--mg-bg-card);
  cursor: pointer;
  font-size: 0.7rem;
  font-weight: 600;
  white-space: nowrap;
  transition: all var(--mg-transition-fast);

  &:disabled {
    opacity: 0.35;
    cursor: not-allowed;
  }

  &--add {
    border-color: var(--mg-accent);
    color: var(--mg-accent);
    &:hover:not(:disabled) { background: var(--mg-surface-pink); }
  }

  &--remove {
    border-color: var(--mg-border-strong);
    color: var(--mg-text-muted);
    &:hover { border-color: var(--mg-accent-strong); color: var(--mg-accent-strong); }
  }
}
</style>
