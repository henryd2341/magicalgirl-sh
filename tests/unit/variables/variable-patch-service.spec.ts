import { VariablePatchService } from "@/engine/variablePatchService";
import {
  InMemoryVariableChangeLogRepository,
  InMemoryVariableRepository,
} from "@/persistence/repositories/variableRepository";
import { describe, expect, it } from "vitest";

describe("VariablePatchService", () => {
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
