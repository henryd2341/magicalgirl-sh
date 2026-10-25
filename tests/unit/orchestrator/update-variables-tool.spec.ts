import { GameEngineFacade } from "@/engine/gameEngineFacade";
import { createSessionManager } from "@/engine/sessionManager";
import { InMemoryToolCallExecutionLedger } from "@/engine/idempotencyService";
import { InputValidationError } from "@/engine/inputValidationError";
import type { UpdateVariablesToolEnvelope } from "@/orchestrator/toolEnvelope";
import { ToolExecutor } from "@/orchestrator/toolExecutor";
import {
  InMemoryVariableChangeLogRepository,
  InMemoryVariableRepository,
} from "@/persistence/repositories/variableRepository";
import { describe, expect, it, vi } from "vitest";

describe("ToolExecutor update_variables", () => {
  const base = { tool_name: "update_variables" as const, request_id: "request", context_version: 1, state_hash: "initial", tool_call_id: "tool" };

  it("rejects invalid input and root structure without save, log or success ledger writes; a later update succeeds", async () => {
    const variables = new InMemoryVariableRepository();
    const logs = new InMemoryVariableChangeLogRepository();
    const ledger = new InMemoryToolCallExecutionLedger();
    const save = vi.spyOn(variables, "saveCurrent");
    const append = vi.spyOn(logs, "append");
    const record = vi.spyOn(ledger, "recordSuccess");
    const facade = new GameEngineFacade(createSessionManager(), { variableRepository: variables, variableChangeLogRepository: logs });
    const executor = new ToolExecutor(facade, { idempotencyLedger: ledger });
    for (const input of [{ patches: [] }, { patches: [{ path: "player.profile", value: { name: "incomplete" } }] }]) {
      expect(await executor.execute({ ...base, input })).toMatchObject({ ok: false, commitAck: false, failureKind: "input-rejected-before-write" });
    }
    expect(save).not.toHaveBeenCalled();
    expect(append).not.toHaveBeenCalled();
    expect(record).not.toHaveBeenCalled();
    expect(await executor.execute({ ...base, input: { patches: [{ path: "player.money", value: 10 }] } })).toMatchObject({ ok: true });
    expect(save).toHaveBeenCalledTimes(1);
    expect(append).toHaveBeenCalledTimes(1);
    expect(record).toHaveBeenCalledTimes(1);
  });

  it.each(["envelope", "unsupported", "hash", "request", "duplicate", "ledger-read", "ledger-write", "save", "skill-missing"])(
    "keeps %s failures fatal, including typed errors after writes", async stage => {
      const variables = new InMemoryVariableRepository();
      const logs = new InMemoryVariableChangeLogRepository();
      const ledger = new InMemoryToolCallExecutionLedger();
      const facade = new GameEngineFacade(createSessionManager(), { variableRepository: variables, variableChangeLogRepository: logs });
      const executor = new ToolExecutor(facade, { idempotencyLedger: ledger });
      const error = new InputValidationError("VARIABLE_SCHEMA_INVALID", "[VARIABLE_SCHEMA_INVALID] failure after validation");
      if (stage === "request") facade.beginAiRequest("different-request");
      if (stage === "duplicate") await ledger.recordSuccess({ toolCallId: "tool", requestId: "request", toolName: "update_variables", recordedAt: "now" });
      if (stage === "ledger-read") vi.spyOn(ledger, "hasSucceeded").mockRejectedValue(error);
      if (stage === "ledger-write") vi.spyOn(ledger, "recordSuccess").mockRejectedValue(error);
      if (stage === "save") vi.spyOn(variables, "saveCurrent").mockRejectedValue(error);
      const result = await executor.execute({
        ...base,
        ...(stage === "envelope" ? { tool_call_id: "" } : {}),
        ...(stage === "hash" ? { state_hash: "stale" } : {}),
        tool_name: stage === "unsupported" ? "unknown" : stage === "skill-missing" ? "read_skill" : "update_variables",
        input: stage === "skill-missing" ? { name: "missing-synthetic-skill" } : { patches: [{ path: "player.money", value: 10 }] },
      });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.failureKind).toBeUndefined();
      if (stage === "ledger-write") expect((await variables.getCurrent())?.root.player.money).toBe(10);
    },
  );

  it.each(["update_variables", "trigger_battle", "read_skill"].flatMap(toolName =>
    ["hash", "request", "duplicate", "ledger-read", "state-read"].map(stage => ({ toolName, stage })),
  ))("keeps $stage fatal when $toolName input is also invalid", async ({ toolName, stage }) => {
    const variables = new InMemoryVariableRepository();
    const logs = new InMemoryVariableChangeLogRepository();
    const ledger = new InMemoryToolCallExecutionLedger();
    const facade = new GameEngineFacade(createSessionManager(), { variableRepository: variables, variableChangeLogRepository: logs });
    if (stage === "request") facade.beginAiRequest("different-request");
    if (stage === "duplicate") await ledger.recordSuccess({ toolCallId: "tool", requestId: "request", toolName, recordedAt: "now" });
    const error = new InputValidationError("VARIABLE_SCHEMA_INVALID", "[VARIABLE_SCHEMA_INVALID] context read failed");
    if (stage === "ledger-read") vi.spyOn(ledger, "hasSucceeded").mockRejectedValue(error);
    if (stage === "state-read") vi.spyOn(variables, "getCurrent").mockRejectedValue(error);
    const dispatch = vi.spyOn(facade, "dispatchCommand");
    const save = vi.spyOn(variables, "saveCurrent");
    const append = vi.spyOn(logs, "append");
    const record = vi.spyOn(ledger, "recordSuccess");
    const result = await new ToolExecutor(facade, { idempotencyLedger: ledger }).execute({
      ...base,
      tool_name: toolName,
      state_hash: stage === "hash" ? "stale" : "initial",
      input: {},
    });
    expect(result).toMatchObject({
      ok: false,
      commitAck: false,
      error: { code: stage === "duplicate" ? "TOOL_CALL_DUPLICATE" : stage.endsWith("read") ? "VARIABLE_SCHEMA_INVALID" : "TOOL_CONTEXT_EXPIRED" },
    });
    if (!result.ok) expect(result.failureKind).toBeUndefined();
    expect(dispatch).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
    expect(append).not.toHaveBeenCalled();
    expect(record).not.toHaveBeenCalled();
  });

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
            value: 100,
          },
          { path: "world.flags.visited", value: false },
          { path: "world.location", value: { id: "roof", name: "旧校舍走廊", description: "雨后" } },
          { path: "player.money", value: 120 },
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

    expect(result.output.patches).toEqual([{ path: "world.location.name", value: "旧校舍走廊" }, { path: "player.money", value: 100 }, { path: "world.flags.visited", value: false }, { path: "world.location", value: { id: "roof", name: "旧校舍走廊", description: "雨后" } }, { path: "player.money", value: 120 }]);
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
