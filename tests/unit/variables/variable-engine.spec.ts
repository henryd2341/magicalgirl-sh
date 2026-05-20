import { VariableEngine } from "@/engine/variableEngine";
import { describe, expect, it } from "vitest";

describe("VariableEngine", () => {
  it("applies a single whitelisted path patch and increments version", () => {
    const engine = new VariableEngine();

    const result = engine.applyPatchSet({
      current: engine.createInitialState(),
      envelope: {
        request_id: "req-variable-001",
        context_version: 1,
        state_hash: "initial",
        tool_call_id: "tool-variable-001",
        patches: [
          {
            path: "world.location.name",
            value: "天台",
          },
        ],
      },
    });

    expect(result.next.version).toBe(2);
    expect(result.next.root.world.location.name).toBe("天台");
    expect(result.nextHash).not.toBe("initial");
  });

  it("applies multiple patches sequentially to the same root tree", () => {
    const engine = new VariableEngine();

    const result = engine.applyPatchSet({
      current: engine.createInitialState(),
      envelope: {
        request_id: "req-variable-002",
        context_version: 1,
        state_hash: "initial",
        tool_call_id: "tool-variable-002",
        patches: [
          {
            path: "world.location.id",
            value: "school_rooftop",
          },
          {
            path: "world.time.displayText",
            value: "9月15日 周二 上午",
          },
          {
            path: "player.flags.met_rooftop_girl",
            value: true,
          },
        ],
      },
    });

    expect(result.next.root.world.location.id).toBe("school_rooftop");
    expect(result.next.root.world.time.displayText).toBe("9月15日 周二 上午");
    expect(result.next.root.player.flags.met_rooftop_girl).toBe(true);
  });

  it("rejects the whole patch set when any patch violates policy", () => {
    const engine = new VariableEngine();
    const current = engine.createInitialState();

    expect(() =>
      engine.applyPatchSet({
        current,
        envelope: {
          request_id: "req-variable-003",
          context_version: 1,
          state_hash: "initial",
          tool_call_id: "tool-variable-003",
          patches: [
            {
              path: "world.location.name",
              value: "电玩厅",
            },
            {
              path: "player.money",
              value: -9,
            },
          ],
        },
      }),
    ).toThrow(
      "[VARIABLE_POLICY_VIOLATION] Resource value cannot be negative: player.money",
    );

    expect(current.root.world.location.name).toBe("教室");
    expect(current.root.player.money).toBe(0);
  });
});
