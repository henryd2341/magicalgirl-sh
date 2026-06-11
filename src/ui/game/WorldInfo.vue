<template>
  <div class="mg-world-info">
    <div v-if="loading" class="mg-world-info__skeleton mg-skeleton-pulse" aria-busy="true"></div>
    <div v-else-if="error || !vars" class="mg-world-info__error">
      <i class="fas fa-exclamation-triangle"></i>
      <span>世界信息暂不可用</span>
    </div>
    <template v-else>
      <span class="mg-world-info__name" :title="locationName">{{ locationName || "未知地点" }}</span>
      <span class="mg-world-info__time">
        <i :class="isNight ? 'fas fa-moon' : 'fas fa-sun'"></i>
        {{ isNight ? "夜晚" : "白天" }}
      </span>
      <span class="mg-world-info__datetime">{{ now }}&nbsp;第{{ dayIndex }}天</span>
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

watch(
  () => sessionSnapshot.value?.sessionState,
  async () => {
    loading.value = true;
    error.value = false;
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

const locationName = computed(() => vars.value?.root?.world?.location?.name ?? "");

const isNight = computed(() => {
  const t = vars.value?.root?.world?.time;
  if (t?.timeSlot) {
    const s = t.timeSlot.toLowerCase();
    if (s.includes("night") || s.includes("evening") || s.includes("夜") || s.includes("晚")) return true;
  }
  if (t?.displayText) {
    if (t.displayText.includes("夜") || t.displayText.includes("晚") || /night|evening/i.test(t.displayText)) return true;
  }
  return false;
});

const dayIndex = computed(() => vars.value?.root?.world?.time.dayIndex ?? NaN);
const now = computed(() => vars.value?.root?.world?.time.displayText ?? "");
</script>

<style lang="scss" scoped>
.mg-world-info {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  padding: var(--mg-space-sm) var(--mg-space-md);
  gap: var(--mg-space-sm);
  min-height: 40px;
}

.mg-world-info__name {
  font-family: var(--mg-font-heading);
  font-weight: 700;
  font-size: var(--mg-font-base, 1rem);
  color: var(--mg-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
  min-width: 0;
}


.mg-world-info__time,
.mg-world-info__datetime {
  align-items: center;
  gap: var(--mg-space-xs, 4px);
  font-size: var(--mg-font-sm, 0.85rem);
  color: var(--mg-text-secondary);
  white-space: nowrap;
}

.mg-world-info__time {
  display: flex;
  i {
    font-size: 1rem;
  }
}

.mg-world-info__datetime {
  display: inline;
  width: 100%;
  margin-left: auto;
  margin-right: auto;
  text-align: center;
}

.mg-world-info__skeleton {
  width: 100%;
  height: 40px;
  border-radius: var(--mg-radius);
  background: var(--mg-bg-card);
  animation: mg-skeleton-pulse 1.5s ease-in-out infinite;
}

.mg-world-info__error {
  display: flex;
  align-items: center;
  gap: var(--mg-space-sm, 8px);
  font-size: var(--mg-font-sm, 0.85rem);
  color: var(--mg-text-secondary);
  padding: var(--mg-space-sm) 0;

  i {
    opacity: 0.6;
  }
}
</style>
