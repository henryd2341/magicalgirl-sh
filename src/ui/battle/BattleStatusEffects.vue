<script setup lang="ts">
import { getStatusEffectMap } from '@/content/contentRegistry';
import type { ActiveStatusEffect } from '@/types/battle';
import BattleInspectionDialog from '@/ui/battle/BattleInspectionDialog.vue';
import { statusEffectIcon } from '@/ui/battle/statusEffectIcons';
import { computed, nextTick, ref } from 'vue';

const props = defineProps<{ effects: ActiveStatusEffect[]; ownerName: string }>();
const inspecting = ref(false);
const previewPosition = ref<{ left: string; top: string } | null>(null);
const namePreview = ref<HTMLElement | null>(null);
const definitions = getStatusEffectMap();
const entries = computed(() =>
  props.effects.map(effect => ({
    ...effect,
    name: definitions.get(effect.effectId)?.name ?? effect.effectId,
    icon: statusEffectIcon(effect.effectId),
  })),
);

async function showNames(event: Event) {
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
  previewPosition.value = {
    left: `${Math.max(8, Math.min(rect.left, window.innerWidth - 280))}px`,
    top: `${Math.max(8, Math.min(rect.bottom + 6, window.innerHeight - 180))}px`,
  };
  await nextTick();
  if (previewPosition.value) namePreview.value?.showPopover();
}

function leaveNames(event: Event) {
  if (document.activeElement !== event.currentTarget) hideNames();
}

function hideNames() {
  previewPosition.value = null;
  namePreview.value?.hidePopover();
}

function inspect() {
  hideNames();
  inspecting.value = true;
}
</script>

<template>
  <div v-if="entries.length || inspecting" class="battle-status-effects">
    <button
      v-if="entries.length"
      type="button"
      class="battle-status-effects__inspect"
      :aria-label="`查看${ownerName}的状态`"
      aria-haspopup="dialog"
      :title="entries.map(entry => entry.name).join('、')"
      @mouseenter="showNames"
      @focus="showNames"
      @mouseleave="leaveNames"
      @blur="hideNames"
      @click.stop="inspect"
    >
      <span class="battle-status-effects__grid" :style="{ '--effect-rows': Math.min(entries.length, 4) }">
        <img
          v-for="(entry, index) in entries"
          :key="`${entry.effectId}-${index}`"
          :src="entry.icon"
          :alt="entry.name"
          :title="entry.name"
          width="24"
          height="24"
        />
      </span>
    </button>
    <div
      ref="namePreview"
      popover="manual"
      class="battle-status-effects__preview"
      :style="previewPosition ?? undefined"
      role="tooltip"
    >
      {{ entries.map(entry => entry.name).join('、') }}
    </div>
    <BattleInspectionDialog v-if="inspecting" :title="`${ownerName}的状态`" @close="inspecting = false">
      <ul class="battle-status-effects__names">
        <li v-for="(entry, index) in entries" :key="`${entry.effectId}-${index}`">
          <img :src="entry.icon" :alt="entry.name" width="32" height="32" />
          <span
            >{{ entry.name }}<small v-if="entry.stacks > 1"> ×{{ entry.stacks }}</small></span
          >
        </li>
      </ul>
    </BattleInspectionDialog>
  </div>
</template>
