import { describe, expect, it } from "vitest";
import { getAllCharacterIds, getCharacter, getSkill } from "@/content/contentRegistry";
import { SKILL_CATEGORIES, type SkillTreeNode } from "@/types/content";
import {
  buildSkillBranches,
  routeSkillEdges,
  skillBlockWidth,
  SKILL_CARD_WIDTH,
  SKILL_LANE_GAP,
  SKILL_ROW_GAP,
  type SkillBounds,
} from "@/ui/character-build/skillTreeLayout";

function node(skillId: string, ...prerequisites: string[]): SkillTreeNode {
  return { skillId, prerequisites, cost: 100, requiredLevel: 1 };
}

describe("skill branch lanes", () => {
  it("keeps a linear chain centered and siblings in distinct reserved lanes", () => {
    const [branch] = buildSkillBranches([
      node("root"),
      node("trunk", "root"),
      node("left", "trunk"),
      node("right", "trunk"),
      node("left-next", "left"),
    ]);
    expect(branch.columns).toBe(2);
    const byId = new Map(branch.placements.map((placement) => [placement.node.skillId, placement]));
    expect(byId.get("root")).toMatchObject({ column: 1, span: 2, row: 1 });
    expect(byId.get("trunk")).toMatchObject({ column: 1, span: 2, row: 2 });
    expect(byId.get("left")).toMatchObject({ column: 1, span: 1, row: 3 });
    expect(byId.get("right")).toMatchObject({ column: 2, span: 1, row: 3 });
    expect(byId.get("left-next")).toMatchObject({ column: 1, span: 1, row: 4 });
  });

  it("reserves a five-parent reference span without inventing an OR or a crossing edge", () => {
    const parents = ["112", "115", "118", "121", "124"];
    const nodes = [...parents.map((id) => node(id)), node("125", ...parents), node("next", "125")];
    const before = structuredClone(nodes);
    const branches = buildSkillBranches(nodes);
    const merge = branches.find((branch) => branch.id === "125")!;
    expect(merge.columns).toBe(5);
    expect(skillBlockWidth(merge.placements[0].node)).toBe(5 * SKILL_CARD_WIDTH + 4 * SKILL_LANE_GAP);
    expect(merge.placements[0]).toMatchObject({ parentId: undefined, span: 5 });
    expect(merge.placements[0].node.prerequisites).toEqual(parents);
    expect(merge.placements[1]).toMatchObject({ parentId: "125", column: 1, span: 5 });
    expect(nodes).toEqual(before);
  });

  it("preserves cross-category requirements as reachable reference roots", () => {
    const [branch] = buildSkillBranches([node("105", "104")]);
    expect(branch.id).toBe("105");
    expect(branch.placements[0].parentId).toBeUndefined();
    expect(branch.placements[0].node.prerequisites).toEqual(["104"]);
  });

  it("routes through the reserved row gap after tall/long text, not through a sibling card", () => {
    const [branch] = buildSkillBranches([
      node("root"),
      node("left", "root"),
      node("right", "root"),
      node("child", "left"),
    ]);
    const bounds = new Map<string, SkillBounds>([
      ["root", { x: 196, y: 24, width: 280, height: 520 }],
      ["left", { x: 24, y: 640, width: 280, height: 430 }],
      ["right", { x: 368, y: 640, width: 280, height: 710 }],
      ["child", { x: 24, y: 1446, width: 280, height: 200 }],
    ]);
    const edges = routeSkillEdges(branch, bounds);
    expect(edges).toEqual([
      { fromId: "root", toId: "left", path: "M 336 544 V 592 H 164 V 640" },
      { fromId: "left", toId: "child", path: "M 164 1070 V 1398 H 164 V 1446" },
      { fromId: "root", toId: "right", path: "M 336 544 V 592 H 508 V 640" },
    ]);
    expect(640 - (24 + 520)).toBe(SKILL_ROW_GAP);
    expect(1446 - (640 + 710)).toBe(SKILL_ROW_GAP);
    expect(routeSkillEdges(branch, new Map())).toEqual([]);
  });

  it("reports cycles, including multi-parent cycles, instead of looping or dropping skills", () => {
    expect(() => buildSkillBranches([node("a", "b", "c"), node("b", "a"), node("c")])).toThrow("循环依赖");
  });

  it("partitions all seven real trees without dropping or duplicating any category node", () => {
    let count = 0;
    for (const id of getAllCharacterIds()) {
      const character = getCharacter(id);
      for (const category of SKILL_CATEGORIES) {
        const nodes = character.skillTree.filter((entry) => getSkill(entry.skillId).category === category);
        const branches = buildSkillBranches(nodes);
        const placements = branches.flatMap((branch) => branch.placements);
        expect(placements.map(({ node: entry }) => entry.skillId).sort()).toEqual(
          nodes.map((entry) => entry.skillId).sort(),
        );
        for (const branch of branches) {
          for (const a of branch.placements) {
            expect(a.column).toBeGreaterThanOrEqual(1);
            expect(a.column + a.span - 1).toBeLessThanOrEqual(branch.columns);
            for (const b of branch.placements) {
              if (a === b || a.row !== b.row) continue;
              expect(a.column + a.span <= b.column || b.column + b.span <= a.column).toBe(true);
            }
          }
        }
        count += placements.length;
      }
    }
    expect(count).toBe(419);
  });
});
