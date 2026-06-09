<script setup lang="ts">
import { useSessionStore } from "@/stores/sessionStore";
import { getCharacter, getAllCharacterIds } from "@/content/contentRegistry";
import SkillTreeTab from "@/ui/character-build/SkillTreeTab.vue";
import PointAllocationTab from "@/ui/character-build/PointAllocationTab.vue";
import EquipSkillsTab from "@/ui/character-build/EquipSkillsTab.vue";
import { storeToRefs } from "pinia";
import { computed, onMounted, ref } from "vue";
import type { VariableValueRecord } from "@/types/variables";

const props = withDefaults(defineProps<{
  asModal?: boolean;
}>(), {
  asModal: true,
});

const emit = defineEmits<{
  close: [];
}>();

const sessionStore = useSessionStore();
const { snapshot } = storeToRefs(sessionStore);

const vars = ref<VariableValueRecord | null>(null);
const loading = ref(true);
const error = ref(false);
const activeTab = ref<"skill" | "points" | "equip">("skill");
const selectedCharacterId = ref<string | null>(null);

onMounted(async () => {
  try {
    const result = await sessionStore.getVariableSnapshot();
    vars.value = result;
    if (!result) error.value = true;
    // Auto-select first in-party character
    const firstInParty = getInPartyCharacterIds(result);
    if (firstInParty.length > 0) {
      selectedCharacterId.value = firstInParty[0];
    }
  } catch {
    error.value = true;
  } finally {
    loading.value = false;
  }
});

const PRO = "__player__";

function getInPartyCharacterIds(varState: VariableValueRecord | null): string[] {
  if (!varState?.root) return [PRO];
  const ids: string[] = [PRO];
  if (varState.root.characters) {
    for (const [charId, charData] of Object.entries(varState.root.characters)) {
      if (charData.inParty) {
        ids.push(charId);
      }
    }
  }
  return ids;
}

const inPartyCharacters = computed(() => {
  const chars: { charId: string; displayName: string; isPlayer: boolean; level: number }[] = [];

  // Protagonist (always present)
  const playerCombat = vars.value?.root?.player?.combat;
  const playerName = vars.value?.root?.player?.profile?.name || "主角";
  chars.push({
    charId: PRO,
    displayName: playerName,
    isPlayer: true,
    level: playerCombat?.level ?? 1,
  });

  // Companion characters (inParty)
  if (vars.value?.root?.characters) {
    for (const [charId, charData] of Object.entries(vars.value.root.characters)) {
      if (!charData.inParty) continue;
      chars.push({
        charId,
        displayName: charData.displayName ?? "???",
        isPlayer: false,
        level: charData.combat?.level ?? 1,
      });
    }
  }

  return chars;
});

const selectedCharacterName = computed(() => {
  const found = inPartyCharacters.value.find(c => c.charId === selectedCharacterId.value);
  return found?.displayName ?? "";
});

function selectCharacter(charId: string) {
  selectedCharacterId.value = charId;
}

function close() {
  emit("close");
}
</script>

<template>
  <div v-if="asModal" class="mg-modal-overlay" @click.self="close">
    <div class="character-build-modal mg-modal-card mg-modal-card--wide">
      <button class="mg-modal__close" @click="close">
        <i class="fas fa-times"></i>
      </button>
      <h2 class="mg-modal__title">角色Build</h2>

      <!-- Loading -->
      <div v-if="loading" class="character-build__loading">
        <i class="fas fa-spinner fa-spin"></i> 加载中...
      </div>

      <!-- Error -->
      <div v-else-if="error" class="character-build__error">
        <i class="fas fa-exclamation-triangle"></i> 角色信息加载失败
      </div>

      <!-- Content -->
      <div v-else class="character-build__layout">
        <!-- Left: Character list -->
        <aside class="character-build__sidebar">
          <h3 class="character-build__sidebar-title">队伍成员</h3>
          <div class="character-build__char-list mg-scroll">
            <button
              v-for="char in inPartyCharacters"
              :key="char.charId"
              class="character-build__char-btn"
              :class="{ 'character-build__char-btn--active': selectedCharacterId === char.charId }"
              @click="selectCharacter(char.charId)"
            >
              <span class="character-build__char-name">{{ char.displayName }}</span>
              <span class="character-build__char-level">LV {{ char.level }}</span>
            </button>
          </div>
        </aside>

        <!-- Right: Tabs + Content -->
        <div class="character-build__main" v-if="selectedCharacterId">
          <div class="character-build__tabs">
            <button
              class="character-build__tab"
              :class="{ 'character-build__tab--active': activeTab === 'skill' }"
              @click="activeTab = 'skill'"
            >
              <i class="fas fa-book"></i> 技能学习
            </button>
            <button
              class="character-build__tab"
              :class="{ 'character-build__tab--active': activeTab === 'points' }"
              @click="activeTab = 'points'"
            >
              <i class="fas fa-plus-circle"></i> 点数分配
            </button>
            <button
              class="character-build__tab"
              :class="{ 'character-build__tab--active': activeTab === 'equip' }"
              @click="activeTab = 'equip'"
            >
              <i class="fas fa-cog"></i> 装备技能
            </button>
          </div>
          <div class="character-build__tab-content">
            <SkillTreeTab v-if="activeTab === 'skill'" :character-id="selectedCharacterId" />
            <PointAllocationTab v-else-if="activeTab === 'points'" :character-id="selectedCharacterId" />
            <EquipSkillsTab v-else-if="activeTab === 'equip'" :character-id="selectedCharacterId" />
          </div>
        </div>

        <!-- No character selected -->
        <div v-else class="character-build__empty">
          <i class="fas fa-users"></i>
          <p>请选择一个角色</p>
        </div>
      </div>
    </div>
  </div>

  <!-- Non-modal variant for future route migration -->
  <div v-else class="character-build-view">
    <h2 class="mg-modal__title">角色Build</h2>
    <!-- Same layout as above, without modal overlay -->
    <div v-if="loading" class="character-build__loading">
      <i class="fas fa-spinner fa-spin"></i> 加载中...
    </div>
    <div v-else-if="error" class="character-build__error">
      <i class="fas fa-exclamation-triangle"></i> 角色信息加载失败
    </div>
    <div v-else class="character-build__layout">
      <aside class="character-build__sidebar">
        <h3 class="character-build__sidebar-title">队伍成员</h3>
        <div class="character-build__char-list mg-scroll">
          <button
            v-for="char in inPartyCharacters"
            :key="char.charId"
            class="character-build__char-btn"
            :class="{ 'character-build__char-btn--active': selectedCharacterId === char.charId }"
            @click="selectCharacter(char.charId)"
          >
            <span class="character-build__char-name">{{ char.displayName }}</span>
            <span class="character-build__char-level">LV {{ char.level }}</span>
          </button>
        </div>
      </aside>
      <div class="character-build__main" v-if="selectedCharacterId">
        <div class="character-build__tabs">
          <button
            class="character-build__tab"
            :class="{ 'character-build__tab--active': activeTab === 'skill' }"
            @click="activeTab = 'skill'"
          ><i class="fas fa-book"></i> 技能学习</button>
          <button
            class="character-build__tab"
            :class="{ 'character-build__tab--active': activeTab === 'points' }"
            @click="activeTab = 'points'"
          ><i class="fas fa-plus-circle"></i> 点数分配</button>
          <button
            class="character-build__tab"
            :class="{ 'character-build__tab--active': activeTab === 'equip' }"
            @click="activeTab = 'equip'"
          ><i class="fas fa-cog"></i> 装备技能</button>
        </div>
        <div class="character-build__tab-content">
          <SkillTreeTab v-if="activeTab === 'skill'" :character-id="selectedCharacterId" />
          <PointAllocationTab v-else-if="activeTab === 'points'" :character-id="selectedCharacterId" />
          <EquipSkillsTab v-else-if="activeTab === 'equip'" :character-id="selectedCharacterId" />
        </div>
      </div>
      <div v-else class="character-build__empty">
        <i class="fas fa-users"></i>
        <p>请选择一个角色</p>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.character-build-modal {
  width: min(90vw, 1100px) !important;
  padding: 0 20px;
  max-height: 85vh;
  display: flex;
  flex-direction: column;
}

.character-build__layout {
  display: flex;
  gap: var(--mg-space-lg);
  flex: 1;
  min-height: 0;
  margin-top: var(--mg-space-md);
}

.character-build__sidebar {
  flex: 0 0 200px;
  display: flex;
  flex-direction: column;
  gap: var(--mg-space-sm);
}

.character-build__sidebar-title {
  margin: 0;
  font-family: var(--mg-font-heading);
  font-size: 0.9rem;
  color: var(--mg-text-secondary);
}

.character-build__char-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  overflow-y: auto;
  flex: 1;
}

.character-build__char-btn {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--mg-space-sm) var(--mg-space-md);
  border: var(--mg-border-width) solid var(--mg-border);
  border-radius: var(--mg-radius);
  background: var(--mg-bg-card);
  color: var(--mg-text);
  cursor: pointer;
  transition: all var(--mg-transition-fast);
  text-align: left;
  width: 100%;
  font-family: inherit;

  &:hover {
    border-color: var(--mg-accent);
    background: var(--mg-surface-pink);
  }

  &--active {
    border-color: var(--mg-accent);
    background: var(--mg-surface-pink);
    box-shadow: var(--mg-glow-pink);
  }
}

.character-build__char-name {
  font-weight: 700;
  font-size: 0.9rem;
}

.character-build__char-level {
  font-size: 0.75rem;
  color: var(--mg-text-secondary);
  font-variant-numeric: tabular-nums;
}

.character-build__main {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.character-build__tabs {
  display: flex;
  gap: 0;
  border-bottom: var(--mg-border-width) solid var(--mg-border);
  margin-bottom: var(--mg-space-md);
}

.character-build__tab {
  padding: var(--mg-space-sm) var(--mg-space-lg);
  border: none;
  border-bottom: 2px solid transparent;
  background: transparent;
  color: var(--mg-text-secondary);
  cursor: pointer;
  font-family: var(--mg-font-heading);
  font-weight: 700;
  font-size: 0.9rem;
  transition: all var(--mg-transition-fast);

  &:hover {
    color: var(--mg-text);
    background: var(--mg-surface-pink);
  }

  &--active {
    color: var(--mg-accent);
    border-bottom-color: var(--mg-accent);
  }
}

.character-build__tab-content {
  flex: 1;
  overflow-y: auto;
  min-height: 300px;
}

.character-build__loading,
.character-build__error,
.character-build__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--mg-space-sm);
  padding: var(--mg-space-2xl);
  color: var(--mg-text-secondary);
  text-align: center;

  i {
    font-size: 2rem;
    opacity: 0.4;
  }
}

.mg-modal-card--wide.character-build-modal {
  max-width: 1100px;
}
</style>
