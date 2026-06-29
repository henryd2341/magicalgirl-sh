<script setup lang="ts">
import { computed } from "vue";
import type { ItemContent, ItemTier } from "@/types/content";
import { summarizeItemEffects } from "@/utils/itemEffectSummary";

const props = defineProps<{
  item: ItemContent;
  sellPrice?: number;
}>();

const tierClasses: Record<ItemTier, string> = {
  common: "bg-gray-200 text-gray-700",
  uncommon: "bg-green-200 text-green-800",
  rare: "bg-blue-200 text-blue-800",
  legendary: "bg-purple-200 text-purple-900",
};

const tierLabels: Record<ItemTier, string> = {
  common: "普通",
  uncommon: "少见",
  rare: "稀有",
  legendary: "传说",
};

const typeLabels: Record<string, string> = {
  consumable: "消耗品",
  accessory: "饰品",
};

const typeIcons: Record<string, string> = {
  consumable: "fas fa-flask",
  accessory: "fas fa-ring",
};

const effects = computed(() => summarizeItemEffects(props.item));
const tierClass = computed(() => tierClasses[props.item.tier]);
const tierLabel = computed(() => tierLabels[props.item.tier]);
const typeLabel = computed(() => typeLabels[props.item.type] ?? props.item.type);
const typeIcon = computed(() => typeIcons[props.item.type] ?? "fas fa-question");
</script>

<template>
  <div class="item-detail-panel p-4 rounded-lg bg-white/90 backdrop-blur-sm shadow-lg max-w-sm">
    <div class="flex items-center gap-2 mb-2">
      <i :class="typeIcon" class="text-lg"></i>
      <h3 class="text-lg font-bold text-gray-900">{{ item.name }}</h3>
      <span :class="tierClass" class="px-2 py-0.5 rounded-full text-xs font-semibold">
        {{ tierLabel }}
      </span>
    </div>

    <p class="text-sm text-gray-600 mb-3">{{ item.description }}</p>

    <div class="flex items-center gap-3 mb-3 text-sm">
      <span class="text-gray-500">{{ typeLabel }}</span>
      <span class="flex items-center gap-1 text-yellow-700 font-semibold">
        <i class="fas fa-coins text-xs"></i>
        {{ item.price }}
      </span>
      <span v-if="sellPrice !== undefined" class="flex items-center gap-1 text-green-700 font-semibold">
        <i class="fas fa-arrow-down text-xs"></i>
        {{ sellPrice }}
      </span>
    </div>

    <div class="border-t border-gray-200 pt-2">
      <h4 class="text-xs font-semibold text-gray-500 uppercase mb-1">效果</h4>
      <ul class="space-y-0.5">
        <li v-for="(effect, index) in effects" :key="index" class="text-sm text-gray-800">
          {{ effect }}
        </li>
      </ul>
    </div>
  </div>
</template>
