import {
  createDefaultGameVariablesRoot,
  validateVariablePathPatch,
} from "@/engine/variablePolicy";
import { describe, expect, it } from "vitest";

describe("validateVariablePathPatch", () => {
  it("rejects unknown paths outside the whitelist", () => {
    const root = createDefaultGameVariablesRoot();

    expect(() =>
      validateVariablePathPatch(root, {
        path: "world.unknown_field",
        value: "forbidden",
      }),
    ).toThrow(
      "[VARIABLE_UNKNOWN_PATH] Patch path is not allowed: world.unknown_field",
    );
  });

  it("rejects negative player money values", () => {
    const root = createDefaultGameVariablesRoot();

    expect(() =>
      validateVariablePathPatch(root, {
        path: "player.money",
        value: -1,
      }),
    ).toThrow(
      "[VARIABLE_POLICY_VIOLATION] Resource value cannot be negative: player.money",
    );
  });

  it("rejects non-integer inventory item quantities", () => {
    const root = createDefaultGameVariablesRoot();

    expect(() =>
      validateVariablePathPatch(root, {
        path: "inventory.items.potion",
        value: 1.5,
      }),
    ).toThrow(
      "[VARIABLE_POLICY_VIOLATION] Inventory item quantity must be a positive integer: inventory.items.potion",
    );
  });
});
