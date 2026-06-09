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
        name: "柚木女子学院 教室",
        description: "晨会前的教室还带着一点雨水气味。",
      },
      affairs: {},
      flags: {},
    },
    player: {
      profile: {
        name: "",
        age: 16,
        gender: "男",
        family: "",
        past: "",
      },
      combat: {
        level: 1,
        exp: 0,
        hp: {
          current: 60,
          max: 60,
        },
        mp: {
          current: 30,
          max: 30,
        },
        attack: 5,
        defense: 5,
        agility: 5,
        intelligence: 5,
        allocatedPoints: {
          attack: 0,
          defense: 0,
          agility: 0,
          intelligence: 0,
        },
        unspentPoints: 0,
      },
      money: 500,
      equipment: {
        accessory: null,
      },
      equippedSkills: [],
      relationships: {
        佐仓真央: 50,
      },
      learnedSkills: {},
      flags: {
        isNewTransfer: true,
      },
    },
    characters: {
      佐仓真央: {
        displayName: "佐仓真央",
        identity: "柚木女子学院高一 / 现役魔法少女",
        relationshipTag: "同班同学，行动小组的前辈",
        awakeningStatus: "现役",
        inParty: true,
        isVanguard: true,
        currentState: "在教室看漫画杂志",
        combat: {
          level: 1,
          exp: 0,
          hp: { current: 50, max: 50 },
          mp: { current: 40, max: 40 },
          attack: 4,
          defense: 4,
          agility: 7,
          intelligence: 7,
          allocatedPoints: {
            attack: 0,
            defense: 0,
            agility: 0,
            intelligence: 0,
          },
          unspentPoints: 0,
        },
        flags: {},
        equipment: { accessory: null },
        equippedSkills: [],
      },

      榊原琉音: {
        displayName: "榊原琉音",
        identity: "柚木女子学院初二 / 现役魔法少女",
        relationshipTag: "行动小组的资深前辈",
        awakeningStatus: "现役",
        inParty: false,
        currentState: "正常上课中",
        combat: {
          level: 50,
          exp: 0,
          hp: { current: 520, max: 300 },
          mp: { current: 410, max: 100 },
          attack: 55,
          defense: 30,
          agility: 25,
          intelligence: 55,
          allocatedPoints: {
            attack: 0,
            defense: 0,
            agility: 0,
            intelligence: 0,
          },
          unspentPoints: 0,
        },
        flags: {},
        equipment: { accessory: null },
        equippedSkills: [],
      },

      榊原千夏: {
        displayName: "榊原千夏",
        identity: "柚木女子学院初二 / 现役魔法少女",
        relationshipTag: "行动小组的资深前辈",
        awakeningStatus: "现役",
        inParty: false,
        currentState: "正常上课中",
        combat: {
          level: 50,
          exp: 0,
          hp: { current: 520, max: 20 },
          mp: { current: 410, max: 10 },
          attack: 55,
          defense: 25,
          agility: 30,
          intelligence: 55,
          allocatedPoints: {
            attack: 0,
            defense: 0,
            agility: 0,
            intelligence: 0,
          },
          unspentPoints: 0,
        },
        flags: {},
        equipment: { accessory: null },
        equippedSkills: [],
      },

      国津燕: {
        displayName: "国津燕",
        identity: "柚木女子学院高三 / 学生会长",
        relationshipTag: "学姐，校级管理者",
        awakeningStatus: "预备役",
        inParty: false,
        currentState: "在学生会室处理文件",
        combat: {
          level: 1,
          exp: 0,
          hp: { current: 50, max: 50 },
          mp: { current: 40, max: 40 },
          attack: 4,
          defense: 4,
          agility: 7,
          intelligence: 7,
          allocatedPoints: {
            attack: 0,
            defense: 0,
            agility: 0,
            intelligence: 0,
          },
          unspentPoints: 0,
        },
        flags: {},
        equipment: { accessory: null },
        equippedSkills: [],
      },

      盐田堇子: {
        displayName: "盐田堇子",
        identity: "柚木女子学院高一",
        relationshipTag: "同级生",
        awakeningStatus: "预备役",
        inParty: false,
        currentState: "在自己的座位上整理笔记",
        combat: {
          level: 1,
          exp: 0,
          hp: { current: 50, max: 50 },
          mp: { current: 40, max: 40 },
          attack: 4,
          defense: 4,
          agility: 7,
          intelligence: 7,
          allocatedPoints: {
            attack: 0,
            defense: 0,
            agility: 0,
            intelligence: 0,
          },
          unspentPoints: 0,
        },
        flags: {},
        equipment: { accessory: null },
        equippedSkills: [],
      },

      永江铃奈: {
        displayName: "永江铃奈",
        identity: "柚木女子学院高一",
        relationshipTag: "同班同学",
        awakeningStatus: "预备役",
        inParty: false,
        currentState: "在窗边望着操场发呆",
        combat: {
          level: 1,
          exp: 0,
          hp: { current: 50, max: 50 },
          mp: { current: 40, max: 40 },
          attack: 4,
          defense: 4,
          agility: 7,
          intelligence: 7,
          allocatedPoints: {
            attack: 0,
            defense: 0,
            agility: 0,
            intelligence: 0,
          },
          unspentPoints: 0,
        },
        flags: {},
        equipment: { accessory: null },
        equippedSkills: [],
      },

      青井霞: {
        displayName: "青井霞",
        identity: "初代魔法少女（退役）",
        relationshipTag: "间接知晓，未曾直接接触",
        awakeningStatus: "退役",
        inParty: false,
        currentState: "正在世界各地旅行",
        combat: null,
        flags: {},
        equipment: { accessory: null },
        equippedSkills: [],
      },

      石崎真纱: {
        displayName: "石崎真纱",
        identity: "行动小组总负责人",
        relationshipTag: "最高直属上司",
        awakeningStatus: "退役",
        inParty: false,
        currentState: "在总部处理文件",
        combat: null,
        flags: {},
        equipment: { accessory: null },
        equippedSkills: [],
      },
    },
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
      "player.money",
    ].includes(path) ||
    path.startsWith("player.profile.") ||
    path.startsWith("world.flags.") ||
    path.startsWith("player.flags.") ||
    path.startsWith("player.relationships.") ||
    path.startsWith("inventory.items.") ||
    path.startsWith("inventory.battleItems.") ||
    path.startsWith("player.learnedSkills.") ||
    (path.startsWith("characters.") &&
      (path.endsWith(".equipment.accessory") ||
        path.endsWith(".equippedSkills") ||
        path.endsWith(".inParty") ||
        path.endsWith(".isVanguard") ||
        path.endsWith(".combat.level") ||
        path.endsWith(".combat.hp.current") ||
        path.endsWith(".combat.hp.max") ||
        path.endsWith(".combat.mp.current") ||
        path.endsWith(".combat.mp.max") ||
        path.endsWith(".combat.attack") ||
        path.endsWith(".combat.defense") ||
        path.endsWith(".combat.agility") ||
        path.endsWith(".combat.intelligence") ||
        path.endsWith(".combat.allocatedPoints") ||
        path.endsWith(".combat.unspentPoints")))
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

  if (patch.path.startsWith("player.learnedSkills.")) {
    if (
      !Array.isArray(patch.value) ||
      !patch.value.every((v: unknown) => typeof v === "string")
    ) {
      throw createVariableError(
        "VARIABLE_SCHEMA_INVALID",
        `Learned skills value must be a string array: ${patch.path}`,
      );
    }
    return;
  }

  if (patch.path.endsWith(".equippedSkills")) {
    if (
      !Array.isArray(patch.value) ||
      !patch.value.every((v: unknown) => typeof v === "string")
    ) {
      throw createVariableError(
        "VARIABLE_SCHEMA_INVALID",
        `Equipped skills value must be a string array: ${patch.path}`,
      );
    }
    if (patch.value.length > 8) {
      throw createVariableError(
        "VARIABLE_POLICY_VIOLATION",
        `Equipped skills cannot exceed 8: ${patch.path}`,
      );
    }
    return;
  }

  if (patch.path.endsWith(".equipment.accessory")) {
    if (patch.value !== null && typeof patch.value !== "string") {
      throw createVariableError(
        "VARIABLE_SCHEMA_INVALID",
        `Accessory value must be a string or null: ${patch.path}`,
      );
    }
    return;
  }

  // Character boolean fields
  if (patch.path.endsWith(".inParty") || patch.path.endsWith(".isVanguard")) {
    if (typeof patch.value !== "boolean") {
      throw createVariableError(
        "VARIABLE_SCHEMA_INVALID",
        `Character flag value must be a boolean: ${patch.path}`,
      );
    }
    return;
  }

  // Character combat integer fields
  if (
    patch.path.endsWith(".combat.level") ||
    patch.path.endsWith(".combat.hp.current") ||
    patch.path.endsWith(".combat.hp.max") ||
    patch.path.endsWith(".combat.mp.current") ||
    patch.path.endsWith(".combat.mp.max") ||
    patch.path.endsWith(".combat.attack") ||
    patch.path.endsWith(".combat.defense") ||
    patch.path.endsWith(".combat.agility") ||
    patch.path.endsWith(".combat.intelligence") ||
    patch.path.endsWith(".combat.unspentPoints")
  ) {
    if (
      typeof patch.value !== "number" ||
      !Number.isInteger(patch.value) ||
      patch.value < 0
    ) {
      throw createVariableError(
        "VARIABLE_SCHEMA_INVALID",
        `Character combat value must be a non-negative integer: ${patch.path}`,
      );
    }
    return;
  }

  // Character combat.allocatedPoints object validation
  if (patch.path.endsWith(".combat.allocatedPoints")) {
    if (
      !isPlainObject(patch.value) ||
      typeof (patch.value as Record<string, unknown>).attack !== "number" ||
      typeof (patch.value as Record<string, unknown>).defense !== "number" ||
      typeof (patch.value as Record<string, unknown>).agility !== "number" ||
      typeof (patch.value as Record<string, unknown>).intelligence !== "number" ||
      !Number.isInteger((patch.value as Record<string, unknown>).attack) ||
      !Number.isInteger((patch.value as Record<string, unknown>).defense) ||
      !Number.isInteger((patch.value as Record<string, unknown>).agility) ||
      !Number.isInteger((patch.value as Record<string, unknown>).intelligence)
    ) {
      throw createVariableError(
        "VARIABLE_SCHEMA_INVALID",
        `Allocated points must be an object with non-negative integer attack/defense/agility/intelligence: ${patch.path}`,
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
