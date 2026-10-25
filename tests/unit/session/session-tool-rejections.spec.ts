import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useSessionStore } from "@/stores/sessionStore";
import { useBattleStore } from "@/stores/battleStore";
import { InMemoryVariableRepository } from "@/persistence/repositories/variableRepository";
import { InputValidationError, VariablePatchRejectedError } from "@/engine/inputValidationError";
import type { FakeToolCall } from "@/orchestrator/providerClient";

const fake = vi.hoisted(() => ({ calls: [] as FakeToolCall[] }));
vi.mock("@/orchestrator/providerSettings", async importOriginal => {
  const actual = await importOriginal<typeof import("@/orchestrator/providerSettings")>();
  const { FakeStreamingProviderClient } = await import("@/orchestrator/providerClient");
  return { ...actual, createConfiguredProviderClient: async (
    _repository: unknown, _deps: unknown,
    onExecuteTools: ConstructorParameters<typeof FakeStreamingProviderClient>[0]["onExecuteTools"],
  ) => ({ client: new FakeStreamingProviderClient({ textChunks: ["Synthetic story."], toolCalls: fake.calls, onExecuteTools }), providerInfo: { name: "fake", kind: "fake", model: "fake" } }) };
});

beforeEach(() => { setActivePinia(createPinia()); fake.calls = []; });
afterEach(() => vi.restoreAllMocks());

describe("configured fake execution boundary", () => {
  it.each(["structure", "update-input", "battle-input", "skill-input", "save", "battle-callback", "missing-skill", "unsupported"])(
    "%s retains its real write boundary", async scenario => {
      const session = useSessionStore();
      await session.executeUpdateVariables({ tool_name: "update_variables", request_id: "seed", tool_call_id: "seed", context_version: 1, state_hash: "initial", input: { patches: [{ path: "player.money", value: 100 }] } });
      const before = await session.getVariableSnapshot();
      const save = vi.spyOn(InMemoryVariableRepository.prototype, "saveCurrent");
      const stage = vi.spyOn(useBattleStore(), "stagePendingEncounter");
      const error = new InputValidationError("VARIABLE_SCHEMA_INVALID", "[VARIABLE_SCHEMA_INVALID] downstream failure");
      if (scenario === "save") save.mockRejectedValueOnce(error);
      if (scenario === "battle-callback") stage.mockImplementation(() => {
        throw new VariablePatchRejectedError(error);
      });
      const calls: Record<string, FakeToolCall> = {
        structure: { tool_name: "update_variables", input: { patches: [{ path: "player.profile", value: { name: "incomplete" } }] } },
        "update-input": { tool_name: "update_variables", input: { patches: [] } },
        "battle-input": { tool_name: "trigger_battle", input: { enemies: [] } },
        "skill-input": { tool_name: "read_skill", input: { name: "" } },
        save: { tool_name: "update_variables", input: { patches: [{ path: "player.money", value: 200 }] } },
        "battle-callback": { tool_name: "trigger_battle", input: { encounter_id: "synthetic", enemies: [{ enemy_id: "1", count: 1 }], narrative_reason: "test" } },
        "missing-skill": { tool_name: "read_skill", input: { name: "nonexistent-synthetic-skill" } },
        unsupported: { tool_name: "unknown", input: {} },
      };
      fake.calls = [calls[scenario]];
      const result = await session.runStoryTurn("continue");
      const safe = ["structure", "update-input", "battle-input", "skill-input"].includes(scenario);
      expect(result.ok).toBe(safe);
      expect(result.toolResults[0]).toMatchObject({ ok: false });
      expect(result.toolResults[0].failureKind).toBe(safe ? "input-rejected-before-write" : undefined);
      if (scenario === "save" || scenario === "battle-callback") expect(result.toolResults[0].error).toBe(error.message);
      expect(session.snapshot.sessionState).toBe(safe ? "IDLE" : "ERROR_RECOVERY");
      expect(await session.getVariableSnapshot()).toEqual(before);
      expect(save).toHaveBeenCalledTimes(scenario === "save" ? 1 : 0);
      expect(stage).toHaveBeenCalledTimes(scenario === "battle-callback" ? 1 : 0);
    },
  );

  it("retains a safe rejection before a real successful fake update", async () => {
    const session = useSessionStore();
    await session.executeUpdateVariables({ tool_name: "update_variables", request_id: "seed", tool_call_id: "seed", context_version: 1, state_hash: "initial", input: { patches: [{ path: "player.money", value: 100 }] } });
    const save = vi.spyOn(InMemoryVariableRepository.prototype, "saveCurrent");
    fake.calls = [
      { tool_name: "update_variables", input: { patches: [{ path: "player.profile", value: { name: "incomplete" } }] } },
      { tool_name: "update_variables", input: { patches: [{ path: "player.money", value: 200 }] } },
    ];
    const result = await session.runStoryTurn("continue");
    expect(result.ok).toBe(true);
    expect(result.toolResults.map(result => result.ok)).toEqual([false, true]);
    expect(save).toHaveBeenCalledTimes(1);
    expect((await session.getVariableSnapshot())?.root.player.money).toBe(200);
  });
});
