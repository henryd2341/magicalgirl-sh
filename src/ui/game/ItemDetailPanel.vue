<script setup lang="ts">
import { computed } from "vue";
import type { ItemContent, ItemTier } from "@/types/content";
import { summarizeItemEffects } from "@/utils/itemEffectSummary";

const props = defineProps<{
  item: ItemContent;
  sellPrice?: number;
}>();

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
const tierLabel = computed(() => tierLabels[props.item.tier]);
const typeLabel = computed(() => typeLabels[props.item.type] ?? props.item.type);
const typeIcon = computed(() => typeIcons[props.item.type] ?? "fas fa-question");
</script>

<template>
  <div class="mg-panel item-detail-panel">
    <div class="item-detail-panel__header">
      <i :class="typeIcon" class="item-detail-panel__type-icon" aria-hidden="true"></i>
      <h3 class="item-detail-panel__name">{{ item.name }}</h3>
      <span
        class="item-detail-panel__tier"
        :class="`item-detail-panel__tier--${item.tier}`"
      >
        {{ tierLabel }}
      </span>
    </div>

    <p class="item-detail-panel__desc">{{ item.description }}</p>

    <div class="item-detail-panel__meta">
      <span class="item-detail-panel__type">{{ typeLabel }}</span>
      <span class="item-detail-panel__price">
        <i class="fas fa-coins"></i>
        {{ item.price }}
      </span>
      <span v-if="sellPrice !== undefined" class="item-detail-panel__sell-price" data-content={{ sellPrice }}>
        <i class="fas fa-arrow-down"></i>
        {{ sellPrice }}
      </span>
    </div>

    <div v-if="effects.length > 0" class="item-detail-panel__effects">
      <h4 class="item-detail-panel__effects-title">
        <i class="fas fa-magic"></i> 效果
      </h4>
      <ul class="item-detail-panel__effects-list">
        <li
          v-for="(effect, index) in effects"
          :key="index"
          class="item-detail-panel__effect"
        >
          {{ effect }}
        </li>
      </ul>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.item-detail-panel {
  padding: var(--mg-space-lg, 24px);
  max-width: 100%;
}

.item-detail-panel__header {
  display: flex;
  align-items: center;
  gap: var(--mg-space-sm, 8px);
  margin-bottom: var(--mg-space-sm, 8px);
}

.item-detail-panel__type-icon {
  font-size: var(--mg-font-lg);
  color: var(--mg-accent);
}

.item-detail-panel__name {
  font-family: var(--mg-font-heading);
  font-size: var(--mg-font-lg);
  font-weight: var(--mg-font-weight-heading);
  color: var(--mg-text);
  margin: 0;
  flex: 1;
}

.item-detail-panel__tier {
  display: inline-block;
  font-family: var(--mg-font-heading);
  font-size: var(--mg-font-xs);
  font-weight: 700;
  padding: 2px 10px;
  border-radius: var(--mg-radius-pill);
  border: var(--mg-border-width) solid;
  white-space: nowrap;
  flex-shrink: 0;
}

// Tier colour variants — theme-aware via CSS variables
.item-detail-panel__tier--common {
  background: var(--mg-surface-pink);
  border-color: var(--mg-border-light);
  color: var(--mg-text-secondary);
}

.item-detail-panel__tier--uncommon {
  background: var(--mg-surface-pink);
  border-color: var(--mg-success);
  color: var(--mg-success);
}

.item-detail-panel__tier--rare {
  background: var(--mg-surface-pink);
  border-color: var(--mg-info);
  color: var(--mg-info);
}

.item-detail-panel__tier--legendary {
  background: var(--mg-surface-pink);
  border-color: var(--mg-accent-strong);
  color: var(--mg-accent-strong);
  box-shadow: var(--mg-glow-pink);
}

.item-detail-panel__desc {
  font-size: var(--mg-font-sm);
  color: var(--mg-text-secondary);
  line-height: var(--mg-leading-relaxed);
  margin: 0 0 var(--mg-space-md, 16px);
}

.item-detail-panel__meta {
  display: flex;
  align-items: center;
  gap: var(--mg-space-md, 16px);
  margin-bottom: var(--mg-space-md, 16px);
  font-size: var(--mg-font-sm);
}

.item-detail-panel__type {
  color: var(--mg-text-muted);
}

.item-detail-panel__price {
  display: flex;
  align-items: center;
  gap: 4px;
  color: var(--mg-text);
  font-family: var(--mg-font-heading);
  font-weight: 700;

  i {
    color: var(--mg-warning);
    font-size: var(--mg-font-xs);
  }
}

.item-detail-panel__sell-price {
  display: flex;
  align-items: center;
  gap: 4px;
  color: var(--mg-text);
  font-family: var(--mg-font-heading);
  font-weight: 700;

  i {
    color: var(--mg-success);
    font-size: var(--mg-font-xs);
  }
}

.item-detail-panel__effects {
  border-top: var(--mg-border-width) solid var(--mg-border);
  padding-top: var(--mg-space-md, 16px);
}

.item-detail-panel__effects-title {
  font-family: var(--mg-font-heading);
  font-size: var(--mg-font-xs);
  font-weight: 700;
  color: var(--mg-text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  margin: 0 0 var(--mg-space-sm, 8px);

  i {
    color: var(--mg-accent);
    margin-right: 4px;
  }
}

.item-detail-panel__effects-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.item-detail-panel__effect {
  font-size: var(--mg-font-sm);
  color: var(--mg-text);
  line-height: var(--mg-leading-relaxed);
}
</style>
