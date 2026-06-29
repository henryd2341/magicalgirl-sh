<script setup lang="ts">
import { ref, computed, watch, onMounted, onErrorCaptured } from "vue";
import type { VariableValueRecord } from "@/types/variables";
import { useSessionStore } from "@/stores/sessionStore";
import { getAllItems } from "@/content/contentRegistry";
import type { ItemContent } from "@/types/content";
import ItemDetailPanel from "@/ui/game/ItemDetailPanel.vue";

const emit = defineEmits<{ close: [] }>();

const sessionStore = useSessionStore();

const allItems = (() => {
  try {
    return getAllItems();
  } catch (err) {
    console.error("[InventoryOverlay] Failed to load items:", err);
    return new Map<string, ItemContent>();
  }
})();

const selectedItem = ref<ItemContent | null>(null);
const showSwapConfirm = ref(false);
const swapTargetCharacter = ref<string | null>(null);
const swapOldItemName = ref("");
const swapNewItemName = ref("");

const varState = ref<VariableValueRecord | null>(null);
const mounted = ref(false);
const setupError = ref<string | null>(null);

onErrorCaptured((err) => {
  console.error("[InventoryOverlay]", err);
  setupError.value = err instanceof Error ? err.message : String(err);
  return false;
});

onMounted(async () => {
  try {
    varState.value = await sessionStore.getVariableSnapshot();
    mounted.value = true;
  } catch (err) {
    console.error("[InventoryOverlay] init failed:", err);
    setupError.value = err instanceof Error ? err.message : String(err);
  }
});

watch(() => sessionStore.variableVersion, async () => {
  varState.value = await sessionStore.getVariableSnapshot();
});

const inventoryItems = computed(() => {
  if (!varState.value) return [];
  const items = varState.value.root.inventory.items;
  const result: { item: ItemContent; count: number }[] = [];
  for (const [id, count] of Object.entries(items)) {
    if (count <= 0) continue;
    const item = allItems.get(id);
    if (!item) continue;
    result.push({ item, count });
  }
  return result;
});

const consumables = computed(() =>
  inventoryItems.value.filter((i) => i.item.type === "consumable"),
);

const accessories = computed(() =>
  inventoryItems.value.filter((i) => i.item.type === "accessory"),
);

const partyMembers = computed(() => {
  if (!varState.value) return [];
  const characters = varState.value.root.characters;
  const player = varState.value.root.player;

  const members: { id: string; name: string; equippedAccessory: string | null }[] = [];

  members.push({
    id: "player",
    name: player.profile.name,
    equippedAccessory: player.equipment.accessory,
  });

  for (const [id, char] of Object.entries(characters)) {
    if (char.inParty) {
      members.push({
        id,
        name: char.displayName,
        equippedAccessory: char.equipment?.accessory ?? null,
      });
    }
  }

  return members;
});

function getAccessoryName(id: string | null): string {
  if (!id) return "无";
  const item = allItems.get(id);
  return item?.name ?? id;
}

async function onEquipClick(characterId: string) {
  if (!selectedItem.value || selectedItem.value.type !== "accessory") return;

  const member = partyMembers.value.find((m) => m.id === characterId);
  if (!member) return;

  if (member.equippedAccessory) {
    swapTargetCharacter.value = characterId;
    swapOldItemName.value = getAccessoryName(member.equippedAccessory);
    swapNewItemName.value = selectedItem.value.name;
    showSwapConfirm.value = true;
  } else {
    await executeEquip(characterId);
  }
}

async function executeEquip(characterId: string) {
  if (!selectedItem.value) return;
  const result = await sessionStore.equipAccessory(characterId, selectedItem.value.id);
  if (result.success) {
    selectedItem.value = null;
  }
}

async function onUnequipClick(characterId: string) {
  const result = await sessionStore.unequipAccessory(characterId);
  if (!result.success) {
    console.warn("Unequip failed:", result.error);
  }
}

function confirmSwap() {
  if (swapTargetCharacter.value) {
    executeEquip(swapTargetCharacter.value);
  }
  showSwapConfirm.value = false;
  swapTargetCharacter.value = null;
}

function cancelSwap() {
  showSwapConfirm.value = false;
  swapTargetCharacter.value = null;
}

function closeOverlay() {
  selectedItem.value = null;
  emit("close");
}
</script>

<template>
  <div
    class="mg-modal-overlay"
    role="dialog"
    aria-modal="true"
    aria-label="背包"
    @click.self="closeOverlay"
  >
    <!-- Error state -->
    <div v-if="setupError" class="mg-modal-card inventory-overlay__error">
      <button class="mg-modal__close" @click="closeOverlay">
        <i class="fas fa-times"></i>
      </button>
      <h2 class="mg-modal__title">
        <i class="fas fa-exclamation-triangle"></i> 加载失败
      </h2>
      <div class="mg-modal__body">
        <p class="inventory-overlay__error-msg">{{ setupError }}</p>
        <button class="mg-btn mg-btn--sm mg-btn--primary" @click="closeOverlay">
          关闭
        </button>
      </div>
    </div>

    <!-- Normal state -->
    <div v-else class="mg-modal-card mg-modal-card--wide inventory-overlay">
      <button class="mg-modal__close" @click="closeOverlay">
        <i class="fas fa-times"></i>
      </button>
      <h2 class="mg-modal__title">
        <i class="fas fa-backpack"></i> 背包
      </h2>

      <div class="mg-modal__body mg-scroll inventory-overlay__body">
        <div
          v-if="inventoryItems.length === 0"
          class="inventory-overlay__empty"
        >
          <i class="fas fa-box-open inventory-overlay__empty-icon"></i>
          <p>背包空空如也</p>
        </div>

        <div v-else class="inventory-overlay__panels">
          <!-- Left: item list -->
          <div class="inventory-overlay__left">
            <!-- Consumables -->
            <div v-if="consumables.length > 0" class="inventory-overlay__section">
              <h3 class="inventory-overlay__section-title">
                <i class="fas fa-flask"></i> 消耗品
              </h3>
              <ul class="inventory-overlay__list">
                <li
                  v-for="entry in consumables"
                  :key="entry.item.id"
                  class="inventory-overlay__item"
                  :class="{ 'inventory-overlay__item--active': selectedItem?.id === entry.item.id }"
                  @click="selectedItem = entry.item"
                >
                  <span class="inventory-overlay__item-name">{{ entry.item.name }}</span>
                  <span class="inventory-overlay__item-count">×{{ entry.count }}</span>
                </li>
              </ul>
            </div>

            <!-- Accessories -->
            <div v-if="accessories.length > 0" class="inventory-overlay__section">
              <h3 class="inventory-overlay__section-title">
                <i class="fas fa-ring"></i> 饰品
              </h3>
              <ul class="inventory-overlay__list">
                <li
                  v-for="entry in accessories"
                  :key="entry.item.id"
                  class="inventory-overlay__item"
                  :class="{ 'inventory-overlay__item--active': selectedItem?.id === entry.item.id }"
                  @click="selectedItem = entry.item"
                >
                  <span class="inventory-overlay__item-name">{{ entry.item.name }}</span>
                  <span class="inventory-overlay__item-count">×{{ entry.count }}</span>
                </li>
              </ul>
            </div>
          </div>

          <!-- Right: detail + party -->
          <div class="inventory-overlay__right">
            <div v-if="selectedItem" class="inventory-overlay__detail">
              <ItemDetailPanel :item="selectedItem" />
            </div>

            <div v-if="selectedItem?.type === 'accessory'" class="inventory-overlay__party">
              <h3 class="inventory-overlay__section-title">
                <i class="fas fa-user-check"></i> 选择装备角色
              </h3>
              <ul class="inventory-overlay__list">
                <li
                  v-for="member in partyMembers"
                  :key="member.id"
                  class="inventory-overlay__party-member"
                  @click="onEquipClick(member.id)"
                >
                  <span class="inventory-overlay__party-name">{{ member.name }}</span>
                  <span class="inventory-overlay__party-acc">
                    {{ getAccessoryName(member.equippedAccessory) }}
                    <button
                      v-if="member.equippedAccessory"
                      class="inventory-overlay__unequip-btn"
                      @click.stop="onUnequipClick(member.id)"
                      :title="'卸下 ' + getAccessoryName(member.equippedAccessory)"
                    >
                      <i class="fas fa-times-circle"></i>
                    </button>
                  </span>
                </li>
              </ul>
            </div>

            <div v-if="!selectedItem" class="inventory-overlay__empty-right">
              <i class="fas fa-hand-pointer"></i>
              <p>选择一个道具查看详情</p>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Swap confirmation dialog -->
    <div
      v-if="showSwapConfirm"
      class="mg-modal-overlay"
      @click.self="cancelSwap"
    >
      <div class="mg-modal-card inventory-overlay__confirm">
        <h2 class="mg-modal__title">
          <i class="fas fa-exchange-alt"></i> 替换饰品
        </h2>
        <div class="mg-modal__body">
          <p class="inventory-overlay__confirm-msg">
            替换 <strong>{{ swapOldItemName }}</strong> 为 <strong>{{ swapNewItemName }}</strong>？
          </p>
          <div class="inventory-overlay__confirm-actions">
            <button
              class="mg-btn mg-btn--sm mg-btn--ghost"
              @click="cancelSwap"
            >
              取消
            </button>
            <button
              class="mg-btn mg-btn--sm mg-btn--primary"
              @click="confirmSwap"
            >
              确认
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.inventory-overlay {
  max-width: 720px;
  max-height: 85vh;
  display: flex;
  flex-direction: column;
}

.inventory-overlay__error {
  max-width: 360px;
}

.inventory-overlay__error-msg {
  font-size: var(--mg-font-sm);
  color: var(--mg-text-secondary);
  margin: 0 0 var(--mg-space-md);
}

.inventory-overlay__body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.inventory-overlay__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: var(--mg-space-2xl, 48px) 0;
  color: var(--mg-text-muted);
  font-size: var(--mg-font-base);

  p {
    margin: var(--mg-space-sm, 8px) 0 0;
  }
}

.inventory-overlay__empty-icon {
  font-size: 2.5rem;
  opacity: 0.4;
}

.inventory-overlay__empty-right {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: var(--mg-space-xl, 32px) 0;
  color: var(--mg-text-muted);
  font-size: var(--mg-font-base);

  i {
    font-size: 1.5rem;
    margin-bottom: var(--mg-space-sm, 8px);
    opacity: 0.5;
  }

  p {
    margin: 0;
  }
}

.inventory-overlay__panels {
  display: flex;
  flex: 1;
  min-height: 0;
  gap: 0;
}

.inventory-overlay__left {
  width: 50%;
  border-right: var(--mg-border-width, 1px) solid var(--mg-border, rgba(255, 255, 255, 0.1));
  padding: var(--mg-space-md, 16px);
  overflow-y: auto;
}

.inventory-overlay__right {
  width: 50%;
  padding: var(--mg-space-md, 16px);
  overflow-y: auto;
}

.inventory-overlay__section {
  margin-bottom: var(--mg-space-md, 16px);
}

.inventory-overlay__section-title {
  font-family: var(--mg-font-heading);
  font-size: var(--mg-font-sm, 0.8rem);
  font-weight: 700;
  color: var(--mg-text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  margin: 0 0 var(--mg-space-sm, 8px);

  i {
    color: var(--mg-accent);
    margin-right: 6px;
  }
}

.inventory-overlay__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.inventory-overlay__item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--mg-space-sm, 8px) var(--mg-space-md, 12px);
  border-radius: var(--mg-radius-sm, 8px);
  background: var(--mg-bg-card);
  border: var(--mg-border-width, 1px) solid var(--mg-border, rgba(255, 255, 255, 0.1));
  cursor: pointer;
  transition:
    border-color var(--mg-transition-fast, 0.15s ease),
    background var(--mg-transition-fast, 0.15s ease);

  &:hover {
    border-color: var(--mg-accent);
    background: var(--mg-surface-pink, rgba(255, 107, 157, 0.08));
  }
}

.inventory-overlay__item--active {
  border-color: var(--mg-accent);
  background: var(--mg-surface-pink, rgba(255, 107, 157, 0.12));
  box-shadow: var(--mg-glow-pink);
}

.inventory-overlay__item-name {
  font-size: var(--mg-font-md, 0.9rem);
  font-weight: 600;
  color: var(--mg-text);
}

.inventory-overlay__item-count {
  font-size: var(--mg-font-sm, 0.8rem);
  color: var(--mg-text-secondary);
}

.inventory-overlay__detail {
  margin-bottom: var(--mg-space-md, 16px);
}

.inventory-overlay__party {
  margin-top: var(--mg-space-md, 16px);

  .inventory-overlay__section-title {
    margin-bottom: var(--mg-space-sm, 8px);
  }
}

.inventory-overlay__party-member {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--mg-space-sm, 8px) var(--mg-space-md, 12px);
  border-radius: var(--mg-radius-sm, 8px);
  background: var(--mg-bg-card);
  border: var(--mg-border-width, 1px) solid var(--mg-border, rgba(255, 255, 255, 0.1));
  cursor: pointer;
  transition:
    border-color var(--mg-transition-fast, 0.15s ease),
    background var(--mg-transition-fast, 0.15s ease);

  &:hover {
    border-color: var(--mg-accent);
    background: var(--mg-surface-pink, rgba(255, 107, 157, 0.08));
  }
}

.inventory-overlay__party-name {
  font-size: var(--mg-font-md, 0.9rem);
  font-weight: 600;
  color: var(--mg-text);
}

.inventory-overlay__party-acc {
  display: flex;
  align-items: center;
  gap: var(--mg-space-sm, 8px);
  font-size: var(--mg-font-xs, 0.7rem);
  color: var(--mg-text-secondary);
}

.inventory-overlay__unequip-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border: none;
  background: transparent;
  color: var(--mg-error, #ff4757);
  cursor: pointer;
  font-size: 0.85rem;
  padding: 0;
  transition: opacity var(--mg-transition-fast, 0.15s ease);

  &:hover {
    opacity: 0.7;
  }
}

.inventory-overlay__confirm {
  max-width: 360px;
}

.inventory-overlay__confirm-msg {
  font-size: var(--mg-font-base);
  color: var(--mg-text);
  margin: 0 0 var(--mg-space-md, 16px);
  line-height: var(--mg-leading-relaxed, 1.7);

  strong {
    color: var(--mg-accent-strong);
  }
}

.inventory-overlay__confirm-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--mg-space-sm, 8px);
}
</style>
