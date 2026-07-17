import { VariableEngine } from "@/engine/variableEngine";
import {
  DbWorkerClient,
  createInProcessDbWorkerEndpoint,
} from "@/persistence/dbClient";
import { DbVariableRepository } from "@/persistence/repositories/variableRepository";
import { useSessionStore } from "@/stores/sessionStore";
import { createDbWorkerRuntime } from "@/workers/db.worker";
import { createPinia, setActivePinia } from "pinia";
import { describe, expect, it } from "vitest";

describe("sessionStore persistence hydration", () => {
  it("hydrates learned skills when attaching an existing save database", async () => {
    const client = new DbWorkerClient(
      createInProcessDbWorkerEndpoint(createDbWorkerRuntime()),
    );
    await client.initialize();
    const variables = new VariableEngine().createInitialState();
    variables.root.player.learnedSkills.player = ["10"];
    variables.root.player.equippedSkills = ["10"];
    await new DbVariableRepository(client).saveCurrent(variables);

    setActivePinia(createPinia());
    const sessionStore = useSessionStore();
    await sessionStore.configurePersistence({ client });

    expect(sessionStore.isSkillLearned("player", "10")).toBe(true);
  });
});