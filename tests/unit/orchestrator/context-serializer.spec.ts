import { describe, it, expect } from "vitest";
import { serializeVariableStateToYaml } from "@/orchestrator/contextSerializer";
import { isContextVisible } from "@/orchestrator/schemaReader";
import { VariableEngine } from "@/engine/variableEngine";

describe("serializeVariableStateToYaml", () => {
  function makeState() {
    return new VariableEngine().createInitialState().root;
  }

  it("isContextVisible returns false for character combat allocatedPoints", () => {
    // Verify schemaReader mid-path wildcard works before testing serializer
    const state = makeState();
    const charIds = Object.keys(state.characters);
    if (charIds.length > 0) {
      const path = `characters.${charIds[0]}.combat.allocatedPoints`;
      expect(isContextVisible(path)).toBe(false);
    }
  });

  it("produces nested YAML with 游戏状态快照 header", () => {
    const state = makeState();
    const result = serializeVariableStateToYaml(state);
    expect(result).toContain("游戏状态快照:");
  });

  it("includes read_write annotation on player.money", () => {
    const state = makeState();
    state.player.money = 500;
    const result = serializeVariableStateToYaml(state);
    expect(result).toContain("# read_write");
  });

  it("includes read_only annotation on combat stats", () => {
    const state = makeState();
    const result = serializeVariableStateToYaml(state);
    expect(result).toContain("# read_only");
  });

  it("excludes allocatedPoints (x-aiContext: false)", () => {
    const state = makeState();
    state.player.combat.allocatedPoints = {
      attack: 3,
      defense: 2,
      agility: 1,
      intelligence: 0,
    };
    const result = serializeVariableStateToYaml(state);
    // allocatedPoints should not appear at the top level of player.combat rendering
    const playerCombatSection = result.split("player:").pop() ?? "";
    expect(playerCombatSection).not.toContain("allocatedPoints");
  });

  it("excludes schemaVersion (x-aiAccess: hidden)", () => {
    const state = makeState();
    const result = serializeVariableStateToYaml(state);
    expect(result).not.toContain("schemaVersion");
  });

  it("renders last_value for numeric changed fields", () => {
    const state = makeState();
    state.player.money = 500;
    const prevValues = new Map<string, unknown>();
    prevValues.set("player.money", 300);
    const result = serializeVariableStateToYaml(state, prevValues);
    expect(result).toContain('last_value="300"');
  });

  it("does NOT render last_value for string fields", () => {
    const state = makeState();
    state.player.profile.name = "测试";
    const prevValues = new Map<string, unknown>();
    prevValues.set("player.profile.name", "旧名");
    const result = serializeVariableStateToYaml(state, prevValues);
    expect(result).not.toContain('last_value="旧名"');
  });

  it("does NOT render last_value for non-changed numeric fields", () => {
    const state = makeState();
    state.player.money = 500;
    state.player.combat.level = 5;
    const prevValues = new Map<string, unknown>();
    prevValues.set("player.money", 300);
    const result = serializeVariableStateToYaml(state, prevValues);
    expect(result).toContain("money: 500  # read_write, last_value=\"300\"");
    expect(result).not.toContain("level: 5  # read_only, last_value");
  });

  it("renders nested objects with proper indentation", () => {
    const state = makeState();
    state.player.profile.name = "测试角色";
    const result = serializeVariableStateToYaml(state);
    const lines = result.split("\n");
    const nameLine = lines.find((l) => l.includes("name:"));
    expect(nameLine).toBeDefined();
    expect(nameLine!).toMatch(/^\s{4,}name:/);
  });

  it("renders dynamic-key inventory items", () => {
    const state = makeState();
    state.inventory.items = { 药草: 5, 解毒剂: 2 };
    const result = serializeVariableStateToYaml(state);
    expect(result).toContain("药草: 5");
    expect(result).toContain("解毒剂: 2");
  });

  it("renders empty objects as {}", () => {
    const state = makeState();
    state.inventory.items = {};
    const result = serializeVariableStateToYaml(state);
    expect(result).toContain("{}");
  });
});
