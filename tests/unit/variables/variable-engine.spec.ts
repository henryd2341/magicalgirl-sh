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

  it("initializes player flags with isNewTransfer", () => {
    const engine = new VariableEngine();
    const state = engine.createInitialState();

    expect(state.root.player.flags.isNewTransfer).toBe(true);
  });

  it("initializes player.relationships with 佐仓真央 at 50", () => {
    const engine = new VariableEngine();
    const state = engine.createInitialState();

    expect(state.root.player.relationships["佐仓真央"]).toBe(50);
  });
});

  it("initializes all 8 known characters with expected fields", () => {
    const engine = new VariableEngine();
    const state = engine.createInitialState();
    const ids = [
      "佐仓真央",
      "榊原琉音",
      "榊原千夏",
      "国津燕",
      "盐田堇子",
      "永江铃奈",
      "青井霞",
      "石崎真纱",
    ];

    expect(Object.keys(state.root.characters)).toHaveLength(8);

    for (const id of ids) {
      const char = state.root.characters[id];
      expect(char).toBeDefined();
      expect(char.displayName).toBeTruthy();
      expect(char.identity).toBeTruthy();
      expect(typeof char.awakeningStatus).toBe("string");
      expect(typeof char.inParty).toBe("boolean");
    }
  });

  it("only 佐仓真央 is inParty", () => {
    const engine = new VariableEngine();
    const state = engine.createInitialState();

    expect(state.root.characters["佐仓真央"].inParty).toBe(true);
    expect(state.root.characters["榊原琉音"].inParty).toBe(false);
    expect(state.root.characters["榊原千夏"].inParty).toBe(false);
    expect(state.root.characters["国津燕"].inParty).toBe(false);
    expect(state.root.characters["盐田堇子"].inParty).toBe(false);
    expect(state.root.characters["永江铃奈"].inParty).toBe(false);
    expect(state.root.characters["青井霞"].inParty).toBe(false);
    expect(state.root.characters["石崎真纱"].inParty).toBe(false);
  });

  it("sets combat to null for retired characters", () => {
    const engine = new VariableEngine();
    const state = engine.createInitialState();

    expect(state.root.characters["青井霞"].combat).toBeNull();
    expect(state.root.characters["石崎真纱"].combat).toBeNull();
  });

  it("active and reserve characters share the player combat template", () => {
    const engine = new VariableEngine();
    const state = engine.createInitialState();

    const activeOrReserve = [
      "佐仓真央",
      "榊原琉音",
      "榊原千夏",
      "国津燕",
      "盐田堇子",
      "永江铃奈",
    ];

    for (const id of activeOrReserve) {
      const combat = state.root.characters[id].combat;
      expect(combat).not.toBeNull();
      expect(combat?.level).toBe(1);
      expect(combat?.hp.max).toBe(20);
      expect(combat?.mp.max).toBe(10);
    }
  });
