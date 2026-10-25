<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue';
const props = defineProps<{ startedAt: number | null }>();
const now = ref(Date.now());
let timer: ReturnType<typeof setInterval> | undefined;
watch(
  () => props.startedAt,
  startedAt => {
    clearInterval(timer);
    now.value = Date.now();
    if (startedAt !== null)
      timer = setInterval(() => {
        now.value = Date.now();
      }, 1000);
  },
  { immediate: true },
);
onUnmounted(() => clearInterval(timer));
const elapsed = computed(() => {
  const seconds = Math.max(0, Math.floor((now.value - (props.startedAt ?? now.value)) / 1000));
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
});
</script>
<template>
  <div v-if="startedAt !== null" class="conversation-loading">
    <span role="status" aria-live="polite">正在生成回复</span>
    <span class="conversation-loading__elapsed" aria-live="off">已用时 {{ elapsed }}</span>
  </div>
</template>
<style scoped>
.conversation-loading {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  padding: 12px;
  color: var(--mg-text-secondary);
  font-size: 14px;
}
.conversation-loading__elapsed {
  font-variant-numeric: tabular-nums;
}
</style>
