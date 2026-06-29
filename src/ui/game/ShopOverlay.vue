<script setup lang="ts">
import { getAllItems } from '@/content/contentRegistry';
import { computeSellPrice } from '@/engine/shop/shopTransactionService';
import { useSessionStore } from '@/stores/sessionStore';
import type { ItemContent } from '@/types/content';
import type { VariableValueRecord } from '@/types/variables';
import ItemDetailPanel from '@/ui/game/ItemDetailPanel.vue';
import { computed, onErrorCaptured, onMounted, ref, watch } from "vue";

const emit = defineEmits<{ close: [] }>();

const sessionStore = useSessionStore();

const allItems = (() => {
  try {
    return getAllItems();
  } catch (err) {
    console.error('[ShopOverlay] Failed to load items:', err);
    return new Map<string, ItemContent>();
  }
})();

const activeTab = ref<'buy' | 'sell'>('buy');
const selectedItem = ref<ItemContent | null>(null);
const quantity = ref(1);
const showConfirm = ref(false);
const pendingAction = ref<'buy' | 'sell' | null>(null);
const confirmItemName = ref('');
const confirmQuantity = ref(0);
const confirmTotal = ref(0);
const feedbackMessage = ref('');

const varState = ref<VariableValueRecord | null>(null);
const mounted = ref(false);
const setupError = ref<string | null>(null);

onErrorCaptured(err => {
  console.error('[ShopOverlay]', err);
  setupError.value = err instanceof Error ? err.message : String(err);
  return false;
});

onMounted(async () => {
  try {
    varState.value = await sessionStore.getVariableSnapshot();
    mounted.value = true;
  } catch (err) {
    console.error('[ShopOverlay] init failed:', err);
    setupError.value = err instanceof Error ? err.message : String(err);
  }
});

watch(
  () => sessionStore.variableVersion,
  async () => {
    varState.value = await sessionStore.getVariableSnapshot();
  },
);

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
    if (item.tier === 'legendary') continue;
    result.push({ item, owned: count, sellPrice: computeSellPrice(item.price) });
  }
  return result;
});

const maxQuantity = computed(() => {
  if (!selectedItem.value) return 1;
  if (activeTab.value === 'buy') return 99;
  const entry = sellableItems.value.find(e => e.item.id === selectedItem.value!.id);
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

const tabIndicatorStyle = computed(() => ({
  left: activeTab.value === "buy" ? "0" : "50%",
  width: "50%",
}));

function selectItem(item: ItemContent) {
  selectedItem.value = item;
  quantity.value = 1;
}

function switchTab(tab: 'buy' | 'sell') {
  activeTab.value = tab;
  selectedItem.value = null;
  quantity.value = 1;
  feedbackMessage.value = '';
}

function openBuyConfirm() {
  if (!selectedItem.value || !canAfford.value) return;
  pendingAction.value = 'buy';
  confirmItemName.value = selectedItem.value.name;
  confirmQuantity.value = quantity.value;
  confirmTotal.value = totalCost.value;
  showConfirm.value = true;
}

function openSellConfirm() {
  if (!selectedItem.value) return;
  pendingAction.value = 'sell';
  confirmItemName.value = selectedItem.value.name;
  confirmQuantity.value = quantity.value;
  confirmTotal.value = totalGain.value;
  showConfirm.value = true;
}

async function confirmAction() {
  if (!selectedItem.value || !pendingAction.value) return;

  if (pendingAction.value === 'buy') {
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
  emit('close');
}
</script>

<template>
  <div class="mg-modal-overlay" role="dialog" aria-modal="true" aria-label="商店" @click.self="closeOverlay">
    <!-- Error state -->
    <div v-if="setupError" class="mg-modal-card shop-overlay__error">
      <button class="mg-modal__close" @click="closeOverlay">
        <i class="fas fa-times"></i>
      </button>
      <h2 class="mg-modal__title"><i class="fas fa-exclamation-triangle"></i> 加载失败</h2>
      <div class="mg-modal__body">
        <p class="shop-overlay__error-msg">{{ setupError }}</p>
        <button class="mg-btn mg-btn--sm mg-btn--primary" @click="closeOverlay">关闭</button>
      </div>
    </div>

    <!-- Normal state -->
    <div v-else class="mg-modal-card mg-modal-card--wide shop-overlay">
      <button class="mg-modal__close" @click="closeOverlay">
        <i class="fas fa-times"></i>
      </button>
      <h2 class="mg-modal__title"><i class="fas fa-store"></i> 商店</h2>

      <!-- Coin balance -->
      <div class="shop-overlay__balance">
        <i class="fas fa-coins shop-overlay__balance-icon"></i>
        <span class="shop-overlay__balance-amount">{{ playerMoney }}</span>
      </div>

      <!-- Tabs -->
      <div class="shop-overlay__tabs">
        <button
          class="shop-overlay__tab"
          :class="{ 'shop-overlay__tab--active': activeTab === 'buy' }"
          @click="switchTab('buy')"
        >
          <i class="fas fa-shopping-cart"></i> 购买
        </button>
        <button
          class="shop-overlay__tab"
          :class="{ 'shop-overlay__tab--active': activeTab === 'sell' }"
          @click="switchTab('sell')"
        >
          <i class="fas fa-handshake"></i> 出售
        </button>
        <div class="shop-overlay__tab-indicator" :style="tabIndicatorStyle"></div>
      </div>

      <!-- Feedback -->
      <div v-if="feedbackMessage" class="shop-overlay__feedback">
        {{ feedbackMessage }}
      </div>

      <div class="mg-modal__body mg-scroll shop-overlay__body">
        <div class="shop-overlay__panels">
          <!-- Left: item list -->
          <div class="shop-overlay__left">
            <!-- Buy tab -->
            <div v-if="activeTab === 'buy'">
              <div v-if="buyableItems.length === 0" class="shop-overlay__empty">
                <p>无可购买的商品</p>
              </div>
              <ul v-else class="shop-overlay__list">
                <li
                  v-for="item in buyableItems"
                  :key="item.id"
                  class="shop-overlay__item"
                  :class="{ 'shop-overlay__item--active': selectedItem?.id === item.id }"
                  @click="selectItem(item)"
                >
                  <span class="shop-overlay__item-name">{{ item.name }}</span>
                  <span class="shop-overlay__item-price shop-overlay__item-price--buy">
                    <i class="fas fa-coins"></i>
                    {{ item.price }}
                  </span>
                </li>
              </ul>
            </div>

            <!-- Sell tab -->
            <div v-if="activeTab === 'sell'">
              <div v-if="sellableItems.length === 0" class="shop-overlay__empty">
                <i class="fas fa-box-open shop-overlay__empty-icon"></i>
                <p>无可出售的道具</p>
              </div>
              <ul v-else class="shop-overlay__list">
                <li
                  v-for="entry in sellableItems"
                  :key="entry.item.id"
                  class="shop-overlay__item"
                  :class="{ 'shop-overlay__item--active': selectedItem?.id === entry.item.id }"
                  @click="selectItem(entry.item)"
                >
                  <div class="shop-overlay__item-info">
                    <span class="shop-overlay__item-name">{{ entry.item.name }}</span>
                    <span class="shop-overlay__item-owned">持有 ×{{ entry.owned }}</span>
                  </div>
                  <span class="shop-overlay__item-price shop-overlay__item-price--sell">
                    <i class="fas fa-coins"></i>
                    {{ entry.sellPrice }}
                  </span>
                </li>
              </ul>
            </div>
          </div>

          <!-- Right: detail + purchase -->
          <div class="shop-overlay__right">
            <div v-if="selectedItem" class="shop-overlay__detail">
              <ItemDetailPanel
                :item="selectedItem"
                :sell-price="activeTab === 'sell' ? computeSellPrice(selectedItem.price) : undefined"
              />

              <!-- Quantity selector -->
              <div class="shop-overlay__quantity">
                <label class="shop-overlay__quantity-label">数量</label>
                <div class="shop-overlay__quantity-row">
                  <input
                    type="number"
                    v-model.number="quantity"
                    :min="1"
                    :max="maxQuantity"
                    class="mg-input shop-overlay__quantity-input"
                  />
                  <span class="shop-overlay__quantity-max">（最大 {{ maxQuantity }}）</span>
                </div>
              </div>

              <!-- Total + action -->
              <div class="shop-overlay__action-row">
                <span class="shop-overlay__total">
                  <span class="shop-overlay__total-label"> {{ activeTab === 'buy' ? '总计' : '获得' }}： </span>
                  <span
                    class="shop-overlay__total-amount"
                    :class="
                      activeTab === 'buy' ? 'shop-overlay__total-amount--buy' : 'shop-overlay__total-amount--sell'
                    "
                  >
                    <i class="fas fa-coins"></i>
                    {{ activeTab === 'buy' ? totalCost : totalGain }}
                  </span>
                </span>

                <button
                  v-if="activeTab === 'buy'"
                  class="mg-btn mg-btn--sm mg-btn--primary"
                  :class="{ 'shop-overlay__btn--disabled': !canAfford }"
                  :disabled="!canAfford"
                  @click="openBuyConfirm"
                >
                  购买
                </button>
                <button v-else class="mg-btn mg-btn--sm shop-overlay__btn-sell" @click="openSellConfirm">出售</button>
              </div>

              <p v-if="activeTab === 'buy' && !canAfford" class="shop-overlay__insufficient">金币不足</p>
            </div>

            <div v-else class="shop-overlay__empty-right">
              <i class="fas fa-hand-pointer"></i>
              <p>选择一个商品</p>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Purchase/Sell confirmation dialog -->
    <div v-if="showConfirm" class="mg-modal-overlay" @click.self="cancelConfirm">
      <div class="mg-modal-card shop-overlay__confirm">
        <h2 class="mg-modal__title">
          <i :class="pendingAction === 'buy' ? 'fas fa-shopping-cart' : 'fas fa-handshake'"></i>
          {{ pendingAction === 'buy' ? '确认购买' : '确认出售' }}
        </h2>
        <div class="mg-modal__body">
          <p class="shop-overlay__confirm-item">{{ confirmItemName }} × {{ confirmQuantity }}</p>
          <p
            class="shop-overlay__confirm-total"
            :class="pendingAction === 'buy' ? 'shop-overlay__total-amount--buy' : 'shop-overlay__total-amount--sell'"
          >
            {{ pendingAction === 'buy' ? '消耗' : '获得' }}：<i class="fas fa-coins"></i> {{ confirmTotal }} 金币
          </p>
          <div class="shop-overlay__confirm-actions">
            <button class="mg-btn mg-btn--sm mg-btn--ghost" @click="cancelConfirm">取消</button>
            <button
              class="mg-btn mg-btn--sm"
              :class="pendingAction === 'buy' ? 'mg-btn--primary' : 'shop-overlay__btn-sell-confirm'"
              @click="confirmAction"
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
.shop-overlay {
  max-width: 720px;
  max-height: 85vh;
  display: flex;
  flex-direction: column;
}

.shop-overlay__error {
  max-width: 360px;
}

.shop-overlay__error-msg {
  font-size: var(--mg-font-sm);
  color: var(--mg-text-secondary);
  margin: 0 0 var(--mg-space-md);
}

.shop-overlay__balance {
  display: flex;
  align-items: center;
  gap: var(--mg-space-sm, 8px);
  padding: 0 var(--mg-space-lg, 24px);
  margin-bottom: var(--mg-space-sm, 8px);
}

.shop-overlay__balance-icon {
  color: var(--mg-warning, #ffd600);
  font-size: var(--mg-font-lg);
}

.shop-overlay__balance-amount {
  font-family: var(--mg-font-heading);
  font-size: var(--mg-font-lg);
  font-weight: var(--mg-font-weight-heading);
  color: var(--mg-text);
}

.shop-overlay__tabs {
  position: relative;
  display: flex;
  border-bottom: var(--mg-border-width, 1px) solid var(--mg-border, rgba(255, 255, 255, 0.1));
  margin: 0 var(--mg-space-lg, 24px);
}

.shop-overlay__tab {
  flex: 1;
  padding: var(--mg-space-sm, 8px) var(--mg-space-md, 16px);
  border: none;
  background: transparent;
  color: var(--mg-text-muted);
  font-family: var(--mg-font-heading);
  font-size: var(--mg-font-md, 0.9rem);
  font-weight: 600;
  cursor: pointer;
  transition:
    color var(--mg-transition-fast, 0.15s ease),
    background var(--mg-transition-base, 0.25s ease);

  i {
    margin-right: 4px;
  }

  &:hover {
    color: var(--mg-text);
    background: var(--mg-surface-pink, rgba(255, 107, 157, 0.06));
  }
}

.shop-overlay__tab--active {
  color: var(--mg-accent);
  background: var(--mg-surface-pink, rgba(255, 107, 157, 0.08));
}

.shop-overlay__tab-indicator {
  position: absolute;
  bottom: 0;
  height: 2px;
  border-radius: 1px;
  background: var(--mg-accent);
  pointer-events: none;
  transition:
    left var(--mg-transition-base, 0.25s ease),
    width var(--mg-transition-base, 0.25s ease);
}

.shop-overlay__feedback {
  margin: var(--mg-space-sm, 8px) var(--mg-space-lg, 24px) 0;
  padding: var(--mg-space-sm, 8px) var(--mg-space-md, 12px);
  border-radius: var(--mg-radius-sm, 8px);
  background: var(--mg-surface-pink, rgba(255, 107, 157, 0.08));
  border: var(--mg-border-width, 1px) solid var(--mg-accent-subtle, rgba(255, 107, 157, 0.2));
  font-size: var(--mg-font-sm, 0.8rem);
  color: var(--mg-text);
}

.shop-overlay__body {
  flex: 1;
  min-height: 0;
}

.shop-overlay__panels {
  display: flex;
  flex: 1;
  min-height: 0;
}

.shop-overlay__left {
  width: 50%;
  border-right: var(--mg-border-width, 1px) solid var(--mg-border, rgba(255, 255, 255, 0.1));
  padding: var(--mg-space-md, 16px);
  overflow-y: auto;
}

.shop-overlay__right {
  width: 50%;
  padding: var(--mg-space-md, 16px);
  overflow-y: auto;
}

.shop-overlay__empty {
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

.shop-overlay__empty-icon {
  font-size: 2rem;
  opacity: 0.4;
  margin-bottom: var(--mg-space-sm, 8px);
}

.shop-overlay__empty-right {
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

.shop-overlay__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.shop-overlay__item {
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

.shop-overlay__item--active {
  border-color: var(--mg-accent);
  background: var(--mg-surface-pink, rgba(255, 107, 157, 0.12));
  box-shadow: var(--mg-glow-pink);
}

.shop-overlay__item-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.shop-overlay__item-name {
  font-size: var(--mg-font-md, 0.9rem);
  font-weight: 600;
  color: var(--mg-text);
}

.shop-overlay__item-owned {
  font-size: var(--mg-font-xs, 0.7rem);
  color: var(--mg-text-muted);
}

.shop-overlay__item-price {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: var(--mg-font-sm, 0.8rem);
  font-weight: 700;
  font-family: var(--mg-font-heading);
  color: var(--mg-text);
  white-space: nowrap;

  i {
    font-size: var(--mg-font-xs, 0.7rem);
  }
}

.shop-overlay__item-price--buy i {
  color: var(--mg-warning, #ffd600);
}

.shop-overlay__item-price--sell i {
  color: var(--mg-success, #7bed9f);
}

.shop-overlay__detail {
  margin-bottom: var(--mg-space-md, 16px);
}

.shop-overlay__quantity {
  margin-top: var(--mg-space-md, 16px);
}

.shop-overlay__quantity-label {
  display: block;
  font-family: var(--mg-font-heading);
  font-size: var(--mg-font-sm, 0.8rem);
  font-weight: 700;
  color: var(--mg-text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  margin-bottom: var(--mg-space-sm, 8px);
}

.shop-overlay__quantity-row {
  display: flex;
  align-items: center;
  gap: var(--mg-space-sm, 8px);
}

.shop-overlay__quantity-input {
  width: 80px;
}

.shop-overlay__quantity-max {
  font-size: var(--mg-font-xs, 0.7rem);
  color: var(--mg-text-muted);
}

.shop-overlay__action-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: var(--mg-space-md, 16px);
}

.shop-overlay__total {
  display: flex;
  align-items: center;
  gap: 4px;
}

.shop-overlay__total-label {
  font-size: var(--mg-font-sm, 0.8rem);
  color: var(--mg-text-secondary);
}

.shop-overlay__total-amount {
  font-family: var(--mg-font-heading);
  font-size: var(--mg-font-base);
  font-weight: 700;
  color: var(--mg-text);

  i {
    font-size: var(--mg-font-xs, 0.7rem);
    margin-right: 2px;
  }
}

.shop-overlay__total-amount--buy {
  i {
    color: var(--mg-warning, #ffd600);
  }
}

.shop-overlay__total-amount--sell {
  i {
    color: var(--mg-success, #7bed9f);
  }
}

.shop-overlay__btn-sell {
  color: var(--mg-text-on-accent, #fff);
  background: var(--mg-success, #7bed9f);
  border-color: var(--mg-success, #7bed9f);

  &:hover {
    opacity: 0.85;
  }
}

.shop-overlay__btn--disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.shop-overlay__btn-sell-confirm {
  color: var(--mg-text-on-accent, #fff);
  background: var(--mg-success, #7bed9f);
  border-color: var(--mg-success, #7bed9f);

  &:hover {
    opacity: 0.85;
  }
}

.shop-overlay__insufficient {
  margin: var(--mg-space-sm, 8px) 0 0;
  font-size: var(--mg-font-xs, 0.7rem);
  color: var(--mg-error, #ff4757);
}

.shop-overlay__confirm {
  max-width: 360px;
}

.shop-overlay__confirm-item {
  font-size: var(--mg-font-base);
  color: var(--mg-text-secondary);
  margin: 0 0 var(--mg-space-xs, 4px);
}

.shop-overlay__confirm-total {
  font-size: var(--mg-font-base);
  font-weight: 600;
  margin: 0 0 var(--mg-space-md, 16px);

  i {
    font-size: var(--mg-font-xs, 0.7rem);
    margin-right: 2px;
  }
}

.shop-overlay__confirm-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--mg-space-sm, 8px);
}
</style>
