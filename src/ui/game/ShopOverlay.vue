<script setup lang="ts">
import { ref, computed, watch, onMounted, onErrorCaptured } from "vue";
import type { VariableValueRecord } from "@/types/variables";
import { useSessionStore } from "@/stores/sessionStore";
import { getAllItems } from "@/content/contentRegistry";
import { computeSellPrice } from "@/engine/shop/shopTransactionService";
import type { ItemContent } from "@/types/content";
import ItemDetailPanel from "@/ui/game/ItemDetailPanel.vue";

const emit = defineEmits<{ close: [] }>();

const sessionStore = useSessionStore();

const allItems = (() => {
  try {
    return getAllItems();
  } catch (err) {
    console.error("[ShopOverlay] Failed to load items:", err);
    return new Map<string, ItemContent>();
  }
})();

const activeTab = ref<"buy" | "sell">("buy");
const selectedItem = ref<ItemContent | null>(null);
const quantity = ref(1);
const showConfirm = ref(false);
const pendingAction = ref<"buy" | "sell" | null>(null);
const confirmItemName = ref("");
const confirmQuantity = ref(0);
const confirmTotal = ref(0);
const feedbackMessage = ref("");

const varState = ref<VariableValueRecord | null>(null);
const mounted = ref(false);
const setupError = ref<string | null>(null);

onErrorCaptured((err) => {
  console.error("[ShopOverlay]", err);
  setupError.value = err instanceof Error ? err.message : String(err);
  return false;
});

onMounted(async () => {
  try {
    varState.value = await sessionStore.getVariableSnapshot();
    mounted.value = true;
  } catch (err) {
    console.error("[ShopOverlay] init failed:", err);
    setupError.value = err instanceof Error ? err.message : String(err);
  }
});

watch(() => sessionStore.variableVersion, async () => {
  varState.value = await sessionStore.getVariableSnapshot();
});

const playerMoney = computed(() => varState.value?.root.player.money ?? 0);

const buyableItems = computed(() => {
  const result: ItemContent[] = [];
  for (const item of allItems.values()) {
    if (item.price > 0) result.push(item);
  }
  return result;
});

const sellableItems = computed(() => {
  if (!varState.value) return [];
  const items = varState.value.root.inventory.items;
  const result: { item: ItemContent; owned: number; sellPrice: number }[] = [];
  for (const [id, count] of Object.entries(items)) {
    if (count <= 0) continue;
    const item = allItems.get(id);
    if (!item) continue;
    if (item.tier === "legendary") continue;
    result.push({ item, owned: count, sellPrice: computeSellPrice(item.price) });
  }
  return result;
});

const maxQuantity = computed(() => {
  if (!selectedItem.value) return 1;
  if (activeTab.value === "buy") return 99;
  const entry = sellableItems.value.find((e) => e.item.id === selectedItem.value!.id);
  return entry?.owned ?? 1;
});

const totalCost = computed(() => {
  if (!selectedItem.value) return 0;
  return selectedItem.value.price * quantity.value;
});

const totalGain = computed(() => {
  if (!selectedItem.value) return 0;
  return computeSellPrice(selectedItem.value.price) * quantity.value;
});

const canAfford = computed(() => playerMoney.value >= totalCost.value);

function selectItem(item: ItemContent) {
  selectedItem.value = item;
  quantity.value = 1;
}

function switchTab(tab: "buy" | "sell") {
  activeTab.value = tab;
  selectedItem.value = null;
  quantity.value = 1;
  feedbackMessage.value = "";
}

function openBuyConfirm() {
  if (!selectedItem.value || !canAfford.value) return;
  pendingAction.value = "buy";
  confirmItemName.value = selectedItem.value.name;
  confirmQuantity.value = quantity.value;
  confirmTotal.value = totalCost.value;
  showConfirm.value = true;
}

function openSellConfirm() {
  if (!selectedItem.value) return;
  pendingAction.value = "sell";
  confirmItemName.value = selectedItem.value.name;
  confirmQuantity.value = quantity.value;
  confirmTotal.value = totalGain.value;
  showConfirm.value = true;
}

async function confirmAction() {
  if (!selectedItem.value || !pendingAction.value) return;

  if (pendingAction.value === "buy") {
    const result = await sessionStore.shopBuyItem(selectedItem.value.id, quantity.value);
    if (result.success) {
      feedbackMessage.value = `购买成功！消耗 ${result.totalCost} 金币`;
    } else {
      feedbackMessage.value = `购买失败：${result.error}`;
    }
  } else {
    const result = await sessionStore.shopSellItem(selectedItem.value.id, quantity.value);
    if (result.success) {
      feedbackMessage.value = `出售成功！获得 ${result.totalGain} 金币`;
    } else {
      feedbackMessage.value = `出售失败：${result.error}`;
    }
  }

  showConfirm.value = false;
  pendingAction.value = null;
  selectedItem.value = null;
  quantity.value = 1;
}

function cancelConfirm() {
  showConfirm.value = false;
  pendingAction.value = null;
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
    aria-label="商店"
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
          <i class="fas fa-store mr-2"></i>商店
        </h2>
        <div class="flex items-center gap-4">
          <span class="flex items-center gap-1 text-yellow-700 font-bold">
            <i class="fas fa-coins"></i>
            {{ playerMoney }}
          </span>
          <button
            class="text-gray-500 hover:text-gray-700 text-xl"
            @click="closeOverlay"
            aria-label="关闭"
          >
            <i class="fas fa-times"></i>
          </button>
        </div>
      </div>

      <div class="flex border-b border-gray-200">
        <button
          class="flex-1 py-2 font-semibold transition"
          :class="activeTab === 'buy' ? 'bg-blue-100 text-blue-700 border-b-2 border-blue-600' : 'text-gray-500 hover:bg-gray-100'"
          @click="switchTab('buy')"
        >
          <i class="fas fa-shopping-cart mr-1"></i> 购买
        </button>
        <button
          class="flex-1 py-2 font-semibold transition"
          :class="activeTab === 'sell' ? 'bg-green-100 text-green-700 border-b-2 border-green-600' : 'text-gray-500 hover:bg-gray-100'"
          @click="switchTab('sell')"
        >
          <i class="fas fa-handshake mr-1"></i> 出售
        </button>
      </div>

      <div v-if="feedbackMessage" class="px-4 py-2 bg-blue-50 text-blue-800 text-sm">
        {{ feedbackMessage }}
      </div>

      <div class="flex flex-1 overflow-hidden">
        <div class="w-1/2 overflow-y-auto p-4 border-r border-gray-200">
          <div v-if="activeTab === 'buy'">
            <div v-if="buyableItems.length === 0" class="text-center text-gray-400 py-8">
              <p>无可购买的商品</p>
            </div>
            <ul class="space-y-1">
              <li
                v-for="item in buyableItems"
                :key="item.id"
                class="flex items-center justify-between p-2 rounded-lg cursor-pointer transition"
                :class="selectedItem?.id === item.id ? 'bg-blue-100' : 'hover:bg-gray-100'"
                @click="selectItem(item)"
              >
                <span class="text-sm text-gray-800">{{ item.name }}</span>
                <span class="flex items-center gap-1 text-sm text-yellow-700">
                  <i class="fas fa-coins text-xs"></i>
                  {{ item.price }}
                </span>
              </li>
            </ul>
          </div>

          <div v-if="activeTab === 'sell'">
            <div v-if="sellableItems.length === 0" class="text-center text-gray-400 py-8">
              <i class="fas fa-box-open text-3xl mb-2"></i>
              <p>无可出售的道具</p>
            </div>
            <ul class="space-y-1">
              <li
                v-for="entry in sellableItems"
                :key="entry.item.id"
                class="flex items-center justify-between p-2 rounded-lg cursor-pointer transition"
                :class="selectedItem?.id === entry.item.id ? 'bg-green-100' : 'hover:bg-gray-100'"
                @click="selectItem(entry.item)"
              >
                <div class="flex flex-col">
                  <span class="text-sm text-gray-800">{{ entry.item.name }}</span>
                  <span class="text-xs text-gray-400">持有 ×{{ entry.owned }}</span>
                </div>
                <span class="flex items-center gap-1 text-sm text-green-700">
                  <i class="fas fa-coins text-xs"></i>
                  {{ entry.sellPrice }}
                </span>
              </li>
            </ul>
          </div>
        </div>

        <div class="w-1/2 overflow-y-auto p-4">
          <div v-if="selectedItem">
            <ItemDetailPanel
              :item="selectedItem"
              :sell-price="activeTab === 'sell' ? computeSellPrice(selectedItem.price) : undefined"
            />

            <div class="mt-4">
              <label class="block text-sm font-semibold text-gray-600 mb-1">数量</label>
              <div class="flex items-center gap-2">
                <input
                  type="number"
                  v-model.number="quantity"
                  :min="1"
                  :max="maxQuantity"
                  class="w-20 px-2 py-1 border border-gray-300 rounded-lg text-sm"
                />
                <span class="text-xs text-gray-400">（最大 {{ maxQuantity }}）</span>
              </div>
            </div>

            <div class="mt-4 flex items-center justify-between">
              <span class="text-sm text-gray-600">
                {{ activeTab === "buy" ? "总计" : "获得" }}：
                <span :class="activeTab === 'buy' ? 'text-yellow-700' : 'text-green-700'" class="font-bold">
                  <i class="fas fa-coins text-xs"></i>
                  {{ activeTab === "buy" ? totalCost : totalGain }}
                </span>
              </span>

              <button
                v-if="activeTab === 'buy'"
                class="px-4 py-2 rounded-lg font-semibold transition"
                :class="canAfford ? 'bg-blue-600 text-white hover:bg-blue-700' : 'bg-gray-300 text-gray-500 cursor-not-allowed'"
                :disabled="!canAfford"
                @click="openBuyConfirm"
              >
                购买
              </button>
              <button
                v-else
                class="px-4 py-2 rounded-lg bg-green-600 text-white font-semibold hover:bg-green-700"
                @click="openSellConfirm"
              >
                出售
              </button>
            </div>

            <p v-if="activeTab === 'buy' && !canAfford" class="mt-2 text-xs text-red-500">
              金币不足
            </p>
          </div>

          <div v-else class="text-center text-gray-400 py-8">
            <i class="fas fa-hand-pointer text-3xl mb-2"></i>
            <p>选择一个商品</p>
          </div>
        </div>
      </div>
    </div>

    <div
      v-if="showConfirm"
      class="fixed inset-0 z-60 flex items-center justify-center bg-black/50"
      @click.self="cancelConfirm"
    >
      <div class="bg-white rounded-lg shadow-xl p-6 max-w-sm">
        <p class="text-gray-800 mb-2">
          {{ pendingAction === "buy" ? "确认购买" : "确认出售" }}
        </p>
        <p class="text-sm text-gray-600 mb-1">{{ confirmItemName }} × {{ confirmQuantity }}</p>
        <p class="text-sm font-semibold mb-4" :class="pendingAction === 'buy' ? 'text-yellow-700' : 'text-green-700'">
          {{ pendingAction === "buy" ? "消耗" : "获得" }}：{{ confirmTotal }} 金币
        </p>
        <div class="flex gap-3 justify-end">
          <button
            class="px-4 py-2 rounded-lg bg-gray-200 text-gray-700 hover:bg-gray-300"
            @click="cancelConfirm"
          >
            取消
          </button>
          <button
            class="px-4 py-2 rounded-lg text-white"
            :class="pendingAction === 'buy' ? 'bg-blue-600 hover:bg-blue-700' : 'bg-green-600 hover:bg-green-700'"
            @click="confirmAction"
          >
            确认
          </button>
        </div>
      </div>
    </div>
  </section>
</template>
