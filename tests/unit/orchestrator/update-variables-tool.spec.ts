import { GameEngineFacade } from "@/engine/gameEngineFacade";
import { createSessionManager } from "@/engine/sessionManager";
import type { UpdateVariablesToolEnvelope } from "@/orchestrator/toolEnvelope";
import { ToolExecutor } from "@/orchestrator/toolExecutor";
import {
  InMemoryVariableChangeLogRepository,
  InMemoryVariableRepository,
} from "@/persistence/repositories/variableRepository";
import { describe, expect, it } from "vitest";

describe("ToolExecutor update_variables", () => {
  it("translates update_variables envelope into APPLY_VARIABLE_PATCH command and commits the next variable root", async () => {
    const variableRepository = new InMemoryVariableRepository();
    const changeLogRepository = new InMemoryVariableChangeLogRepository();
    const facade = new GameEngineFacade(createSessionManager(), {
      variableRepository,
      variableChangeLogRepository: changeLogRepository,
    });
    const executor = new ToolExecutor(facade);

    const result = await executor.execute({
      tool_name: "update_variables",
      request_id: "req-tool-update-001",
      context_version: 1,
      state_hash: "initial",
      tool_call_id: "tool-call-update-001",
      input: {
        patches: [
          {
            path: "world.location.name",
            value: "旧校舍走廊",
          },
          {
            path: "player.money",
            value: 120,
          },
        ],
      },
    } satisfies UpdateVariablesToolEnvelope);

    expect(result.ok).toBe(true);
    expect(result.tool_name).toBe("update_variables");
    expect(result.tool_call_id).toBe("tool-call-update-001");
    expect(result.commitAck).toBe(true);

    if (!result.ok) {
      throw new Error("Expected successful result.");
    }

    expect(result.output.next.root.world.location.name).toBe("旧校舍走廊");
    expect(result.output.next.root.player.money).toBe(120);
    expect((await variableRepository.getCurrent())?.version).toBe(2);
    expect(await changeLogRepository.list()).toEqual([
      expect.objectContaining({
        requestId: "req-tool-update-001",
        toolCallId: "tool-call-update-001",
      }),
    ]);
  });

  it("does not disturb the FSM session snapshot while executing update_variables outside request-state transitions", async () => {
    const facade = new GameEngineFacade(createSessionManager());
    const executor = new ToolExecutor(facade);

    await executor.execute({
      tool_name: "update_variables",
      request_id: "req-tool-update-002",
      context_version: 1,
      state_hash: "initial",
      tool_call_id: "tool-call-update-002",
      input: {
        patches: [
          {
            path: "world.time.displayText",
            value: "9月16日 周三 清晨",
          },
        ],
      },
    } satisfies UpdateVariablesToolEnvelope);

    expect(facade.getSessionSnapshot()).toMatchObject({
      sessionState: "IDLE",
      pipelineState: null,
      activeRequestId: null,
    });
  });

  it("returns a structured tool error for invalid tool input", async () => {
    const facade = new GameEngineFacade(createSessionManager());
    const executor = new ToolExecutor(facade);

    const result = await executor.execute({
      tool_name: "update_variables",
      request_id: "req-tool-update-003",
      context_version: 1,
      state_hash: "initial",
      tool_call_id: "tool-call-update-003",
      input: {
        patches: [],
      },
    } satisfies UpdateVariablesToolEnvelope);

    expect(result.ok).toBe(false);
    expect(result.tool_name).toBe("update_variables");
    expect(result.tool_call_id).toBe("tool-call-update-003");
    expect(result.commitAck).toBe(false);

    if (result.ok) {
      throw new Error("Expected failure result.");
    }

    expect(result.error.code).toBe("TOOL_INPUT_INVALID");
    expect(result.error.message).toBe(
      "[TOOL_INPUT_INVALID] update_variables input.patches must be a non-empty array.",
    );
  });

  it("maps variable policy violations into structured tool errors", async () => {
    const facade = new GameEngineFacade(createSessionManager());
    const executor = new ToolExecutor(facade);

    const result = await executor.execute({
      tool_name: "update_variables",
      request_id: "req-tool-update-004",
      context_version: 1,
      state_hash: "initial",
      tool_call_id: "tool-call-update-004",
      input: {
        patches: [
          {
            path: "player.money",
            value: -5,
          },
        ],
      },
    } satisfies UpdateVariablesToolEnvelope);

    expect(result.ok).toBe(false);
    expect(result.commitAck).toBe(false);

    if (result.ok) {
      throw new Error("Expected failure result.");
    }

    expect(result.error.code).toBe("VARIABLE_POLICY_VIOLATION");
    expect(result.error.message).toContain("player.money");
  });

  it("maps stale state_hash failures into structured tool context errors", async () => {
    const facade = new GameEngineFacade(createSessionManager());
    const executor = new ToolExecutor(facade);

    const firstResult = await executor.execute({
      tool_name: "update_variables",
      request_id: "req-tool-update-005a",
      context_version: 1,
      state_hash: "initial",
      tool_call_id: "tool-call-update-005a",
      input: {
        patches: [
          {
            path: "world.location.name",
            value: "社团楼前",
          },
        ],
      },
    } satisfies UpdateVariablesToolEnvelope);

    expect(firstResult.ok).toBe(true);

    const staleResult = await executor.execute({
      tool_name: "update_variables",
      request_id: "req-tool-update-005b",
      context_version: 1,
      state_hash: "initial",
      tool_call_id: "tool-call-update-005b",
      input: {
        patches: [
          {
            path: "world.time.displayText",
            value: "9月16日 周三 午休",
          },
        ],
      },
    } satisfies UpdateVariablesToolEnvelope);

    expect(staleResult.ok).toBe(false);
    if (staleResult.ok) {
      throw new Error("Expected failure result.");
    }
    expect(staleResult.error.code).toBe("TOOL_CONTEXT_EXPIRED");
  });

  it("maps unknown variable paths into structured tool errors", async () => {
    const facade = new GameEngineFacade(createSessionManager());
    const executor = new ToolExecutor(facade);

    const result = await executor.execute({
      tool_name: "update_variables",
      request_id: "req-tool-update-006",
      context_version: 1,
      state_hash: "initial",
      tool_call_id: "tool-call-update-006",
      input: {
        patches: [
          {
            path: "characters.heroine.displayName",
            value: "小霞",
          },
        ],
      },
    } satisfies UpdateVariablesToolEnvelope);

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("Expected failure result.");
    }
    expect(result.error.code).toBe("VARIABLE_UNKNOWN_PATH");
    expect(result.error.message).toContain("characters.heroine.displayName");
  });

  it("rejects update_variables envelopes from a stale active request", async () => {
    const variableRepository = new InMemoryVariableRepository();
    const facade = new GameEngineFacade(createSessionManager(), {
      variableRepository,
    });
    const executor = new ToolExecutor(facade);

    facade.beginAiRequest("req-active-update-007");
    const snapshotBefore = facade.getSessionSnapshot();

    const result = await executor.execute({
      tool_name: "update_variables",
      request_id: "req-stale-update-007",
      context_version: 1,
      state_hash: "initial",
      tool_call_id: "tool-call-update-007",
      input: {
        patches: [
          {
            path: "world.location.name",
            value: "不应写入的位置",
          },
        ],
      },
    } satisfies UpdateVariablesToolEnvelope);

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("Expected failure result.");
    }

    expect(result.error.code).toBe("TOOL_CONTEXT_EXPIRED");
    expect(await variableRepository.getCurrent()).toBeNull();
    expect(facade.getSessionSnapshot()).toEqual(snapshotBefore);
  });

  it("rejects duplicate successful update_variables tool calls without committing again", async () => {
    const variableRepository = new InMemoryVariableRepository();
    const changeLogRepository = new InMemoryVariableChangeLogRepository();
    const facade = new GameEngineFacade(createSessionManager(), {
      variableRepository,
      variableChangeLogRepository: changeLogRepository,
    });
    const executor = new ToolExecutor(facade);

    const firstResult = await executor.execute({
      tool_name: "update_variables",
      request_id: "req-tool-update-008",
      context_version: 1,
      state_hash: "initial",
      tool_call_id: "tool-call-update-008",
      input: {
        patches: [
          {
            path: "world.location.name",
            value: "音乐教室",
          },
        ],
      },
    } satisfies UpdateVariablesToolEnvelope);

    expect(firstResult.ok).toBe(true);
    if (!firstResult.ok) {
      throw new Error("Expected first tool call to succeed.");
    }

    const duplicateResult = await executor.execute({
      tool_name: "update_variables",
      request_id: "req-tool-update-008",
      context_version: 1,
      state_hash: firstResult.output.next.stateHash,
      tool_call_id: "tool-call-update-008",
      input: {
        patches: [
          {
            path: "world.time.displayText",
            value: "9月16日 周三 放学后",
          },
        ],
      },
    } satisfies UpdateVariablesToolEnvelope);

    expect(duplicateResult.ok).toBe(false);
    if (duplicateResult.ok) {
      throw new Error("Expected duplicate failure result.");
    }

    expect(duplicateResult.error.code).toBe("TOOL_CALL_DUPLICATE");
    expect((await variableRepository.getCurrent())?.version).toBe(2);
    expect(await changeLogRepository.list()).toHaveLength(1);
  });
});
