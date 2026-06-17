<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import { useProviderMetadataHistory } from "@/composables/useProviderMetadataHistory";

defineEmits<{
  (e: "close"): void;
}>();

const { snapshots, summary } = useProviderMetadataHistory();

const activeTab = ref<"summary" | number>("summary");

const tabs = computed(() => {
  const result: Array<{ label: string; key: "summary" | number }> = [
    { label: "总计", key: "summary" },
  ];
  for (let i = snapshots.value.length - 1; i >= 0; i--) {
    result.push({
      label: `第${snapshots.value[i].index}次`,
      key: snapshots.value[i].index,
    });
  }
  return result;
});

const activeFields = computed<Record<string, unknown> | null>(() => {
  if (activeTab.value === "summary") {
    return (summary.value as Record<string, unknown>) ?? null;
  }
  const snapshot = snapshots.value.find((s) => s.index === activeTab.value);
  return snapshot?.fields ?? null;
});

function fieldEntries(fields: Record<string, unknown>): Array<[string, unknown]> {
  return Object.entries(fields);
}

// Default to most recent on mount
if (snapshots.value.length > 0) {
  activeTab.value = snapshots.value[snapshots.value.length - 1].index;
}

function onKeydown(e: KeyboardEvent): void {
  if (e.key === "Escape") {
    window.dispatchEvent(new CustomEvent("mg-close-provider-metadata-modal"));
  }
}

onMounted(() => {
  document.addEventListener("keydown", onKeydown);
});

onUnmounted(() => {
  document.removeEventListener("keydown", onKeydown);
});

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "-";
  if (typeof value === "object") return JSON.stringify(value, null, 2);
  return String(value);
}
</script>

<template>
  <div class="mg-modal-overlay" @click.self="$emit('close')">
    <div class="mg-modal-card mg-modal-card--wide">
      <button class="mg-modal__close" @click="$emit('close')">
        <i class="fas fa-times"></i>
      </button>
      <h2 class="mg-modal__title">历史响应元数据</h2>
      <div class="mg-modal__body mg-scroll">
        <!-- Tabs -->
        <div v-if="tabs.length > 0" class="pmd-tabs">
          <button
            v-for="tab in tabs"
            :key="tab.key"
            class="pmd-tab"
            :class="{ 'pmd-tab--active': activeTab === tab.key }"
            @click="activeTab = tab.key"
          >
            {{ tab.label }}
          </button>
        </div>
        <p v-else class="pmd-empty">暂无元数据记录</p>

        <!-- Cards -->
        <div v-if="activeFields && fieldEntries(activeFields).length > 0" class="pmd-cards">
          <div
            v-for="[key, value] in fieldEntries(activeFields)"
            :key="key"
            class="pmd-card"
          >
            <code class="pmd-card__key">{{ key }}</code>
            <pre class="pmd-card__value">{{ formatValue(value) }}</pre>
          </div>
        </div>
        <p v-else-if="tabs.length > 0" class="pmd-empty">此标签无字段数据</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.pmd-tabs {
  display: flex;
  gap: 4px;
  margin-bottom: 16px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--mg-border-subtle, rgba(255, 255, 255, 0.08));
  overflow-x: auto;
  flex-wrap: nowrap;
}

.pmd-tab {
  flex-shrink: 0;
  padding: 4px 12px;
  border: 1px solid var(--mg-border-subtle, rgba(255, 255, 255, 0.08));
  border-radius: var(--mg-radius-sm, 4px);
  background: var(--mg-bg-input, rgba(255, 255, 255, 0.04));
  color: var(--mg-text-secondary, #999);
  font-size: 0.82rem;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}

.pmd-tab:hover {
  background: rgba(255, 255, 255, 0.08);
  color: var(--mg-text, inherit);
}

.pmd-tab--active {
  background: var(--mg-accent-subtle, rgba(255, 107, 157, 0.15));
  color: var(--mg-accent-strong, #ff6b9d);
  border-color: var(--mg-accent-strong, #ff6b9d);
}

.pmd-cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 10px;
}

.pmd-card {
  padding: 12px 14px;
  border-radius: var(--mg-radius-md, 6px);
  background: var(--mg-bg-input, rgba(255, 255, 255, 0.04));
  border: 1px solid var(--mg-border-subtle, rgba(255, 255, 255, 0.06));
}

.pmd-card__key {
  display: block;
  margin-bottom: 6px;
  font-size: 0.75rem;
  color: var(--mg-accent-strong, #ff6b9d);
  word-break: break-all;
}

.pmd-card__value {
  margin: 0;
  font-size: 0.85rem;
  color: var(--mg-text, inherit);
  word-break: break-all;
  white-space: pre-wrap;
  font-family: var(--mg-font-mono, "Cascadia Code", "Fira Code", monospace);
  background: transparent;
}

.pmd-empty {
  color: var(--mg-text-muted, #777);
  font-size: 0.85rem;
  font-style: italic;
  text-align: center;
  padding: 24px 0;
}
</style>
