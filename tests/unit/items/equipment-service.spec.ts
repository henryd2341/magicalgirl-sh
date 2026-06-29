import { VariableEngine } from "@/engine/variableEngine";
import {
  equipAccessory,
  unequipAccessory,
} from "@/engine/items/equipmentService";
import { createDefaultGameVariablesRoot } from "@/engine/variablePolicy";
import type { VariableValueRecord } from "@/types/variables";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/content/contentRegistry", () => ({
  getItem: vi.fn((id: string) => {
    const items: Record<string, { id: string; name: string; description: string; type: "consumable" | "accessory"; tier: "common" | "uncommon" | "rare" | "legendary"; price: number; healHp?: number; modifiers?: Record<string, number>; accessoryEffects?: string[] }> = {
      "1": { id: "1", name: "药草", description: "", type: "consumable", tier: "common", price: 5, healHp: 20 },
      "32": { id: "32", name: "力量腕带", description: "", type: "accessory", tier: "common", price: 50, modifiers: { attack: 2 } },
      "33": { id: "33", name: "力量护腕", description: "", type: "accessory", tier: "uncommon", price: 150, modifiers: { attack: 4 } },
    };
    const item = items[id];
    if (!item) throw new Error(`Item not found: "${id}"`);
    return item;
  }),
}));

function createState(overrides?: {
  money?: number;
  items?: Record<string, number>;
  playerAccessory?: string | null;
  characterAccessory?: Record<string, string | null>;
}): VariableValueRecord {
  const root = createDefaultGameVariablesRoot();
  if (overrides?.money != null) root.player.money = overrides.money;
  if (overrides?.items) root.inventory.items = overrides.items;
  if (overrides?.playerAccessory !== undefined) {
    root.player.equipment.accessory = overrides.playerAccessory;
  }
  if (overrides?.characterAccessory) {
    for (const [charId, acc] of Object.entries(overrides.characterAccessory)) {
      if (root.characters[charId]) {
        root.characters[charId].equipment = { accessory: acc };
      }
    }
  }
  return {
    rootId: "test",
    version: 1,
    stateHash: "initial",
    updatedAt: "1970-01-01T00:00:00.000Z",
    root,
  };
}

const engine = new VariableEngine();

describe("equipAccessory", () => {
  it("equips accessory to player empty slot", () => {
    const state = createState({
      items: { "32": 1 },
      playerAccessory: null,
    });
    const result = equipAccessory({
      characterId: "player",
      itemId: "32",
      currentVarState: state,
      variableEngine: engine,
    });

    expect(result.success).toBe(true);
    expect(result.swappedOutItemId).toBeUndefined();
    expect(result.result!.next.root.player.equipment.accessory).toBe("32");
    expect(result.result!.next.root.inventory.items["32"]).toBe(0);
  });

  it("equips accessory to party character empty slot", () => {
    const state = createState({
      items: { "32": 1 },
      characterAccessory: { 盐田堇子: null },
    });
    const result = equipAccessory({
      characterId: "盐田堇子",
      itemId: "32",
      currentVarState: state,
      variableEngine: engine,
    });

    expect(result.success).toBe(true);
    expect(result.result!.next.root.characters["盐田堇子"].equipment!.accessory).toBe("32");
    expect(result.result!.next.root.inventory.items["32"]).toBe(0);
  });

  it("swaps accessory when slot is occupied and returns old to inventory", () => {
    const state = createState({
      items: { "32": 1, "33": 0 },
      playerAccessory: "33",
    });
    const result = equipAccessory({
      characterId: "player",
      itemId: "32",
      currentVarState: state,
      variableEngine: engine,
    });

    expect(result.success).toBe(true);
    expect(result.swappedOutItemId).toBe("33");
    expect(result.result!.next.root.player.equipment.accessory).toBe("32");
    expect(result.result!.next.root.inventory.items["32"]).toBe(0);
    expect(result.result!.next.root.inventory.items["33"]).toBe(1);
  });

  it("fails with not_accessory for consumable items", () => {
    const state = createState({
      items: { "1": 10 },
      playerAccessory: null,
    });
    const result = equipAccessory({
      characterId: "player",
      itemId: "1",
      currentVarState: state,
      variableEngine: engine,
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe("not_accessory");
  });

  it("fails with insufficient_stock when count is 0", () => {
    const state = createState({
      items: { "32": 0 },
      playerAccessory: null,
    });
    const result = equipAccessory({
      characterId: "player",
      itemId: "32",
      currentVarState: state,
      variableEngine: engine,
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe("insufficient_stock");
  });

  it("fails with item_not_found for unknown item", () => {
    const state = createState({
      items: {},
      playerAccessory: null,
    });
    const result = equipAccessory({
      characterId: "player",
      itemId: "nonexistent",
      currentVarState: state,
      variableEngine: engine,
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe("item_not_found");
  });
});

describe("unequipAccessory", () => {
  it("unequips player accessory and returns to inventory", () => {
    const state = createState({
      items: { "32": 0 },
      playerAccessory: "32",
    });
    const result = unequipAccessory({
      characterId: "player",
      currentVarState: state,
      variableEngine: engine,
    });

    expect(result.success).toBe(true);
    expect(result.unequippedItemId).toBe("32");
    expect(result.result!.next.root.player.equipment.accessory).toBeNull();
    expect(result.result!.next.root.inventory.items["32"]).toBe(1);
  });

  it("unequips party character accessory", () => {
    const state = createState({
      items: { "32": 0 },
      characterAccessory: { 盐田堇子: "32" },
    });
    const result = unequipAccessory({
      characterId: "盐田堇子",
      currentVarState: state,
      variableEngine: engine,
    });

    expect(result.success).toBe(true);
    expect(result.unequippedItemId).toBe("32");
    expect(result.result!.next.root.characters["盐田堇子"].equipment!.accessory).toBeNull();
    expect(result.result!.next.root.inventory.items["32"]).toBe(1);
  });

  it("fails with no_accessory_equipped when slot is empty", () => {
    const state = createState({
      playerAccessory: null,
    });
    const result = unequipAccessory({
      characterId: "player",
      currentVarState: state,
      variableEngine: engine,
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe("no_accessory_equipped");
  });

  it("adds to existing inventory count when unequipping", () => {
    const state = createState({
      items: { "32": 2 },
      playerAccessory: "32",
    });
    const result = unequipAccessory({
      characterId: "player",
      currentVarState: state,
      variableEngine: engine,
    });

    expect(result.success).toBe(true);
    expect(result.result!.next.root.inventory.items["32"]).toBe(3);
  });
});
