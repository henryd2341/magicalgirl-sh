import { buildPlayerPartyFromFormation } from "@/engine/battle/battleSetup";
import { BATTLE_ELEMENTS } from "@/types/battle";
import type { GameVariablesRoot } from "@/types/variables";
import { describe, expect, it } from "vitest";

function variables(): GameVariablesRoot {
  return {
    schemaVersion: "4.0.0",
    world: { time: { displayText: "" }, location: { id: "", name: "" }, affairs: {}, flags: {} },
    player: {
      profile: { name: "主角", age: 18, gender: "女", family: "", past: "" },
      combat: {
        level: 10, exp: 0, hp: { current: 77, max: 150 }, mp: { current: 33, max: 102 },
        attack: 99, defense: 99, agility: 99, intelligence: 99,
        allocatedPoints: { attack: 10, defense: 20, agility: 30, intelligence: 40 },
        permanentBonuses: { attack: 1, defense: 2, agility: 3, intelligence: 4 }, unspentPoints: 0,
      },
      money: 0, equipment: { accessory: "35" }, relationships: {}, learnedSkills: {}, flags: {}, equippedSkills: [],
    },
    characters: {
      ally: {
        displayName: "同伴", identity: "", relationshipTag: "", awakeningStatus: "现役",
        combat: {
          level: 8, exp: 0, hp: { current: 41, max: 130 }, mp: { current: 21, max: 86 },
          attack: 88, defense: 88, agility: 88, intelligence: 88,
          allocatedPoints: { attack: 1, defense: 2, agility: 3, intelligence: 4 },
          permanentBonuses: { attack: 4, defense: 3, agility: 2, intelligence: 1 }, unspentPoints: 0,
        },
        equipment: { accessory: "36" }, equippedSkills: [],
      },
    },
    inventory: { items: {}, battleItems: {} },
  };
}

describe("buildPlayerPartyFromFormation", () => {
  it("uses one canonical growth, allocation, equipment, and persisted resource path for all party members", () => {
    const party = buildPlayerPartyFromFormation(variables(), ["__player__", "ally"]);

    expect(party[0]).toMatchObject({
      attack: 24, defense: 27, agility: 38, intelligence: 49,
      hp: { current: 77, max: 150 }, mp: { current: 33, max: 102 },
    });
    expect(party[1]).toMatchObject({
      attack: 10, defense: 12, agility: 10, intelligence: 10,
      hp: { current: 41, max: 130 }, mp: { current: 21, max: 86 },
    });
  });

  it("applies accessory affinities and carries special effects into battle", () => {
    const vars = variables();
    vars.player.equipment.accessory = "56";
    vars.characters.ally!.equipment = { accessory: "52" };

    const party = buildPlayerPartyFromFormation(vars, ["__player__", "ally"]);

    expect(party[0]!.affinities?.resist).toBe(BATTLE_ELEMENTS.Fire);
    expect(party[1]!.accessoryEffects).toContain("auto_buff_start");
    expect(party[1]!.statusEffects).toEqual(expect.arrayContaining([
      { effectId: "attack_up", remainingDuration: 3, stacks: 1 },
      { effectId: "defense_up", remainingDuration: 3, stacks: 1 },
      { effectId: "agility_up", remainingDuration: 3, stacks: 1 },
    ]));
  });
});
