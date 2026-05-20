import { GameEngineFacade } from "@/engine/gameEngineFacade";
import { createSessionManager } from "@/engine/sessionManager";
import {
  InMemoryVariableChangeLogRepository,
  InMemoryVariableRepository,
} from "@/persistence/repositories/variableRepository";
import { describe, expect, it } from "vitest";

describe("GameEngineFacade variable integration", () => {
  it("applies variable patch envelopes through the unified engine entrypoint and persists the next root tree", async () => {
    const variableRepository = new InMemoryVariableRepository();
    const changeLogRepository = new InMemoryVariableChangeLogRepository();
    const facade = new GameEngineFacade(createSessionManager(), {
      variableRepository,
      variableChangeLogRepository: changeLogRepository,
    });

    const result = await facade.applyVariablePatchEnvelope({
      request_id: "req-facade-variable-001",
      context_version: 1,
      state_hash: "initial",
      tool_call_id: "tool-facade-variable-001",
      patches: [
        {
          path: "world.location.name",
          value: "天台",
        },
        {
          path: "player.flags.met_rooftop_girl",
          value: true,
        },
      ],
    });

    expect(result.committed).toBe(true);
    expect(result.next.root.world.location.name).toBe("天台");
    expect(result.next.root.player.flags.met_rooftop_girl).toBe(true);
    expect((await variableRepository.getCurrent())?.version).toBe(2);
    expect(await changeLogRepository.list()).toEqual([
      expect.objectContaining({
        requestId: "req-facade-variable-001",
        toolCallId: "tool-facade-variable-001",
      }),
    ]);
  });

  it("does not disturb session state when variable patches are committed outside the request FSM flow", async () => {
    const facade = new GameEngineFacade(createSessionManager());

    await facade.applyVariablePatchEnvelope({
      request_id: "req-facade-variable-002",
      context_version: 1,
      state_hash: "initial",
      tool_call_id: "tool-facade-variable-002",
      patches: [
        {
          path: "world.time.displayText",
          value: "9月15日 周二 放学后",
        },
      ],
    });

    expect(facade.getSessionSnapshot()).toMatchObject({
      sessionState: "IDLE",
      pipelineState: null,
      activeRequestId: null,
    });
  });
});
