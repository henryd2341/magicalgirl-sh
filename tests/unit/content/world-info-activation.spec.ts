import { VariableEngine } from "@/engine/variableEngine";
import { syncPlayerGenderWorldInfoActivation } from "@/content/worldInfoActivation";
import { InMemoryVariableRepository } from "@/persistence/repositories/variableRepository";
import { InMemoryWorldInfoRepository } from "@/persistence/repositories/worldInfoRepository";
import { describe, expect, it } from "vitest";

async function createRepositories(gender: "男" | "女") {
  const variableRepository = new InMemoryVariableRepository();
  const variableState = new VariableEngine().createInitialState();
  variableState.root.player.profile.gender = gender;
  await variableRepository.saveCurrent(variableState);

  const worldInfoRepository = new InMemoryWorldInfoRepository();
  await worldInfoRepository.save({
    id: "raw_entries/男user",
    keywords: ["男user"],
    content: "男性主角档案。",
    priority: 500,
    enabled: false,
    isConstant: false,
  });
  await worldInfoRepository.save({
    id: "raw_entries/女user",
    keywords: ["女user"],
    content: "女性主角档案。",
    priority: 500,
    enabled: true,
    isConstant: false,
  });

  return { variableRepository, worldInfoRepository };
}

describe("world info dynamic activation", () => {
  it("enables only the male user entry when player gender is male", async () => {
    const { variableRepository, worldInfoRepository } =
      await createRepositories("男");

    await syncPlayerGenderWorldInfoActivation({
      variableRepository,
      worldInfoRepository,
    });

    await expect(worldInfoRepository.list()).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "raw_entries/男user",
          enabled: true,
        }),
        expect.objectContaining({
          id: "raw_entries/女user",
          enabled: false,
        }),
      ]),
    );
  });

  it("enables only the female user entry when player gender is female", async () => {
    const { variableRepository, worldInfoRepository } =
      await createRepositories("女");

    await syncPlayerGenderWorldInfoActivation({
      variableRepository,
      worldInfoRepository,
    });

    await expect(worldInfoRepository.list()).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "raw_entries/男user",
          enabled: false,
        }),
        expect.objectContaining({
          id: "raw_entries/女user",
          enabled: true,
        }),
      ]),
    );
  });

  it("skips missing gender-specific entries without failing", async () => {
    const variableRepository = new InMemoryVariableRepository();
    const variableState = new VariableEngine().createInitialState();
    variableState.root.player.profile.gender = "男";
    await variableRepository.saveCurrent(variableState);
    const worldInfoRepository = new InMemoryWorldInfoRepository();

    await expect(
      syncPlayerGenderWorldInfoActivation({
        variableRepository,
        worldInfoRepository,
      }),
    ).resolves.toBeUndefined();
    await expect(worldInfoRepository.list()).resolves.toEqual([]);
  });
});
