import { VariablePatchService } from "@/engine/variablePatchService";
import { InputValidationError, VariablePatchRejectedError } from "@/engine/inputValidationError";
import { VariableEngine } from "@/engine/variableEngine";
import {
  InMemoryVariableChangeLogRepository,
  InMemoryVariableRepository,
} from "@/persistence/repositories/variableRepository";
import { describe, expect, it, vi } from "vitest";

describe("VariablePatchService", () => {
  const envelope = {
    request_id: "safe-test", context_version: 1, state_hash: "initial",
    tool_call_id: "safe-call", bypassAllowlist: true,
    patches: [{ path: "player.money", value: 123 }],
  };

  it("certifies only pure validation rejection, preserving diagnostics and the original root", async () => {
    const engine = new VariableEngine();
    const current = engine.createInitialState();
    const before = structuredClone(current);
    const invalid = { ...envelope, patches: [{ path: "player.profile", value: { name: "incomplete" } }] };
    expect(() => engine.applyPatchSet({ current, envelope: invalid })).toThrow(InputValidationError);
    expect(current).toEqual(before);
    const repository = new InMemoryVariableRepository();
    await repository.saveCurrent(current);
    const logs = new InMemoryVariableChangeLogRepository();
    const save = vi.spyOn(repository, "saveCurrent");
    const append = vi.spyOn(logs, "append");
    const error = await new VariablePatchService(repository, logs).applyPatchEnvelope(invalid).catch(error => error);
    expect(error).toBeInstanceOf(VariablePatchRejectedError);
    expect(error.cause).toBeInstanceOf(InputValidationError);
    expect(error.message).toBe(error.cause.message);
    expect(error.code).toBe("VARIABLE_SCHEMA_INVALID");
    expect(save).not.toHaveBeenCalled();
    expect(append).not.toHaveBeenCalled();
    expect(await repository.getCurrent()).toEqual(before);
  });

  it.each(["read", "compute", "hash", "save-before", "save-after", "log"])(
    "does not certify %s failures or claim rollback after mutation", async stage => {
      const engine = new VariableEngine();
      const repository = new InMemoryVariableRepository();
      const logs = new InMemoryVariableChangeLogRepository();
      const error = new Error("[VARIABLE_SCHEMA_INVALID] lookalike");
      if (stage === "read") vi.spyOn(repository, "getCurrent").mockRejectedValue(error);
      if (stage === "compute") vi.spyOn(engine, "applyPatchSet").mockImplementation(() => { throw error; });
      if (stage === "save-before") vi.spyOn(repository, "saveCurrent").mockRejectedValue(new InputValidationError("VARIABLE_SCHEMA_INVALID", error.message));
      if (stage === "save-after") {
        const save = repository.saveCurrent.bind(repository);
        vi.spyOn(repository, "saveCurrent").mockImplementation(async state => { await save(state); throw error; });
      }
      if (stage === "log") vi.spyOn(logs, "append").mockRejectedValue(new InputValidationError("VARIABLE_SCHEMA_INVALID", error.message));
      const service = new VariablePatchService(repository, logs, engine);
      const thrown = await service.applyPatchEnvelope({ ...envelope, state_hash: stage === "hash" ? "stale" : "initial" }).catch(error => error);
      expect(thrown).toBeInstanceOf(Error);
      expect(thrown).not.toBeInstanceOf(VariablePatchRejectedError);
      if (stage === "hash") expect(thrown).not.toBeInstanceOf(InputValidationError);
      if (stage !== "read") {
        expect((await repository.getCurrent())?.root.player.money).toBe(
          stage === "save-after" || stage === "log" ? 123 : undefined,
        );
      }
      expect(await logs.list()).toEqual([]);
    },
  );
  it("persists next root state and appends a change log entry on successful patch commit", async () => {
    const repository = new InMemoryVariableRepository();
    const changeLogRepository = new InMemoryVariableChangeLogRepository();
    const service = new VariablePatchService(repository, changeLogRepository);

    const result = await service.applyPatchEnvelope({
      request_id: "req-service-001",
      context_version: 1,
      state_hash: "initial",
      tool_call_id: "tool-service-001",
      patches: [
        {
          path: "player.flags.met_rooftop_girl",
          value: true,
        },
      ],
    });

    expect(result.committed).toBe(true);
    expect(result.next.root.player.flags.met_rooftop_girl).toBe(true);
    expect((await repository.getCurrent())?.version).toBe(2);

    expect(await changeLogRepository.list()).toEqual([
      expect.objectContaining({
        requestId: "req-service-001",
        toolCallId: "tool-service-001",
        stateHashBefore: "initial",
        stateHashAfter: result.nextHash,
      }),
    ]);
  });

  it("rejects patch submission when the provided state hash does not match current state", async () => {
    const repository = new InMemoryVariableRepository();
    const changeLogRepository = new InMemoryVariableChangeLogRepository();
    const service = new VariablePatchService(repository, changeLogRepository);

    await expect(
      service.applyPatchEnvelope({
        request_id: "req-service-002",
        context_version: 2,
        state_hash: "stale-hash",
        tool_call_id: "tool-service-002",
        patches: [
          {
            path: "world.time.displayText",
            value: "9月15日 周二 放学后",
          },
        ],
      }),
    ).rejects.toThrow(
      "[VARIABLE_STATE_HASH_MISMATCH] Provided state_hash does not match current variable state.",
    );

    expect(await changeLogRepository.list()).toEqual([]);
  });
});
