import { useBattleStore } from "@/stores/battleStore";
import { useSessionStore } from "@/stores/sessionStore";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it } from "vitest";
import { vi } from "vitest";

const { getCharacter: _getCharacter } = vi.hoisted(() => ({
  getCharacter: vi.fn(),
}));

vi.mock("@/content/contentRegistry", () => ({
  getCharacter: _getCharacter,
}));

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

describe("sessionStore", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  it("rejects pending combat cancellation outside COMBAT_PENDING without clearing active battle state", () => {
    const sessionStore = useSessionStore();
    const battleStore = useBattleStore();

    battleStore.activeBattle = {
      encounterId: "enc-active-preserved",
      lifecycleState: "ACTIVE",
      phase: "PLAYER_COMMAND",
      turnCount: 1,
      participants: [],
      pressTurn: {
        ownerSide: "player",
        icons: [],
      },
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
});
