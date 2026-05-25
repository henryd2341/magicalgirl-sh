import { ensureVariableState } from "@/engine/variableStateBootstrap";
import { VariableEngine } from "@/engine/variableEngine";
import { InMemoryVariableRepository } from "@/persistence/repositories/variableRepository";
import { describe, expect, it } from "vitest";

describe("ensureVariableState", () => {
  it("creates and saves the default variable record when the repository is empty", async () => {
    const repository = new InMemoryVariableRepository();

    const record = await ensureVariableState(repository, {
      now: () => "2026-05-25T13:00:00.000Z",
    });

    expect(record).toMatchObject({
      rootId: "game_variables_root",
      version: 1,
      stateHash: "initial",
      updatedAt: "2026-05-25T13:00:00.000Z",
    });
    expect(await repository.getCurrent()).toEqual(record);
  });

  it("returns the existing variable record without overwriting it", async () => {
    const repository = new InMemoryVariableRepository();
    const existing = {
      ...new VariableEngine().createInitialState(),
      rootId: "existing-root",
      stateHash: "existing-hash",
      updatedAt: "2026-05-25T12:00:00.000Z",
    };
    await repository.saveCurrent(existing);

    const record = await ensureVariableState(repository, {
      now: () => "2026-05-25T13:00:00.000Z",
    });

    expect(record).toEqual(existing);
    expect(await repository.getCurrent()).toEqual(existing);
  });
});
