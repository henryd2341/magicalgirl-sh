import { VariableEngine } from "@/engine/variableEngine";
import {
  buyItem,
  sellItem,
  computeSellPrice,
} from "@/engine/shop/shopTransactionService";
import { createDefaultGameVariablesRoot } from "@/engine/variablePolicy";
import type { VariableValueRecord } from "@/types/variables";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/content/contentRegistry", () => ({
  getItem: vi.fn((id: string) => {
    const items: Record<string, { id: string; name: string; description: string; type: "consumable" | "accessory"; tier: "common" | "uncommon" | "rare" | "legendary"; price: number; healHp?: number; healMp?: number; revivePercent?: number; removeStatus?: string[]; damageFixed?: number; element?: string; statusEffects?: { effectId: string; chance: number }[]; targetType?: string; modifiers?: Record<string, number>; accessoryEffects?: string[]; affinityResist?: Record<string, string>; usableInBattle?: boolean }> = {
      "1": { id: "1", name: "药草", description: "", type: "consumable", tier: "common", price: 5, healHp: 20, usableInBattle: true, targetType: "single_ally" },
      "2": { id: "2", name: "疗伤药", description: "", type: "consumable", tier: "common", price: 15, healHp: 50, usableInBattle: true, targetType: "single_ally" },
      "5": { id: "5", name: "圣灵药", description: "", type: "consumable", tier: "legendary", price: 500, healHp: 9999, usableInBattle: true, targetType: "single_ally" },
      "52": { id: "52", name: "强化戒指", description: "", type: "accessory", tier: "legendary", price: 0, accessoryEffects: ["auto_buff_start"] },
    };
    const item = items[id];
    if (!item) throw new Error(`Item not found: "${id}"`);
    return item;
  }),
}));

function createState(overrides?: {
  money?: number;
  items?: Record<string, number>;
}): VariableValueRecord {
  const root = createDefaultGameVariablesRoot();
  if (overrides?.money != null) root.player.money = overrides.money;
  if (overrides?.items) root.inventory.items = overrides.items;
  return {
    rootId: "test",
    version: 1,
    stateHash: "initial",
    updatedAt: "1970-01-01T00:00:00.000Z",
    root,
  };
}

const engine = new VariableEngine();

describe("computeSellPrice", () => {
  it("returns floor(price * 0.5)", () => {
    expect(computeSellPrice(100)).toBe(50);
    expect(computeSellPrice(15)).toBe(7);
    expect(computeSellPrice(8)).toBe(4);
    expect(computeSellPrice(1)).toBe(0);
  });
});

describe("buyItem", () => {
  it("succeeds when player has enough money", () => {
    const state = createState({ money: 1000, items: {} });
    const result = buyItem({
      itemId: "1",
      quantity: 3,
      currentVarState: state,
      variableEngine: engine,
    });

    expect(result.success).toBe(true);
    expect(result.totalCost).toBe(15);
    expect(result.result).toBeDefined();
    expect(result.result!.next.root.player.money).toBe(985);
    expect(result.result!.next.root.inventory.items["1"]).toBe(3);
  });

  it("adds to existing item count", () => {
    const state = createState({ money: 1000, items: { "1": 5 } });
    const result = buyItem({
      itemId: "1",
      quantity: 2,
      currentVarState: state,
      variableEngine: engine,
    });

    expect(result.success).toBe(true);
    expect(result.result!.next.root.inventory.items["1"]).toBe(7);
  });

  it("fails with insufficient_money when player cannot afford", () => {
    const state = createState({ money: 10, items: {} });
    const result = buyItem({
      itemId: "2",
      quantity: 1,
      currentVarState: state,
      variableEngine: engine,
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe("insufficient_money");
    expect(result.totalCost).toBe(15);
  });

  it("fails with not_purchasable for price: 0 items", () => {
    const state = createState({ money: 10000, items: {} });
    const result = buyItem({
      itemId: "52",
      quantity: 1,
      currentVarState: state,
      variableEngine: engine,
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe("not_purchasable");
  });

  it("fails with invalid_quantity for quantity 0", () => {
    const state = createState({ money: 1000, items: {} });
    const result = buyItem({
      itemId: "1",
      quantity: 0,
      currentVarState: state,
      variableEngine: engine,
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe("invalid_quantity");
  });

  it("fails with invalid_quantity for negative quantity", () => {
    const state = createState({ money: 1000, items: {} });
    const result = buyItem({
      itemId: "1",
      quantity: -1,
      currentVarState: state,
      variableEngine: engine,
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe("invalid_quantity");
  });

  it("fails with invalid_quantity for quantity > 99", () => {
    const state = createState({ money: 999999, items: {} });
    const result = buyItem({
      itemId: "1",
      quantity: 100,
      currentVarState: state,
      variableEngine: engine,
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe("invalid_quantity");
  });

  it("allows buying exactly 99", () => {
    const state = createState({ money: 999999, items: {} });
    const result = buyItem({
      itemId: "1",
      quantity: 99,
      currentVarState: state,
      variableEngine: engine,
    });

    expect(result.success).toBe(true);
    expect(result.result!.next.root.inventory.items["1"]).toBe(99);
  });

  it("fails with item_not_found for unknown item ID", () => {
    const state = createState({ money: 999999, items: {} });
    const result = buyItem({
      itemId: "nonexistent",
      quantity: 1,
      currentVarState: state,
      variableEngine: engine,
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe("item_not_found");
  });
});

describe("sellItem", () => {
  it("succeeds when player owns the item", () => {
    const state = createState({ money: 500, items: { "1": 10 } });
    const result = sellItem({
      itemId: "1",
      quantity: 3,
      currentVarState: state,
      variableEngine: engine,
    });

    expect(result.success).toBe(true);
    expect(result.totalGain).toBe(6);
    expect(result.result!.next.root.player.money).toBe(506);
    expect(result.result!.next.root.inventory.items["1"]).toBe(7);
  });

  it("succeeds selling all owned quantity", () => {
    const state = createState({ money: 500, items: { "2": 5 } });
    const result = sellItem({
      itemId: "2",
      quantity: 5,
      currentVarState: state,
      variableEngine: engine,
    });

    expect(result.success).toBe(true);
    expect(result.result!.next.root.inventory.items["2"]).toBe(0);
  });

  it("fails with not_sellable for legendary items", () => {
    const state = createState({ money: 500, items: { "5": 1 } });
    const result = sellItem({
      itemId: "5",
      quantity: 1,
      currentVarState: state,
      variableEngine: engine,
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe("not_sellable");
  });

  it("fails with insufficient_stock when selling more than owned", () => {
    const state = createState({ money: 500, items: { "1": 3 } });
    const result = sellItem({
      itemId: "1",
      quantity: 5,
      currentVarState: state,
      variableEngine: engine,
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe("insufficient_stock");
  });

  it("fails with invalid_quantity for quantity 0", () => {
    const state = createState({ money: 500, items: { "1": 10 } });
    const result = sellItem({
      itemId: "1",
      quantity: 0,
      currentVarState: state,
      variableEngine: engine,
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe("invalid_quantity");
  });

  it("fails with item_not_found for unknown item", () => {
    const state = createState({ money: 500, items: {} });
    const result = sellItem({
      itemId: "nonexistent",
      quantity: 1,
      currentVarState: state,
      variableEngine: engine,
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe("item_not_found");
  });
});
