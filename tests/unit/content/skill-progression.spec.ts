import {
  getAllCharacterIds,
  getCharacter,
  getSkill,
} from "@/content/contentRegistry";
import charactersRaw from "@/content/characters.jsonl?raw";
import type { CharacterContent, SkillTreeNode } from "@/types/content";
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

// Reviewed 2026-10-21: character, skill, previous prerequisites, approved prerequisites.
const approvedEdges: [string, string, string[], string[]][] = [
  ["player", "26", ["22"], ["23"]],
  ["player", "91", [], ["86"]],
  ["player", "92", [], ["91"]],
  ["player", "99", [], ["93"]],
  ["player", "101", [], ["93"]],
  ["player", "102", [], ["190"]],
  ["player", "104", [], ["103"]],
  ["player", "107", [], ["106"]],
  ["player", "109", [], ["108"]],
  ["player", "110", [], ["36"]],
  ["player", "113", [], ["43"]],
  ["player", "116", [], ["50"]],
  ["player", "119", [], ["57"]],
  ["player", "122", [], ["64"]],
  ["player", "126", [], ["94"]],
  ["player", "131", [], ["3"]],
  ["player", "132", [], ["36"]],
  ["player", "134", [], ["43"]],
  ["player", "136", [], ["50"]],
  ["player", "138", [], ["57"]],
  ["player", "141", [], ["71"]],
  ["player", "143", [], ["78"]],
  ["player", "145", [], ["2"]],
  ["player", "147", [], ["178"]],
  ["player", "154", [], ["94"]],
  ["player", "155", [], ["154"]],
  ["player", "156", [], ["103"]],
  ["player", "158", [], ["85"]],
  ["player", "159", [], ["100"]],
  ["player", "190", [], ["189"]],
  ["player", "191", [], ["64"]],
  ["kunitue_tsubame", "26", ["22"], ["23"]],
  ["kunitue_tsubame", "51", [], ["50"]],
  ["kunitue_tsubame", "99", [], ["93"]],
  ["kunitue_tsubame", "100", [], ["50"]],
  ["kunitue_tsubame", "101", [], ["93"]],
  ["kunitue_tsubame", "116", [], ["50"]],
  ["kunitue_tsubame", "136", [], ["50"]],
  ["kunitue_tsubame", "145", [], ["18"]],
  ["kunitue_tsubame", "158", [], ["85"]],
  ["kunitue_tsubame", "159", [], ["100"]],
  ["kunitue_tsubame", "168", [], ["95"]],
  ["kunitue_tsubame", "169", [], ["50"]],
  ["sakakibara_rune", "7", [], ["6"]],
  ["sakakibara_rune", "104", [], ["103"]],
  ["sakakibara_rune", "107", [], ["106"]],
  ["sakakibara_rune", "109", [], ["108"]],
  ["sakakibara_rune", "143", [], ["80"]],
  ["sakakibara_rune", "145", [], ["6"]],
  ["sakakibara_rune", "156", [], ["103"]],
  ["sakakibara_rune", "175", [], ["186"]],
  ["sakakibara_rune", "176", [], ["82"]],
  ["sakakibara_rune", "190", [], ["189"]],
  ["sakakibara_chinatsu", "7", [], ["6"]],
  ["sakakibara_chinatsu", "91", [], ["86"]],
  ["sakakibara_chinatsu", "92", [], ["91"]],
  ["sakakibara_chinatsu", "99", [], ["93"]],
  ["sakakibara_chinatsu", "100", [], ["73"]],
  ["sakakibara_chinatsu", "101", [], ["93"]],
  ["sakakibara_chinatsu", "141", [], ["73"]],
  ["sakakibara_chinatsu", "145", [], ["6"]],
  ["sakakibara_chinatsu", "159", [], ["100"]],
  ["sakakibara_chinatsu", "172", [], ["75"]],
  ["sakakibara_chinatsu", "173", [], ["73"]],
  ["sakakibara_chinatsu", "174", [], ["14"]],
  ["shiota_sumireko", "58", [], ["57"]],
  ["shiota_sumireko", "99", [], ["93"]],
  ["shiota_sumireko", "100", [], ["57"]],
  ["shiota_sumireko", "101", [], ["93"]],
  ["shiota_sumireko", "119", [], ["57"]],
  ["shiota_sumireko", "138", [], ["57"]],
  ["shiota_sumireko", "145", [], ["28"]],
  ["shiota_sumireko", "158", [], ["85"]],
  ["shiota_sumireko", "159", [], ["100"]],
  ["shiota_sumireko", "170", [], ["34"]],
  ["shiota_sumireko", "171", [], ["99", "100"]],
  ["nagae_suzuna", "44", [], ["43"]],
  ["nagae_suzuna", "91", [], ["86"]],
  ["nagae_suzuna", "92", [], ["91"]],
  ["nagae_suzuna", "100", [], ["43"]],
  ["nagae_suzuna", "101", [], ["93"]],
  ["nagae_suzuna", "113", [], ["43"]],
  ["nagae_suzuna", "134", [], ["43"]],
  ["nagae_suzuna", "158", [], ["85"]],
  ["nagae_suzuna", "159", [], ["100"]],
  ["nagae_suzuna", "165", [], ["45"]],
  ["nagae_suzuna", "166", [], ["48"]],
  ["nagae_suzuna", "167", [], ["89"]],
  ["sakura_mao", "7", ["3"], ["6"]],
  ["sakura_mao", "99", [], ["93"]],
  ["sakura_mao", "100", [], ["36"]],
  ["sakura_mao", "101", [], ["93"]],
  ["sakura_mao", "110", [], ["36"]],
  ["sakura_mao", "132", [], ["36"]],
  ["sakura_mao", "145", [], ["2"]],
  ["sakura_mao", "154", [], ["94"]],
  ["sakura_mao", "159", [], ["100"]],
  ["sakura_mao", "162", [], ["36"]],
  ["sakura_mao", "163", [], ["41"]],
  ["sakura_mao", "164", [], ["162"]],
];

const approvedLevels: [string, string, number, number][] = [
  ["player", "92", 10, 12],
  ["player", "102", 12, 21],
  ["player", "104", 5, 8],
  ["player", "107", 5, 12],
  ["player", "109", 5, 8],
  ["player", "111", 5, 8],
  ["player", "140", 12, 16],
  ["player", "181", 20, 21],
  ["player", "190", 12, 21],
  ["sakura_mao", "112", 8, 10],
];

const approvedMetrics: [string, number, number][] = [
  ["player", 28, 7],
  ["kunitue_tsubame", 8, 7],
  ["sakakibara_rune", 15, 4],
  ["sakakibara_chinatsu", 10, 4],
  ["shiota_sumireko", 8, 7],
  ["nagae_suzuna", 11, 6],
  ["sakura_mao", 9, 6],
];

function originalCharacters(): CharacterContent[] {
  const characters: CharacterContent[] = charactersRaw.trim().split("\n")
    .map((line) => JSON.parse(line));
  for (const [characterId, skillId, prerequisites] of approvedEdges) {
    characters.find((character) => character.id === characterId)!
      .skillTree.find((node) => node.skillId === skillId)!.prerequisites = prerequisites;
  }
  for (const [characterId, skillId, requiredLevel] of approvedLevels) {
    characters.find((character) => character.id === characterId)!
      .skillTree.find((node) => node.skillId === skillId)!.requiredLevel = requiredLevel;
  }
  return characters;
}

function ancestors(tree: SkillTreeNode[], skillId: string, path: string[] = []): Set<string> {
  expect(path, `cycle through ${skillId}`).not.toContain(skillId);
  const prerequisites = tree.find((node) => node.skillId === skillId)?.prerequisites ?? [];
  return new Set(prerequisites.flatMap((parent) => [
    parent,
    ...ancestors(tree, parent, [...path, skillId]),
  ]));
}

describe("approved character skill progression", () => {
  it.each(approvedEdges)(
    "%s skill %s uses the exact approved prerequisites",
    (characterId, skillId, _previous, prerequisites) => {
      expect(getCharacter(characterId).skillTree.find((node) => node.skillId === skillId)
        ?.prerequisites).toEqual(prerequisites);
    },
  );

  it.each(approvedLevels)(
    "%s skill %s exposes the normalized level label",
    (characterId, skillId, _previous, requiredLevel) => {
      expect(getCharacter(characterId).skillTree.find((node) => node.skillId === skillId)
        ?.requiredLevel).toBe(requiredLevel);
    },
  );

  it("changes only the 100 approved arrays and 10 level labels", () => {
    expect(approvedEdges).toHaveLength(100);
    expect(new Set(approvedEdges.map(([characterId, skillId]) => `${characterId}:${skillId}`)).size)
      .toBe(100);
    expect(approvedLevels).toHaveLength(10);
    // Semantic approval snapshot also pins unchanged IDs, prices, foundations and character fields.
    expect(createHash("sha256").update(JSON.stringify(originalCharacters())).digest("hex"))
      .toBe("4c788dae83784211aaec346df86ca2edbff57649e44013deea2a114b46770b5b");
  });

  it("retains all seven character trees with 419 nodes, 375 edges and 89 roots", () => {
    expect(getAllCharacterIds()).toEqual(approvedMetrics.map(([characterId]) => characterId));
    const nodes = getAllCharacterIds().flatMap((characterId) => getCharacter(characterId).skillTree);
    expect(nodes).toHaveLength(419);
    expect(nodes.reduce((sum, node) => sum + node.prerequisites.length, 0)).toBe(375);
    expect(nodes.filter((node) => node.prerequisites.length === 0)).toHaveLength(89);
  });

  it.each(approvedMetrics)(
    "%s keeps a reachable DAG, approved roots/depth, old obligations and ancestor level floors",
    (characterId, roots, maxDepth) => {
      const character = getCharacter(characterId);
      const tree = character.skillTree;
      const original = originalCharacters().find((entry) => entry.id === characterId)!;
      const ids = [...character.innateSkills, ...tree.map((node) => node.skillId)];
      expect(new Set(character.innateSkills).size).toBe(character.innateSkills.length);
      expect(new Set(tree.map((node) => node.skillId)).size).toBe(tree.length);
      for (const skillId of ids) expect(getSkill(skillId).id).toBe(skillId);
      const depths = new Map(character.innateSkills.map((skillId) => [skillId, -1]));
      const pending = new Set(tree.map((node) => node.skillId));
      while (pending.size > 0) {
        const ready = tree.filter((node) => pending.has(node.skillId)
          && node.prerequisites.every((parent) => depths.has(parent)));
        expect(ready.length, `${characterId} has a cycle or missing parent`).toBeGreaterThan(0);
        for (const node of ready) {
          depths.set(node.skillId, Math.max(-1, ...node.prerequisites.map((parent) => depths.get(parent)!)) + 1);
          pending.delete(node.skillId);
        }
      }
      expect(tree.filter((node) => node.prerequisites.length === 0)).toHaveLength(roots);
      expect(Math.max(...depths.values())).toBe(maxDepth);
      for (const node of tree) {
        expect(new Set(node.prerequisites).size).toBe(node.prerequisites.length);
        expect(node.prerequisites).not.toContain(node.skillId);
        for (const parent of node.prerequisites) expect(ids).toContain(parent);
        const oldNode = original.skillTree.find((entry) => entry.skillId === node.skillId)!;
        const requiredAncestors = ancestors(tree, node.skillId);
        for (const parent of ancestors(original.skillTree, node.skillId)) {
          expect(requiredAncestors, `${characterId}:${node.skillId} lost ${parent}`).toContain(parent);
        }
        if (oldNode.prerequisites.length > 1) expect(node.prerequisites).toEqual(oldNode.prerequisites);
        const oldLevels = [node.skillId, ...requiredAncestors]
          .map((skillId) => original.skillTree.find((entry) => entry.skillId === skillId)?.requiredLevel ?? 0);
        expect(node.requiredLevel).toBe(Math.max(...oldLevels));
        if (node.prerequisites.length === 0) expect(node.requiredLevel).toBe(oldNode.requiredLevel);
        expect(node.cost).toBe(oldNode.cost);
      }
    },
  );

  it.each(["player", "sakakibara_rune"])(
    "%s retains the four ailment chains, poison continuation and independent Revenge",
    (characterId) => {
      const tree = getCharacter(characterId).skillTree;
      for (const [skillId, parent] of [["104", "103"], ["105", "104"], ["107", "106"], ["109", "108"], ["190", "189"]]) {
        expect(tree.find((node) => node.skillId === skillId)?.prerequisites).toEqual([parent]);
      }
      expect(tree.find((node) => node.skillId === "157")?.prerequisites).toEqual([]);
    },
  );

  it("keeps the entire player sleep-to-instant-death route at level 21", () => {
    const tree = getCharacter("player").skillTree;
    expect(tree.filter((node) => ["189", "190", "102"].includes(node.skillId))
      .map((node) => [node.skillId, node.requiredLevel, node.prerequisites])).toEqual([
      ["102", 21, ["190"]],
      ["189", 21, []],
      ["190", 21, ["189"]],
    ]);
  });
});
