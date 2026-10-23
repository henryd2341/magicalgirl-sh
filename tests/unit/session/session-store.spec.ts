import type { VariableRepository } from "@/persistence/repositories/variableRepository";
import { useBattleStore } from "@/stores/battleStore";
import { useSessionStore } from "@/stores/sessionStore";
import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getCharacter: _getCharacter, getAllCharacterIds: _getAllIds } =
  vi.hoisted(() => ({
    getCharacter: vi.fn(),
    getAllCharacterIds: vi.fn(() => ["char1"]),
  }));

vi.mock("@/content/contentRegistry", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/content/contentRegistry")>();
  return {
    ...actual,
    getCharacter: _getCharacter,
    getCharacterByName: _getCharacter,
    getAllCharacterIds: _getAllIds,
  };
});

const mockVarRepo: VariableRepository = {
  getCurrent: vi.fn(),
  saveCurrent: vi.fn(),
} as unknown as VariableRepository;

vi.mock(
  "@/persistence/repositories/variableRepository",
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import("@/persistence/repositories/variableRepository")
      >();
    return {
      ...actual,
      InMemoryVariableRepository: vi.fn(() => mockVarRepo),
    };
  },
);

function makeChar(overrides: Record<string, unknown> = {}) {
  return {
    id: "char1",
    name: "Test",
    affinities: { weak: [], resist: [], nullify: [], reflect: [], absorb: [] },
    growthId: "player",
    innateSkills: [],
    skillTree: [],
    ...overrides,
  };
}


function deepMerge(source: Record<string, unknown>, target: Record<string, unknown> = {}): Record<string, unknown> {
  const result = { ...source };
  for (const key of Object.keys(target)) {
    const srcVal = source[key];
    const tgtVal = target[key];
    if (tgtVal != null && typeof tgtVal === "object" && !Array.isArray(tgtVal) && srcVal != null && typeof srcVal === "object" && !Array.isArray(srcVal)) {
      result[key] = deepMerge(srcVal as Record<string, unknown>, tgtVal as Record<string, unknown>);
    } else {
      result[key] = tgtVal;
    }
  }
  return result;
}

function makeVarState(overrides: Record<string, unknown> = {}) {
  return {
    rootId: "test-root",
    version: 1,
    stateHash: "initial",
    updatedAt: "2025-01-01T00:00:00.000Z",
    root: deepMerge({
      schemaVersion: "4.0.0" as const,
      world: {
        time: { displayText: "" },
        location: { id: "", name: "" },
        affairs: {},
        flags: {},
      },
      player: {
        profile: { name: "", age: 16, gender: "女" as const },
        combat: {
          level: 10,
          exp: 0,
          hp: { current: 100, max: 100 },
          mp: { current: 50, max: 50 },
          attack: 5,
          defense: 5,
          agility: 5,
          intelligence: 5,
          allocatedPoints: {
            attack: 0,
            defense: 0,
            agility: 0,
            intelligence: 0,
          },
          unspentPoints: 0,
        },
        money: 1000,
        equipment: { accessory: null },
        relationships: {},
        learnedSkills: {},
        flags: {},
      },
      characters: {},
      inventory: { items: {}, battleItems: {} },
    }, overrides) as Record<string, unknown>,
  };
}

describe("sessionStore", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    _getCharacter.mockReturnValue(makeChar());
  });

  // ── existing tests ──

  it("rejects pending combat cancellation outside COMBAT_PENDING without clearing active battle state", () => {
    const sessionStore = useSessionStore();
    const battleStore = useBattleStore();

    battleStore.activeBattle = {
      encounterId: "enc-active-preserved",
      lifecycleState: "ACTIVE",
      phase: "PLAYER_COMMAND",
      turnCount: 1,
      participants: [],
      pressTurn: { ownerSide: "player", icons: [] },
      currentActorId: null,
      actionMenu: [],
      currentMenuNodeId: null,
      selectedActionId: null,
      selectedTargetId: null,
      selectedSwapOutParticipantId: null,
      selectedSwapInParticipantId: null,
      battleLog: [],
    };

    expect(() => sessionStore.cancelPendingBattle()).toThrow(
      "[COMBAT_PENDING_CANCEL_INVALID_STATE] Cannot cancel pending battle from IDLE.",
    );
    expect(sessionStore.snapshot.sessionState).toBe("IDLE");
    expect(battleStore.activeBattle?.encounterId).toBe("enc-active-preserved");
  });

  it("getLearnableSkills returns skills matching level and prerequisites", () => {
    const sessionStore = useSessionStore();

    _getCharacter.mockReturnValue(
      makeChar({
        skillTree: [
          { skillId: "1", requiredLevel: 1, prerequisites: [], cost: 100 },
          { skillId: "2", requiredLevel: 5, prerequisites: [], cost: 200 },
          { skillId: "3", requiredLevel: 1, prerequisites: ["1"], cost: 300 },
          { skillId: "4", requiredLevel: 1, prerequisites: ["2"], cost: 400 },
        ],
      }),
    );

    const learnable = sessionStore.getLearnableSkills("char1", 3);
    const ids = learnable.map((n) => n.skillId);
    expect(ids).toContain("1");
    expect(ids).not.toContain("2");
    expect(ids).not.toContain("3");
    expect(ids).not.toContain("4");
  });

  it("getLearnableSkills excludes already-learned skills", () => {
    const sessionStore = useSessionStore();

    _getCharacter.mockReturnValue(
      makeChar({
        skillTree: [
          { skillId: "10", requiredLevel: 1, prerequisites: [], cost: 100 },
          { skillId: "11", requiredLevel: 1, prerequisites: [], cost: 200 },
        ],
      }),
    );

    sessionStore.learnedSkills.set("char1", new Set(["10"]));

    const learnable = sessionStore.getLearnableSkills("char1", 5);
    const ids = learnable.map((n) => n.skillId);
    expect(ids).toContain("11");
    expect(ids).not.toContain("10");
  });

  it("isSkillLearned returns true only for learned skills", () => {
    const sessionStore = useSessionStore();
    sessionStore.learnedSkills.set("charA", new Set(["21"]));

    expect(sessionStore.isSkillLearned("charA", "21")).toBe(true);
    expect(sessionStore.isSkillLearned("charA", "22")).toBe(false);
    expect(sessionStore.isSkillLearned("charB", "21")).toBe(false);
  });

  // ── learnSkill tests ──

  it("learnSkill returns not_in_tree when character is unknown", async () => {
    const sessionStore = useSessionStore();
    _getCharacter.mockImplementation(() => {
      throw new Error("not found");
    });

    const result = await sessionStore.learnSkill("char1", "99");
    expect(result).toBe("not_in_tree");
  });

  it("learnSkill returns not_in_tree when skill is not in character skill tree", async () => {
    const sessionStore = useSessionStore();
    _getCharacter.mockReturnValue(
      makeChar({
        skillTree: [
          { skillId: "1", requiredLevel: 1, prerequisites: [], cost: 100 },
        ],
      }),
    );

    const result = await sessionStore.learnSkill("char1", "99");
    expect(result).toBe("not_in_tree");
  });

  it("learnSkill returns already_learned when skill is in learned set", async () => {
    const sessionStore = useSessionStore();
    _getCharacter.mockReturnValue(
      makeChar({
        skillTree: [
          { skillId: "1", requiredLevel: 1, prerequisites: [], cost: 100 },
        ],
      }),
    );
    sessionStore.learnedSkills.set("char1", new Set(["1"]));

    const result = await sessionStore.learnSkill("char1", "1");
    expect(result).toBe("already_learned");
  });

  it("learnSkill returns level_insufficient when variable state is missing", async () => {
    const sessionStore = useSessionStore();
    _getCharacter.mockReturnValue(
      makeChar({
        skillTree: [
          { skillId: "1", requiredLevel: 1, prerequisites: [], cost: 100 },
        ],
      }),
    );
    vi.mocked(mockVarRepo.getCurrent).mockResolvedValue(null);

    const result = await sessionStore.learnSkill("char1", "1");
    expect(result).toBe("level_insufficient");
  });

  it("learnSkill returns level_insufficient when character level too low", async () => {
    const sessionStore = useSessionStore();
    _getCharacter.mockReturnValue(
      makeChar({
        skillTree: [
          { skillId: "1", requiredLevel: 15, prerequisites: [], cost: 100 },
        ],
      }),
    );
    vi.mocked(mockVarRepo.getCurrent).mockResolvedValue(makeVarState());

    const result = await sessionStore.learnSkill("char1", "1");
    expect(result).toBe("level_insufficient");
  });

  it("learnSkill returns missing_prerequisites when prereqs not met", async () => {
    const sessionStore = useSessionStore();
    _getCharacter.mockReturnValue(
      makeChar({
        skillTree: [
          { skillId: "1", requiredLevel: 1, prerequisites: ["99"], cost: 100 },
        ],
      }),
    );
    vi.mocked(mockVarRepo.getCurrent).mockResolvedValue(makeVarState());

    const result = await sessionStore.learnSkill("char1", "1");
    expect(result).toBe("missing_prerequisites");
  });

  it("learnSkill returns insufficient_money when not enough money", async () => {
    const sessionStore = useSessionStore();
    _getCharacter.mockReturnValue(
      makeChar({
        skillTree: [
          { skillId: "1", requiredLevel: 1, prerequisites: [], cost: 5000 },
        ],
      }),
    );
    vi.mocked(mockVarRepo.getCurrent).mockResolvedValue(makeVarState());

    const result = await sessionStore.learnSkill("char1", "1");
    expect(result).toBe("insufficient_money");
  });

  it("learnSkill returns ok, deducts money and persists learned skill", async () => {
    const sessionStore = useSessionStore();
    _getCharacter.mockReturnValue(
      makeChar({
        skillTree: [
          { skillId: "1", requiredLevel: 1, prerequisites: [], cost: 300 },
        ],
      }),
    );
    vi.mocked(mockVarRepo.getCurrent).mockResolvedValue(makeVarState());
    vi.mocked(mockVarRepo.saveCurrent).mockResolvedValue(undefined);

    const result = await sessionStore.learnSkill("char1", "1");
    expect(result).toBe("ok");

    // Verify saveCurrent was called with updated state
    expect(mockVarRepo.saveCurrent).toHaveBeenCalledTimes(1);
    const savedState = vi.mocked(mockVarRepo.saveCurrent).mock.calls[0][0];
    expect(savedState.root.player.money).toBe(700); // 1000 - 300
    expect(savedState.root.player.learnedSkills["char1"]).toEqual(["1"]);

    // Verify in-memory state updated
    expect(sessionStore.isSkillLearned("char1", "1")).toBe(true);
  });

  it("learnSkill appends to existing learned skills", async () => {
    const sessionStore = useSessionStore();
    _getCharacter.mockReturnValue(
      makeChar({
        skillTree: [
          { skillId: "3", requiredLevel: 1, prerequisites: [], cost: 100 },
        ],
      }),
    );
    vi.mocked(mockVarRepo.getCurrent).mockResolvedValue(
      makeVarState({ player: { learnedSkills: { char1: ["1", "2"] } } }),
    );
    vi.mocked(mockVarRepo.saveCurrent).mockResolvedValue(undefined);

    const result = await sessionStore.learnSkill("char1", "3");
    expect(result).toBe("ok");
    const savedState = vi.mocked(mockVarRepo.saveCurrent).mock.calls[0][0];
    expect(savedState.root.player.learnedSkills["char1"]).toEqual([
      "1",
      "2",
      "3",
    ]);
  });

  async function enterTrainingCombat() {
    const sessionStore = useSessionStore();
    const battleStore = useBattleStore();
    battleStore.stagePendingEncounter({
      encounterId: "training/free/test",
      narrativeReason: "自由练习",
      enemies: [],
      source: "training/free",
    });
    sessionStore.enterCombatPending();
    await sessionStore.startBattle([]);
    return { sessionStore, battleStore };
  }

  it("keeps training item consumption inside the temporary battle inventory", async () => {
    vi.mocked(mockVarRepo.getCurrent).mockResolvedValue(
      makeVarState({ inventory: { items: { potion: 2 }, battleItems: { potion: 2 } } }),
    );
    const { battleStore } = await enterTrainingCombat();
    battleStore.setBattleItems({ potion: 2 });
    await battleStore.onItemConsumed?.("potion");

    expect(battleStore._currentBattleItems).toEqual({ potion: 1 });
    expect(mockVarRepo.saveCurrent).not.toHaveBeenCalled();
  });

  it("completes resolved free training directly to IDLE and clears the battle", async () => {
    const { sessionStore, battleStore } = await enterTrainingCombat();
    Object.assign(battleStore.activeBattle!, {
      lifecycleState: "RESOLVED",
      phase: "RESULT",
      battleResult: {
        outcome: "victory",
        endReason: "all_enemies_down",
        turnCount: 1,
      },
    });

    await expect(sessionStore.completeTrainingBattle()).resolves.toMatchObject({
      rewarded: false,
      reason: "free_training",
    });
    expect(sessionStore.snapshot.sessionState).toBe("IDLE");
    expect(battleStore.activeBattle).toBeNull();
  });

  it("aborts unresolved training directly to IDLE", async () => {
    const { sessionStore, battleStore } = await enterTrainingCombat();

    await expect(sessionStore.abortTrainingBattle()).resolves.toEqual({ aborted: true });
    expect(sessionStore.snapshot.sessionState).toBe("IDLE");
    expect(battleStore.activeBattle).toBeNull();
  });

  it("prevents the story completion path from handling training battles", async () => {
    const { sessionStore } = await enterTrainingCombat();
    await expect(sessionStore.completeActiveBattle()).rejects.toThrow(
      "[STORY_BATTLE_SOURCE_REQUIRED]",
    );
  });


  it("uses a permanent-stat incense atomically and persists the bonus with item consumption", async () => {
    const sessionStore = useSessionStore();
    vi.mocked(mockVarRepo.getCurrent).mockResolvedValue(
      makeVarState({ inventory: { items: { "66": 2 } } }),
    );
    vi.mocked(mockVarRepo.saveCurrent).mockResolvedValue(undefined);

    await expect(sessionStore.usePermanentStatItem("66", "__player__")).resolves.toMatchObject({
      success: true,
    });

    expect(mockVarRepo.saveCurrent).toHaveBeenCalledTimes(1);
    const savedState = vi.mocked(mockVarRepo.saveCurrent).mock.calls[0][0];
    expect(savedState.root.player.combat.permanentBonuses).toEqual({
      attack: 1,
      defense: 0,
      agility: 0,
      intelligence: 0,
    });
    expect(savedState.root.inventory.items["66"]).toBe(1);
  });

  it("does not consume incense when the permanent panel stat is capped", async () => {
    const sessionStore = useSessionStore();
    vi.mocked(mockVarRepo.getCurrent).mockResolvedValue(
      makeVarState({
        player: {
          combat: {
            allocatedPoints: { attack: 99, defense: 0, agility: 0, intelligence: 0 },
          },
        },
        inventory: { items: { "66": 1 } },
      }),
    );

    await expect(sessionStore.usePermanentStatItem("66", "__player__")).resolves.toEqual({
      success: false,
      reason: "stat_capped",
    });
    expect(mockVarRepo.saveCurrent).not.toHaveBeenCalled();
  });
  it("rejects permanent-stat incense targets outside the active party", async () => {
    const sessionStore = useSessionStore();
    vi.mocked(mockVarRepo.getCurrent).mockResolvedValue(
      makeVarState({
        characters: {
          char1: {
            displayName: "Test",
            inParty: false,
            combat: {
              level: 10,
              exp: 0,
              hp: { current: 100, max: 100 },
              mp: { current: 50, max: 50 },
              attack: 5,
              defense: 5,
              agility: 5,
              intelligence: 5,
              allocatedPoints: { attack: 0, defense: 0, agility: 0, intelligence: 0 },
              unspentPoints: 0,
            },
          },
        },
        inventory: { items: { "66": 1 } },
      }),
    );

    await expect(sessionStore.usePermanentStatItem("66", "char1")).resolves.toEqual({
      success: false,
      reason: "character_not_in_party",
    });
    expect(mockVarRepo.saveCurrent).not.toHaveBeenCalled();
  });
  it("rehydrates learned skills after restoring a save checkpoint", async () => {
    const sessionStore = useSessionStore();
    const restoredVariables = makeVarState({
      player: {
        learnedSkills: { char1: ["10"] },
        equippedSkills: ["10"],
      },
    });
    vi.mocked(mockVarRepo.getCurrent).mockResolvedValue(restoredVariables);
    vi.mocked(mockVarRepo.saveCurrent).mockResolvedValue(undefined);

    await sessionStore.restoreFromCheckpointSnapshot({
      id: "checkpoint-with-skills",
      kind: "save_checkpoint",
      snapshotVersion: 1,
      createdAt: "2026-07-17T00:00:00.000Z",
      reason: "load save",
      sessionSnapshot: {
        sessionState: "IDLE",
        pipelineState: null,
        activeRequestId: null,
      },
      variableValue: restoredVariables,
      chatMessages: [],
    });

    expect(sessionStore.isSkillLearned("char1", "10")).toBe(true);
  });

  describe("real-content progression save compatibility", () => {
    beforeEach(async () => {
      const content = await vi.importActual<typeof import("@/content/contentRegistry")>(
        "@/content/contentRegistry",
      );
      _getCharacter.mockImplementation(content.getCharacterByName);
      _getAllIds.mockImplementation(content.getAllCharacterIds);
      vi.mocked(mockVarRepo.saveCurrent).mockImplementation(async (state) => {
        vi.mocked(mockVarRepo.getCurrent).mockResolvedValue(state);
      });
    });

    afterEach(() => {
      _getAllIds.mockReturnValue(["char1"]);
      vi.mocked(mockVarRepo.saveCurrent).mockReset();
    });

    async function restoreProgressionCheckpoint(
      characterId: string,
      learned: string[],
      equipped: string[] = [],
      level = 99,
    ) {
      const sessionStore = useSessionStore();
      const state = makeVarState({
        player: {
          combat: { level },
          money: 10000,
          learnedSkills: { [characterId]: learned },
          equippedSkills: characterId === "player" ? equipped : [],
        },
        characters: characterId === "player" ? {} : {
          [characterId]: {
            displayName: characterId,
            identity: "",
            relationshipTag: "",
            awakeningStatus: "现役",
            inParty: true,
            equippedSkills: equipped,
          },
        },
      });
      vi.mocked(mockVarRepo.getCurrent).mockResolvedValue(state);
      await sessionStore.restoreFromCheckpointSnapshot({
        id: "legacy-progression-checkpoint",
        kind: "save_checkpoint",
        snapshotVersion: 1,
        createdAt: "2026-10-20T00:00:00.000Z",
        reason: "load pre-progression save",
        sessionSnapshot: { sessionState: "IDLE", pipelineState: null, activeRequestId: null },
        variableValue: state,
        chatMessages: [],
      });
      expect(await mockVarRepo.getCurrent()).toEqual(state);
      vi.mocked(mockVarRepo.saveCurrent).mockClear();
      return sessionStore;
    }

    it.each([
      ["player", "102", ["189", "190"], 12],
      ["shiota_sumireko", "171", ["99", "100"], 21],
    ] as const)(
      "retains %s skill %s from an old save without buying or granting its new ancestors",
      async (characterId, skillId, missingAncestors, level) => {
        const sessionStore = await restoreProgressionCheckpoint(characterId, [skillId], [skillId], level);
        expect(sessionStore.isSkillLearned(characterId, skillId)).toBe(true);
        expect(sessionStore.getLearnableSkills(characterId, level).map((node) => node.skillId))
          .not.toContain(skillId);
        for (const ancestor of missingAncestors) {
          expect(sessionStore.isSkillLearned(characterId, ancestor)).toBe(false);
        }
        await expect(sessionStore.learnSkill(characterId, skillId)).resolves.toBe("already_learned");
        await expect(sessionStore.equipSkill(characterId, skillId)).resolves.toBe("already_equipped");
        expect(mockVarRepo.saveCurrent).not.toHaveBeenCalled();
        await expect(sessionStore.unequipSkill(characterId, skillId)).resolves.toBe("ok");
        await expect(sessionStore.equipSkill(characterId, skillId)).resolves.toBe("ok");

        const state = (await mockVarRepo.getCurrent())!;
        expect(state.root.player.money).toBe(10000);
        expect(state.root.player.learnedSkills[characterId]).toEqual([skillId]);
        const equipped = characterId === "player"
          ? state.root.player.equippedSkills
          : state.root.characters[characterId].equippedSkills;
        expect(equipped).toEqual([skillId]);

        const battleStore = useBattleStore();
        battleStore.stagePendingEncounter({
          encounterId: "training/free/legacy-progression",
          narrativeReason: "Legacy equipped skill availability",
          enemies: [{ enemy_id: "1", count: 1 }],
          source: "training/free",
        });
        sessionStore.enterCombatPending();
        await sessionStore.startBattle([{
          id: "legacy-hero",
          characterId: characterId === "player" ? "__player__" : characterId,
          side: "player",
          displayName: characterId,
          level,
          hp: { current: 100, max: 100 },
          mp: { current: 100, max: 100 },
          isDown: false,
          isActive: true,
        }]);
        const hero = battleStore.activeBattle?.participants.find((entry) => entry.id === "legacy-hero");
        expect(hero?.availableSkillIds).toContain(skillId);
        for (const ancestor of missingAncestors) expect(hero?.availableSkillIds).not.toContain(ancestor);
        const skillMenu = battleStore.activeBattle?.actionMenu?.find((node) => node.id === "skill-group");
        expect(skillMenu?.children?.some((node) => node.contentId === skillId)).toBe(true);
      },
    );

    it("requires the new player sleep chain at level 21 and charges each skill only once", async () => {
      const sessionStore = await restoreProgressionCheckpoint("player", [], [], 20);
      for (const skillId of ["189", "190", "102"]) {
        await expect(sessionStore.learnSkill("player", skillId)).resolves.toBe("level_insufficient");
      }
      expect(mockVarRepo.saveCurrent).not.toHaveBeenCalled();
      await restoreProgressionCheckpoint("player", [], [], 21);
      await expect(sessionStore.learnSkill("player", "102")).resolves.toBe("missing_prerequisites");
      await expect(sessionStore.learnSkill("player", "190")).resolves.toBe("missing_prerequisites");
      expect(mockVarRepo.saveCurrent).not.toHaveBeenCalled();
      for (const skillId of ["189", "190", "102"]) {
        expect(sessionStore.getLearnableSkills("player", 21).map((node) => node.skillId)).toContain(skillId);
        await expect(sessionStore.learnSkill("player", skillId)).resolves.toBe("ok");
      }
      await expect(sessionStore.learnSkill("player", "102")).resolves.toBe("already_learned");
      const state = (await mockVarRepo.getCurrent())!;
      expect(state.root.player.learnedSkills.player).toEqual(["189", "190", "102"]);
      expect(state.root.player.money).toBe(6800);
      expect(mockVarRepo.saveCurrent).toHaveBeenCalledTimes(3);
    });

    it.each([
      ["player", "104", "103"],
      ["player", "107", "106"],
      ["player", "109", "108"],
      ["player", "190", "189"],
      ["sakakibara_rune", "104", "103"],
      ["sakakibara_rune", "107", "106"],
      ["sakakibara_rune", "109", "108"],
      ["sakakibara_rune", "190", "189"],
      ["sakakibara_chinatsu", "172", "75"],
      ["sakakibara_rune", "176", "82"],
    ])(
      "%s skill %s becomes purchasable only after %s is learned",
      async (characterId, skillId, prerequisite) => {
        const sessionStore = await restoreProgressionCheckpoint(characterId, []);
        expect(sessionStore.getLearnableSkills(characterId, 99).map((node) => node.skillId)).not.toContain(skillId);
        await expect(sessionStore.learnSkill(characterId, skillId)).resolves.toBe("missing_prerequisites");
        expect(mockVarRepo.saveCurrent).not.toHaveBeenCalled();
        await restoreProgressionCheckpoint(characterId, [prerequisite]);
        expect(sessionStore.getLearnableSkills(characterId, 99).map((node) => node.skillId)).toContain(skillId);
        await expect(sessionStore.learnSkill(characterId, skillId)).resolves.toBe("ok");
        const state = (await mockVarRepo.getCurrent())!;
        expect(state.root.player.learnedSkills[characterId]).toEqual([prerequisite, skillId]);
        expect(state.root.player.money).toBe(10000 - _getCharacter(characterId).skillTree
          .find((node: { skillId: string }) => node.skillId === skillId).cost);
      },
    );

    it.each([{ learned: [] }, { learned: ["99"] }, { learned: ["100"] }])(
      "preserves Sumireko171's AND purchase gate with learned ancestors $learned",
      async ({ learned }) => {
        const sessionStore = await restoreProgressionCheckpoint("shiota_sumireko", learned);
        expect(sessionStore.getLearnableSkills("shiota_sumireko", 99).map((node) => node.skillId))
          .not.toContain("171");
        await expect(sessionStore.learnSkill("shiota_sumireko", "171")).resolves.toBe("missing_prerequisites");
        expect(mockVarRepo.saveCurrent).not.toHaveBeenCalled();
        await restoreProgressionCheckpoint("shiota_sumireko", ["99", "100"]);
        expect(sessionStore.getLearnableSkills("shiota_sumireko", 99).map((node) => node.skillId)).toContain("171");
        await expect(sessionStore.learnSkill("shiota_sumireko", "171")).resolves.toBe("ok");
        expect((await mockVarRepo.getCurrent())?.root.player.learnedSkills.shiota_sumireko)
          .toEqual(["99", "100", "171"]);
      },
    );
  });
});
