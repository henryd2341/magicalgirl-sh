import type { GameVariablesRoot, VariablePathPatch } from "@/types/variables";

function createVariableError(code: string, message: string): Error {
  return new Error(`[${code}] ${message}`);
}

export function createDefaultGameVariablesRoot(): GameVariablesRoot {
  return {
    schemaVersion: "4.0.0",
    world: {
      time: {
        displayText: "9月15日 周二 上午",
        dayIndex: 1,
        timeSlot: "上午",
      },
      location: {
        id: "prologue_classroom",
        name: "教室",
        description: "晨会前的教室还带着一点雨水气味。",
      },
      affairs: {},
      flags: {},
    },
    player: {
      profile: {
        name: "",
        age: 16,
        gender: "女",
      },
      combat: {
        level: 1,
        exp: 0,
        hp: {
          current: 20,
          max: 20,
        },
        mp: {
          current: 10,
          max: 10,
        },
        attack: 5,
        defense: 5,
        agility: 5,
        intelligence: 5,
      },
      money: 0,
      equipment: {
        accessory: null,
      },
      relationships: {},
      flags: {},
    },
    characters: {},
    inventory: {
      items: {},
      battleItems: {},
    },
  };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isAllowedPath(path: string): boolean {
  return (
    [
      "world.time.displayText",
      "world.time.dayIndex",
      "world.time.timeSlot",
      "world.location.id",
      "world.location.name",
      "world.location.description",
      "player.profile.name",
      "player.profile.age",
      "player.profile.gender",
      "player.money",
    ].includes(path) ||
    path.startsWith("world.flags.") ||
    path.startsWith("player.flags.") ||
    path.startsWith("player.relationships.") ||
    path.startsWith("inventory.items.") ||
    path.startsWith("inventory.battleItems.")
  );
}

function validateRootSchema(root: GameVariablesRoot): void {
  if (root.schemaVersion !== "4.0.0") {
    throw createVariableError(
      "VARIABLE_SCHEMA_INVALID",
      "GameVariablesRoot.schemaVersion must be 4.0.0.",
    );
  }

  if (
    !isPlainObject(root.world) ||
    !isPlainObject(root.world.time) ||
    typeof root.world.time.displayText !== "string" ||
    !isPlainObject(root.world.location) ||
    typeof root.world.location.id !== "string" ||
    typeof root.world.location.name !== "string" ||
    !isPlainObject(root.world.affairs) ||
    !isPlainObject(root.world.flags)
  ) {
    throw createVariableError(
      "VARIABLE_SCHEMA_INVALID",
      "GameVariablesRoot.world structure is invalid.",
    );
  }

  if (
    !isPlainObject(root.player) ||
    !isPlainObject(root.player.profile) ||
    typeof root.player.profile.name !== "string" ||
    typeof root.player.profile.age !== "number" ||
    (root.player.profile.gender !== "男" &&
      root.player.profile.gender !== "女") ||
    !isPlainObject(root.player.combat) ||
    typeof root.player.money !== "number" ||
    !isPlainObject(root.player.equipment) ||
    !isPlainObject(root.player.relationships) ||
    !isPlainObject(root.player.flags)
  ) {
    throw createVariableError(
      "VARIABLE_SCHEMA_INVALID",
      "GameVariablesRoot.player structure is invalid.",
    );
  }

  if (!isPlainObject(root.characters)) {
    throw createVariableError(
      "VARIABLE_SCHEMA_INVALID",
      "GameVariablesRoot.characters must be an object.",
    );
  }

  if (
    !isPlainObject(root.inventory) ||
    !isPlainObject(root.inventory.items) ||
    !isPlainObject(root.inventory.battleItems)
  ) {
    throw createVariableError(
      "VARIABLE_SCHEMA_INVALID",
      "GameVariablesRoot.inventory structure is invalid.",
    );
  }
}

export function validateVariablePathPatch(
  _currentRoot: GameVariablesRoot,
  patch: VariablePathPatch,
): void {
  if (!isAllowedPath(patch.path)) {
    throw createVariableError(
      "VARIABLE_UNKNOWN_PATH",
      `Patch path is not allowed: ${patch.path}`,
    );
  }

  if (
    patch.path === "world.time.displayText" ||
    patch.path === "world.time.timeSlot" ||
    patch.path === "world.location.id" ||
    patch.path === "world.location.name" ||
    patch.path === "world.location.description" ||
    patch.path === "player.profile.name"
  ) {
    if (typeof patch.value !== "string") {
      throw createVariableError(
        "VARIABLE_SCHEMA_INVALID",
        `Patch value must be a string: ${patch.path}`,
      );
    }
    return;
  }

  if (
    patch.path === "world.time.dayIndex" ||
    patch.path === "player.profile.age"
  ) {
    if (typeof patch.value !== "number" || !Number.isInteger(patch.value)) {
      throw createVariableError(
        "VARIABLE_SCHEMA_INVALID",
        `Patch value must be an integer: ${patch.path}`,
      );
    }
    return;
  }

  if (patch.path === "player.profile.gender") {
    if (patch.value !== "男" && patch.value !== "女") {
      throw createVariableError(
        "VARIABLE_SCHEMA_INVALID",
        `Patch value must be one of 男/女: ${patch.path}`,
      );
    }
    return;
  }

  if (patch.path === "player.money") {
    if (typeof patch.value !== "number" || Number.isNaN(patch.value)) {
      throw createVariableError(
        "VARIABLE_SCHEMA_INVALID",
        `Patch value must be a number: ${patch.path}`,
      );
    }

    if (patch.value < 0) {
      throw createVariableError(
        "VARIABLE_POLICY_VIOLATION",
        `Resource value cannot be negative: ${patch.path}`,
      );
    }
    return;
  }

  if (
    patch.path.startsWith("world.flags.") ||
    patch.path.startsWith("player.flags.")
  ) {
    if (typeof patch.value !== "boolean") {
      throw createVariableError(
        "VARIABLE_SCHEMA_INVALID",
        `Flag value must be a boolean: ${patch.path}`,
      );
    }
    return;
  }

  if (patch.path.startsWith("player.relationships.")) {
    if (typeof patch.value !== "number" || !Number.isInteger(patch.value)) {
      throw createVariableError(
        "VARIABLE_SCHEMA_INVALID",
        `Relationship value must be an integer: ${patch.path}`,
      );
    }
    return;
  }

  if (
    patch.path.startsWith("inventory.items.") ||
    patch.path.startsWith("inventory.battleItems.")
  ) {
    if (
      typeof patch.value !== "number" ||
      !Number.isInteger(patch.value) ||
      patch.value < 1
    ) {
      throw createVariableError(
        "VARIABLE_POLICY_VIOLATION",
        `Inventory item quantity must be a positive integer: ${patch.path}`,
      );
    }
  }
}

export function validateGameVariablesRoot(root: GameVariablesRoot): void {
  validateRootSchema(root);

  if (root.player.money < 0) {
    throw createVariableError(
      "VARIABLE_POLICY_VIOLATION",
      "Resource value cannot be negative: player.money",
    );
  }

  for (const [characterId, relationship] of Object.entries(
    root.player.relationships,
  )) {
    if (
      !Number.isInteger(relationship) ||
      relationship < 0 ||
      relationship > 100
    ) {
      throw createVariableError(
        "VARIABLE_POLICY_VIOLATION",
        `Relationship value must be within 0-100: player.relationships.${characterId}`,
      );
    }
  }

  for (const [itemId, quantity] of Object.entries(root.inventory.items)) {
    if (!Number.isInteger(quantity) || quantity < 1) {
      throw createVariableError(
        "VARIABLE_POLICY_VIOLATION",
        `Inventory item quantity must be a positive integer: inventory.items.${itemId}`,
      );
    }
  }

  for (const [itemId, quantity] of Object.entries(root.inventory.battleItems)) {
    if (!Number.isInteger(quantity) || quantity < 1) {
      throw createVariableError(
        "VARIABLE_POLICY_VIOLATION",
        `Inventory item quantity must be a positive integer: inventory.battleItems.${itemId}`,
      );
    }

    const totalQuantity = root.inventory.items[itemId];
    if (totalQuantity === undefined || quantity > totalQuantity) {
      throw createVariableError(
        "VARIABLE_POLICY_VIOLATION",
        `Battle item quantity cannot exceed shared inventory: inventory.battleItems.${itemId}`,
      );
    }
  }
}
