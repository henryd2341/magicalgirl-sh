import { GameEngineFacade } from "@/engine/gameEngineFacade";
import { createSessionManager } from "@/engine/sessionManager";
import type { TriggerBattleToolEnvelope } from "@/orchestrator/toolEnvelope";
import { ToolExecutor } from "@/orchestrator/toolExecutor";
import { describe, expect, it } from "vitest";

describe("ToolExecutor trigger_battle", () => {
  it("accepts the frozen trigger_battle contract and returns a placeholder success result", async () => {
    const facade = new GameEngineFacade(createSessionManager());
    const executor = new ToolExecutor(facade);

    const result = await executor.execute({
      tool_name: "trigger_battle",
      request_id: "req-trigger-battle-001",
      context_version: 1,
      state_hash: "initial",
      tool_call_id: "tool-call-trigger-battle-001",
      input: {
        encounter_id: "enc-rooftop-shadow-001",
        enemies: [
          {
            enemy_id: "shadow-graffiti",
            count: 2,
          },
        ],
        narrative_reason: "涂鸦影魔从天台储物间的阴影里爬了出来。",
      },
    } satisfies TriggerBattleToolEnvelope);

    expect(result.ok).toBe(true);
    expect(result.tool_name).toBe("trigger_battle");
    expect(result.tool_call_id).toBe("tool-call-trigger-battle-001");
    expect(result.commitAck).toBe(true);

    if (!result.ok) {
      throw new Error("Expected successful result.");
    }

    expect(result.output.accepted).toBe(true);
    expect(result.output.battleState).toBe("pending");
    expect(result.output.encounterId).toBe("enc-rooftop-shadow-001");

    expect(facade.getSessionSnapshot()).toMatchObject({
      sessionState: "COMBAT_PENDING",
      pipelineState: null,
      activeRequestId: null,
    });
  });

  it("rejects enemy_group_id because the frozen trigger_battle contract does not allow it", async () => {
    const facade = new GameEngineFacade(createSessionManager());
    const executor = new ToolExecutor(facade);

    const result = await executor.execute({
      tool_name: "trigger_battle",
      request_id: "req-trigger-battle-002",
      context_version: 1,
      state_hash: "initial",
      tool_call_id: "tool-call-trigger-battle-002",
      input: {
        encounter_id: "enc-rooftop-shadow-002",
        enemy_group_id: "shadow_pack_alpha",
        enemies: [
          {
            enemy_id: "shadow-graffiti",
            count: 1,
          },
        ],
        narrative_reason: "错误契约测试。",
      },
    } as TriggerBattleToolEnvelope);

    expect(result.ok).toBe(false);
    expect(result.commitAck).toBe(false);

    if (result.ok) {
      throw new Error("Expected failure result.");
    }

    expect(result.error.code).toBe("TOOL_INPUT_INVALID");
    expect(result.error.message).toContain("enemy_group_id");
  });

  it("rejects level_policy because the frozen trigger_battle contract does not allow it", async () => {
    const facade = new GameEngineFacade(createSessionManager());
    const executor = new ToolExecutor(facade);

    const result = await executor.execute({
      tool_name: "trigger_battle",
      request_id: "req-trigger-battle-003",
      context_version: 1,
      state_hash: "initial",
      tool_call_id: "tool-call-trigger-battle-003",
      input: {
        encounter_id: "enc-rooftop-shadow-003",
        enemies: [
          {
            enemy_id: "shadow-graffiti",
            count: 1,
          },
        ],
        level_policy: "scale_to_player",
        narrative_reason: "错误契约测试。",
      },
    } as TriggerBattleToolEnvelope);

    expect(result.ok).toBe(false);
    expect(result.commitAck).toBe(false);

    if (result.ok) {
      throw new Error("Expected failure result.");
    }

    expect(result.error.code).toBe("TOOL_INPUT_INVALID");
    expect(result.error.message).toContain("level_policy");
  });

  it("rejects an empty enemies array in the frozen trigger_battle contract", async () => {
    const facade = new GameEngineFacade(createSessionManager());
    const executor = new ToolExecutor(facade);

    const result = await executor.execute({
      tool_name: "trigger_battle",
      request_id: "req-trigger-battle-004",
      context_version: 1,
      state_hash: "initial",
      tool_call_id: "tool-call-trigger-battle-004",
      input: {
        encounter_id: "enc-rooftop-shadow-004",
        enemies: [],
        narrative_reason: "空敌人列表测试。",
      },
    } satisfies TriggerBattleToolEnvelope);

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("Expected failure result.");
    }
    expect(result.error.code).toBe("TOOL_INPUT_INVALID");
    expect(result.error.message).toContain("enemies must be a non-empty array");
  });

  it("rejects enemy counts lower than one in the frozen trigger_battle contract", async () => {
    const facade = new GameEngineFacade(createSessionManager());
    const executor = new ToolExecutor(facade);

    const result = await executor.execute({
      tool_name: "trigger_battle",
      request_id: "req-trigger-battle-005",
      context_version: 1,
      state_hash: "initial",
      tool_call_id: "tool-call-trigger-battle-005",
      input: {
        encounter_id: "enc-rooftop-shadow-005",
        enemies: [
          {
            enemy_id: "shadow-graffiti",
            count: 0,
          },
        ],
        narrative_reason: "非法数量测试。",
      },
    } satisfies TriggerBattleToolEnvelope);

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("Expected failure result.");
    }
    expect(result.error.code).toBe("TOOL_INPUT_INVALID");
    expect(result.error.message).toContain("count must be a positive integer");
  });

  it("rejects missing narrative_reason in the frozen trigger_battle contract", async () => {
    const facade = new GameEngineFacade(createSessionManager());
    const executor = new ToolExecutor(facade);

    const result = await executor.execute({
      tool_name: "trigger_battle",
      request_id: "req-trigger-battle-006",
      context_version: 1,
      state_hash: "initial",
      tool_call_id: "tool-call-trigger-battle-006",
      input: {
        encounter_id: "enc-rooftop-shadow-006",
        enemies: [{ enemy_id: "shadow-graffiti", count: 1 }],
        narrative_reason: "",
      },
    } satisfies TriggerBattleToolEnvelope);

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("Expected failure result.");
    }
    expect(result.error.code).toBe("TOOL_INPUT_INVALID");
    expect(result.error.message).toContain("narrative_reason is required");
  });

  it("rejects non-object modifiers in the frozen trigger_battle contract", async () => {
    const facade = new GameEngineFacade(createSessionManager());
    const executor = new ToolExecutor(facade);

    const result = await executor.execute({
      tool_name: "trigger_battle",
      request_id: "req-trigger-battle-007",
      context_version: 1,
      state_hash: "initial",
      tool_call_id: "tool-call-trigger-battle-007",
      input: {
        encounter_id: "enc-rooftop-shadow-007",
        enemies: [{ enemy_id: "shadow-graffiti", count: 1 }],
        modifiers: ["nope"] as unknown as Record<string, unknown>,
        narrative_reason: "非法 modifiers 测试。",
      },
    } satisfies TriggerBattleToolEnvelope);

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("Expected failure result.");
    }
    expect(result.error.code).toBe("TOOL_INPUT_INVALID");
    expect(result.error.message).toContain("modifiers must be an object");
  });

  it("moves the FSM from GENERATING to COMBAT_PENDING when trigger_battle is accepted", async () => {
    const facade = new GameEngineFacade(createSessionManager());
    const executor = new ToolExecutor(facade);

    facade.beginAiRequest("req-pre-battle-001");

    const result = await executor.execute({
      tool_name: "trigger_battle",
      request_id: "req-trigger-battle-008",
      context_version: 1,
      state_hash: "initial",
      tool_call_id: "tool-call-trigger-battle-008",
      input: {
        encounter_id: "enc-rooftop-shadow-008",
        enemies: [{ enemy_id: "shadow-graffiti", count: 1 }],
        narrative_reason: "AI 叙事在生成阶段触发了战斗。",
      },
    } satisfies TriggerBattleToolEnvelope);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error("Expected successful result.");
    }

    expect(facade.getSessionSnapshot()).toMatchObject({
      sessionState: "COMBAT_PENDING",
      pipelineState: null,
      activeRequestId: null,
    });
  });
});
