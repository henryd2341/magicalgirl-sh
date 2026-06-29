import { getItem } from "@/content/contentRegistry";
import { VariableEngine } from "@/engine/variableEngine";
import type { VariablePatchResult, VariableValueRecord } from "@/types/variables";

const PLAYER_CHARACTER_ID = "player";

export type EquipError =
  | "item_not_found"
  | "not_accessory"
  | "insufficient_stock";

export type UnequipError =
  | "no_accessory_equipped"
  | "character_not_found";

export interface EquipAccessoryParams {
  characterId: string;
  itemId: string;
  currentVarState: VariableValueRecord;
  variableEngine: VariableEngine;
}

export interface UnequipAccessoryParams {
  characterId: string;
  currentVarState: VariableValueRecord;
  variableEngine: VariableEngine;
}

export interface EquipAccessoryResult {
  success: boolean;
  error?: EquipError;
  result?: VariablePatchResult;
  swappedOutItemId?: string;
}

export interface UnequipAccessoryResult {
  success: boolean;
  error?: UnequipError;
  result?: VariablePatchResult;
  unequippedItemId?: string;
}

function getEquipmentPath(characterId: string): string {
  if (characterId === PLAYER_CHARACTER_ID) {
    return "player.equipment.accessory";
  }
  return `characters.${characterId}.equipment.accessory`;
}

function getCurrentEquippedAccessory(
  varState: VariableValueRecord,
  characterId: string,
): string | null {
  if (characterId === PLAYER_CHARACTER_ID) {
    return varState.root.player.equipment.accessory;
  }
  return varState.root.characters[characterId]?.equipment?.accessory ?? null;
}

export function equipAccessory(
  params: EquipAccessoryParams,
): EquipAccessoryResult {
  const { characterId, itemId, currentVarState, variableEngine } = params;

  let item;
  try {
    item = getItem(itemId);
  } catch {
    return { success: false, error: "item_not_found" };
  }

  if (item.type !== "accessory") {
    return { success: false, error: "not_accessory" };
  }

  const currentCount = currentVarState.root.inventory.items[itemId] ?? 0;
  if (currentCount < 1) {
    return { success: false, error: "insufficient_stock" };
  }

  const equipmentPath = getEquipmentPath(characterId);
  const currentlyEquipped = getCurrentEquippedAccessory(currentVarState, characterId);

  const patches: { path: string; value: unknown }[] = [];

  patches.push({
    path: `inventory.items.${itemId}`,
    value: currentCount - 1,
  });

  if (currentlyEquipped != null) {
    const prevAccessoryCount = currentVarState.root.inventory.items[currentlyEquipped] ?? 0;
    patches.push({
      path: `inventory.items.${currentlyEquipped}`,
      value: prevAccessoryCount + 1,
    });
  }

  patches.push({
    path: equipmentPath,
    value: itemId,
  });

  const result = variableEngine.applyPatchSet({
    current: currentVarState,
    envelope: {
      request_id: `equip-${characterId}-${itemId}-${Date.now().toString(36)}`,
      context_version: currentVarState.version,
      state_hash: currentVarState.stateHash,
      tool_call_id: `equip-${characterId}-${itemId}-${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 8)}`,
      bypassAllowlist: true,
      patches,
    },
  });

  return {
    success: true,
    result,
    swappedOutItemId: currentlyEquipped ?? undefined,
  };
}

export function unequipAccessory(
  params: UnequipAccessoryParams,
): UnequipAccessoryResult {
  const { characterId, currentVarState, variableEngine } = params;

  const equipmentPath = getEquipmentPath(characterId);
  const currentlyEquipped = getCurrentEquippedAccessory(currentVarState, characterId);

  if (currentlyEquipped == null) {
    return { success: false, error: "no_accessory_equipped" };
  }

  if (characterId !== PLAYER_CHARACTER_ID) {
    const character = currentVarState.root.characters[characterId];
    if (!character) {
      return { success: false, error: "character_not_found" };
    }
  }

  const currentCount = currentVarState.root.inventory.items[currentlyEquipped] ?? 0;

  const patches: { path: string; value: unknown }[] = [
    {
      path: `inventory.items.${currentlyEquipped}`,
      value: currentCount + 1,
    },
    {
      path: equipmentPath,
      value: null,
    },
  ];

  const result = variableEngine.applyPatchSet({
    current: currentVarState,
    envelope: {
      request_id: `unequip-${characterId}-${Date.now().toString(36)}`,
      context_version: currentVarState.version,
      state_hash: currentVarState.stateHash,
      tool_call_id: `unequip-${characterId}-${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 8)}`,
      bypassAllowlist: true,
      patches,
    },
  });

  return {
    success: true,
    result,
    unequippedItemId: currentlyEquipped,
  };
}
