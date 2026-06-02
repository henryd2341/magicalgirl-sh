import { useBattleStore } from "@/stores/battleStore";
import { useSessionStore } from "@/stores/sessionStore";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it } from "vitest";
import { vi } from "vitest";
import type { VariableRepository } from "@/persistence/repositories/variableRepository";

const { getCharacter: _getCharacter, getAllCharacterIds: _getAllIds } =
  vi.hoisted(() => ({
    getCharacter: vi.fn(),
    getAllCharacterIds: vi.fn(() => ["char1"]),
  }));

vi.mock("@/content/contentRegistry", () => ({
  getCharacter: _getCharacter,
  getAllCharacterIds: _getAllIds,
}));

const mockVarRepo: VariableRepository = {
  getCurrent: vi.fn(),
  saveCurrent: vi.fn(),
} as unknown as VariableRepository;

vi.mock("@/persistence/repositories/variableRepository", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/persistence/repositories/variableRepository")>();
  return {
    ...actual,
    InMemoryVariableRepository: vi.fn(() => mockVarRepo),
  };
});

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

function makeVarState(overrides: Record<string, unknown> = {}) {
  return {
    rootId: "test-root",
    version: 1,
    stateHash: "initial",
    updatedAt: "2025-01-01T00:00:00.000Z",
    root: {
      schemaVersion: "4.0.0" as const,
      world: { time: { displayText: "" }, location: { id: "", name: "" }, affairs: {}, flags: {} },
      player: {
        profile: { name: "", age: 16, gender: "女" as const },
        combat: {
          level: 10, exp: 0,
          hp: { current: 100, max: 100 },
          mp: { current: 50, max: 50 },
          attack: 5, defense: 5, agility: 5, intelligence: 5,
          allocatedPoints: { attack: 0, defense: 0, agility: 0, intelligence: 0 },
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
      ...overrides,
    },
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

    _getCharacter.mockReturnValue(makeChar({
      skillTree: [
        { skillId: "1", requiredLevel: 1, prerequisites: [], cost: 100 },
        { skillId: "2", requiredLevel: 5, prerequisites: [], cost: 200 },
        { skillId: "3", requiredLevel: 1, prerequisites: ["1"], cost: 300 },
        { skillId: "4", requiredLevel: 1, prerequisites: ["2"], cost: 400 },
      ],
    }));

    const learnable = sessionStore.getLearnableSkills("char1", 3);
    const ids = learnable.map((n) => n.skillId);
    expect(ids).toContain("1");
    expect(ids).toContain("3");
    expect(ids).not.toContain("2");
    expect(ids).not.toContain("4");
  });

  it("getLearnableSkills excludes already-learned skills", () => {
    const sessionStore = useSessionStore();

    _getCharacter.mockReturnValue(makeChar({
      skillTree: [
        { skillId: "10", requiredLevel: 1, prerequisites: [], cost: 100 },
        { skillId: "11", requiredLevel: 1, prerequisites: [], cost: 200 },
      ],
    }));

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
    _getCharacter.mockImplementation(() => { throw new Error("not found"); });

    const result = await sessionStore.learnSkill("char1", "99");
    expect(result).toBe("not_in_tree");
  });

  it("learnSkill returns not_in_tree when skill is not in character skill tree", async () => {
    const sessionStore = useSessionStore();
    _getCharacter.mockReturnValue(makeChar({
      skillTree: [{ skillId: "1", requiredLevel: 1, prerequisites: [], cost: 100 }],
    }));

    const result = await sessionStore.learnSkill("char1", "99");
    expect(result).toBe("not_in_tree");
  });

  it("learnSkill returns already_learned when skill is in learned set", async () => {
    const sessionStore = useSessionStore();
    _getCharacter.mockReturnValue(makeChar({
      skillTree: [{ skillId: "1", requiredLevel: 1, prerequisites: [], cost: 100 }],
    }));
    sessionStore.learnedSkills.set("char1", new Set(["1"]));

    const result = await sessionStore.learnSkill("char1", "1");
    expect(result).toBe("already_learned");
  });

  it("learnSkill returns level_insufficient when variable state is missing", async () => {
    const sessionStore = useSessionStore();
    _getCharacter.mockReturnValue(makeChar({
      skillTree: [{ skillId: "1", requiredLevel: 1, prerequisites: [], cost: 100 }],
    }));
    vi.mocked(mockVarRepo.getCurrent).mockResolvedValue(null);

    const result = await sessionStore.learnSkill("char1", "1");
    expect(result).toBe("level_insufficient");
  });

  it("learnSkill returns level_insufficient when character level too low", async () => {
    const sessionStore = useSessionStore();
    _getCharacter.mockReturnValue(makeChar({
      skillTree: [{ skillId: "1", requiredLevel: 15, prerequisites: [], cost: 100 }],
    }));
    vi.mocked(mockVarRepo.getCurrent).mockResolvedValue(makeVarState());

    const result = await sessionStore.learnSkill("char1", "1");
    expect(result).toBe("level_insufficient");
  });

  it("learnSkill returns missing_prerequisites when prereqs not met", async () => {
    const sessionStore = useSessionStore();
    _getCharacter.mockReturnValue(makeChar({
      skillTree: [
        { skillId: "1", requiredLevel: 1, prerequisites: ["99"], cost: 100 },
      ],
    }));
    vi.mocked(mockVarRepo.getCurrent).mockResolvedValue(makeVarState());

    const result = await sessionStore.learnSkill("char1", "1");
    expect(result).toBe("missing_prerequisites");
  });

  it("learnSkill returns insufficient_money when not enough money", async () => {
    const sessionStore = useSessionStore();
    _getCharacter.mockReturnValue(makeChar({
      skillTree: [{ skillId: "1", requiredLevel: 1, prerequisites: [], cost: 5000 }],
    }));
    vi.mocked(mockVarRepo.getCurrent).mockResolvedValue(makeVarState());

    const result = await sessionStore.learnSkill("char1", "1");
    expect(result).toBe("insufficient_money");
  });

  it("learnSkill returns ok, deducts money and persists learned skill", async () => {
    const sessionStore = useSessionStore();
    _getCharacter.mockReturnValue(makeChar({
      skillTree: [{ skillId: "1", requiredLevel: 1, prerequisites: [], cost: 300 }],
    }));
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
    _getCharacter.mockReturnValue(makeChar({
      skillTree: [{ skillId: "3", requiredLevel: 1, prerequisites: [], cost: 100 }],
    }));
    vi.mocked(mockVarRepo.getCurrent).mockResolvedValue(
      makeVarState({ player: { learnedSkills: { char1: ["1", "2"] } } }),
    );
    vi.mocked(mockVarRepo.saveCurrent).mockResolvedValue(undefined);

    const result = await sessionStore.learnSkill("char1", "3");
    expect(result).toBe("ok");
    const savedState = vi.mocked(mockVarRepo.saveCurrent).mock.calls[0][0];
    expect(savedState.root.player.learnedSkills["char1"]).toEqual(["1", "2", "3"]);
  });
});
