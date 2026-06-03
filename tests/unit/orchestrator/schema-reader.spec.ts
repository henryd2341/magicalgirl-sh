import { describe, it, expect } from "vitest";
import {
  getAccessAtPath,
  isContextVisible,
  getWritablePaths,
  getReadOnlyPaths,
} from "@/orchestrator/schemaReader";

describe("schemaReader", () => {
  it("returns read_write for player.money", () => {
    expect(getAccessAtPath("player.money")).toBe("read_write");
  });

  it("returns read_only for player.combat.level", () => {
    expect(getAccessAtPath("player.combat.level")).toBe("read_only");
  });

  it("returns hidden for schemaVersion", () => {
    expect(getAccessAtPath("schemaVersion")).toBe("hidden");
  });

  it("isContextVisible returns false for allocatedPoints", () => {
    expect(isContextVisible("player.combat.allocatedPoints")).toBe(false);
  });

  it("isContextVisible returns false for unspentPoints", () => {
    expect(isContextVisible("player.combat.unspentPoints")).toBe(false);
  });

  it("isContextVisible returns false for player.combat.level (combatStats now hidden)", () => {
    expect(isContextVisible("player.combat.level")).toBe(false);
  });

  it("isContextVisible returns false for character equipment (mid-path wildcard)", () => {
    expect(isContextVisible("characters.npc1.equipment.accessory")).toBe(false);
  });

  it("isContextVisible returns false for character equippedSkills (mid-path wildcard)", () => {
    expect(isContextVisible("characters.npc1.equippedSkills")).toBe(false);
  });

  it("getWritablePaths includes player.money", () => {
    const writable = getWritablePaths();
    expect(writable.some((p) => p.includes("player.money"))).toBe(true);
  });

  it("getWritablePaths includes player.profile paths", () => {
    const writable = getWritablePaths();
    expect(writable.some((p) => p.includes("player.profile.name"))).toBe(true);
  });

  it("getReadOnlyPaths excludes combat paths (combatStats now hidden)", () => {
    const readOnly = getReadOnlyPaths();
    expect(readOnly.some((p) => p.includes("player.combat"))).toBe(false);
  });

  it("getAccessAtPath resolves dynamic-key relationships path", () => {
    expect(getAccessAtPath("player.relationships.npc1")).toBe("read_write");
  });

  it("resolves annotations through $ref (combatStats → player.combat.attack)", () => {
    expect(getAccessAtPath("player.combat.attack")).toBe("read_only");
  });

  it("resolves oneOf branches for character combat (combatStats $ref branch)", () => {
    expect(getAccessAtPath("characters.npc1.combat.level")).toBe("read_only");
  });
});
