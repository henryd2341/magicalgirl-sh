import { getItem } from "@/content/contentRegistry";
import { VariableEngine } from "@/engine/variableEngine";
import type { VariablePatchResult, VariableValueRecord } from "@/types/variables";

const MAX_BUY_QUANTITY = 99;
const SELL_PRICE_RATIO = 0.5;

export type BuyItemError =
  | "item_not_found"
  | "not_purchasable"
  | "invalid_quantity"
  | "insufficient_money";

export type SellItemError =
  | "item_not_found"
  | "not_sellable"
  | "invalid_quantity"
  | "insufficient_stock";

export interface BuyItemResult {
  success: boolean;
  error?: BuyItemError;
  result?: VariablePatchResult;
  totalCost?: number;
}

export interface SellItemResult {
  success: boolean;
  error?: SellItemError;
  result?: VariablePatchResult;
  totalGain?: number;
}

export interface BuyItemParams {
  itemId: string;
  quantity: number;
  currentVarState: VariableValueRecord;
  variableEngine: VariableEngine;
}

export interface SellItemParams {
  itemId: string;
  quantity: number;
  currentVarState: VariableValueRecord;
  variableEngine: VariableEngine;
}

export function computeSellPrice(buyPrice: number): number {
  return Math.floor(buyPrice * SELL_PRICE_RATIO);
}

export function buyItem(params: BuyItemParams): BuyItemResult {
  const { itemId, quantity, currentVarState, variableEngine } = params;

  let item;
  try {
    item = getItem(itemId);
  } catch {
    return { success: false, error: "item_not_found" };
  }

  if (item.price <= 0) {
    return { success: false, error: "not_purchasable" };
  }

  if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_BUY_QUANTITY) {
    return { success: false, error: "invalid_quantity" };
  }

  const totalCost = item.price * quantity;
  const currentMoney = currentVarState.root.player.money;

  if (currentMoney < totalCost) {
    return { success: false, error: "insufficient_money", totalCost };
  }

  const newMoney = currentMoney - totalCost;
  const currentCount = currentVarState.root.inventory.items[itemId] ?? 0;
  const newCount = currentCount + quantity;

  const result = variableEngine.applyPatchSet({
    current: currentVarState,
    envelope: {
      request_id: `shop-buy-${itemId}-${Date.now().toString(36)}`,
      context_version: currentVarState.version,
      state_hash: currentVarState.stateHash,
      tool_call_id: `shop-buy-${itemId}-${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 8)}`,
      bypassAllowlist: true,
      patches: [
        { path: "player.money", value: newMoney },
        { path: `inventory.items.${itemId}`, value: newCount },
      ],
    },
  });

  return { success: true, result, totalCost };
}

export function sellItem(params: SellItemParams): SellItemResult {
  const { itemId, quantity, currentVarState, variableEngine } = params;

  let item;
  try {
    item = getItem(itemId);
  } catch {
    return { success: false, error: "item_not_found" };
  }

  if (item.tier === "legendary") {
    return { success: false, error: "not_sellable" };
  }

  const currentCount = currentVarState.root.inventory.items[itemId] ?? 0;

  if (!Number.isInteger(quantity) || quantity < 1) {
    return { success: false, error: "invalid_quantity" };
  }

  if (currentCount < quantity) {
    return { success: false, error: "insufficient_stock" };
  }

  const sellPrice = computeSellPrice(item.price);
  const totalGain = sellPrice * quantity;
  const newMoney = currentVarState.root.player.money + totalGain;
  const newCount = currentCount - quantity;

  const patches = [
    { path: "player.money", value: newMoney },
    { path: `inventory.items.${itemId}`, value: newCount },
  ];

  const result = variableEngine.applyPatchSet({
    current: currentVarState,
    envelope: {
      request_id: `shop-sell-${itemId}-${Date.now().toString(36)}`,
      context_version: currentVarState.version,
      state_hash: currentVarState.stateHash,
      tool_call_id: `shop-sell-${itemId}-${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 8)}`,
      bypassAllowlist: true,
      patches,
    },
  });

  return { success: true, result, totalGain };
}
