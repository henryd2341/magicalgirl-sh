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
  return false; // prevent propagation to parent
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
  <section
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
    role="dialog"
    aria-modal="true"
    aria-label="背包"
    @click.self="closeOverlay"
  >
    <div v-if="setupError" class="bg-white rounded-lg p-6 max-w-sm">
      <p class="text-red-600 font-bold">加载失败</p>
      <p class="text-sm text-gray-600 mt-1">{{ setupError }}</p>
      <button class="mt-3 px-4 py-2 bg-gray-200 rounded-lg" @click="closeOverlay">关闭</button>
    </div>
    <div v-else class="bg-white/95 rounded-xl shadow-2xl w-full max-w-4xl max-h-[85vh] flex flex-col">
      <div class="flex items-center justify-between p-4 border-b border-gray-200">
        <h2 class="text-xl font-bold text-gray-900">
          <i class="fas fa-backpack mr-2"></i>背包
        </h2>
        <button
          class="text-gray-500 hover:text-gray-700 text-xl"
          @click="closeOverlay"
          aria-label="关闭"
        >
          <i class="fas fa-times"></i>
        </button>
      </div>

      <div class="flex flex-1 overflow-hidden">
        <div class="w-1/2 overflow-y-auto p-4 border-r border-gray-200">
          <div v-if="inventoryItems.length === 0" class="text-center text-gray-400 py-8">
            <i class="fas fa-box-open text-4xl mb-2"></i>
            <p>背包空空如也</p>
          </div>

          <div v-if="consumables.length > 0" class="mb-4">
            <h3 class="text-sm font-semibold text-gray-500 uppercase mb-2">消耗品</h3>
            <ul class="space-y-1">
              <li
                v-for="entry in consumables"
                :key="entry.item.id"
                class="flex items-center justify-between p-2 rounded-lg cursor-pointer transition"
                :class="selectedItem?.id === entry.item.id ? 'bg-blue-100' : 'hover:bg-gray-100'"
                @click="selectedItem = entry.item"
              >
                <span class="text-sm text-gray-800">{{ entry.item.name }}</span>
                <span class="text-sm text-gray-500">×{{ entry.count }}</span>
              </li>
            </ul>
          </div>

          <div v-if="accessories.length > 0">
            <h3 class="text-sm font-semibold text-gray-500 uppercase mb-2">饰品</h3>
            <ul class="space-y-1">
              <li
                v-for="entry in accessories"
                :key="entry.item.id"
                class="flex items-center justify-between p-2 rounded-lg cursor-pointer transition"
                :class="selectedItem?.id === entry.item.id ? 'bg-blue-100' : 'hover:bg-gray-100'"
                @click="selectedItem = entry.item"
              >
                <span class="text-sm text-gray-800">{{ entry.item.name }}</span>
                <span class="text-sm text-gray-500">×{{ entry.count }}</span>
              </li>
            </ul>
          </div>
        </div>

        <div class="w-1/2 overflow-y-auto p-4">
          <div v-if="selectedItem" class="mb-4">
            <ItemDetailPanel :item="selectedItem" />
          </div>

          <div v-if="selectedItem?.type === 'accessory'">
            <h3 class="text-sm font-semibold text-gray-500 uppercase mb-2">选择装备角色</h3>
            <ul class="space-y-1">
              <li
                v-for="member in partyMembers"
                :key="member.id"
                class="flex items-center justify-between p-2 rounded-lg cursor-pointer transition hover:bg-blue-50"
                @click="onEquipClick(member.id)"
              >
                <span class="text-sm text-gray-800">{{ member.name }}</span>
                <span class="text-xs text-gray-500">
                  {{ getAccessoryName(member.equippedAccessory) }}
                  <button
                    v-if="member.equippedAccessory"
                    class="ml-2 text-red-400 hover:text-red-600"
                    @click.stop="onUnequipClick(member.id)"
                  >
                    <i class="fas fa-times-circle"></i>
                  </button>
                </span>
              </li>
            </ul>
          </div>

          <div v-if="!selectedItem" class="text-center text-gray-400 py-8">
            <i class="fas fa-hand-pointer text-3xl mb-2"></i>
            <p>选择一个道具查看详情</p>
          </div>
        </div>
      </div>
    </div>

    <div
      v-if="showSwapConfirm"
      class="fixed inset-0 z-60 flex items-center justify-center bg-black/50"
      @click.self="cancelSwap"
    >
      <div class="bg-white rounded-lg shadow-xl p-6 max-w-sm">
        <p class="text-gray-800 mb-4">
          替换 <strong>{{ swapOldItemName }}</strong> 为 <strong>{{ swapNewItemName }}</strong>？
        </p>
        <div class="flex gap-3 justify-end">
          <button
            class="px-4 py-2 rounded-lg bg-gray-200 text-gray-700 hover:bg-gray-300"
            @click="cancelSwap"
          >
            取消
          </button>
          <button
            class="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700"
            @click="confirmSwap"
          >
            确认
          </button>
        </div>
      </div>
    </div>
  </section>
</template>
