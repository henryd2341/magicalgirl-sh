import type { SkillTreeNode } from "@/types/content";

export const SKILL_CARD_WIDTH = 280;
export const SKILL_LANE_GAP = 64;
export const SKILL_ROW_GAP = 96;

export interface SkillPlacement {
  node: SkillTreeNode;
  column: number;
  span: number;
  row: number;
  parentId?: string;
}

export interface SkillBranch {
  id: string;
  columns: number;
  placements: SkillPlacement[];
}

export interface SkillBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function skillBlockWidth(node: SkillTreeNode): number {
  const columns = Math.max(1, node.prerequisites.length);
  return columns * SKILL_CARD_WIDTH + (columns - 1) * SKILL_LANE_GAP;
}

/** Multi-parent roots use named jump references, never cross another family. */
export function buildSkillBranches(nodes: SkillTreeNode[]): SkillBranch[] {
  const byId = new Map(nodes.map((node) => [node.skillId, node]));
  const visited = new Set<string>();
  const visiting = new Set<string>();
  function visit(id: string) {
    if (visiting.has(id)) throw new Error(`循环依赖：${id}`);
    if (visited.has(id)) return;
    visiting.add(id);
    for (const parent of byId.get(id)?.prerequisites ?? []) {
      if (byId.has(parent)) visit(parent);
    }
    visiting.delete(id);
    visited.add(id);
  }
  nodes.forEach((node) => visit(node.skillId));

  const children = new Map<string, SkillTreeNode[]>();
  const roots: SkillTreeNode[] = [];
  for (const node of nodes) {
    const parent = node.prerequisites.length === 1 ? node.prerequisites[0] : undefined;
    if (parent && byId.has(parent)) {
      const siblings = children.get(parent) ?? [];
      siblings.push(node);
      children.set(parent, siblings);
    } else {
      roots.push(node);
    }
  }

  const spans = new Map<string, number>();
  function measure(node: SkillTreeNode): number {
    const childSpan = (children.get(node.skillId) ?? []).reduce((total, child) => total + measure(child), 0);
    const span = Math.max(1, node.prerequisites.length, childSpan);
    spans.set(node.skillId, span);
    return span;
  }
  return roots.map((root) => {
    const columns = measure(root);
    const placements: SkillPlacement[] = [];
    function place(
      node: SkillTreeNode,
      column: number,
      row: number,
      parentId?: string,
      span = spans.get(node.skillId)!,
    ) {
      placements.push({ node, column, row, span, parentId });
      const descendants = children.get(node.skillId) ?? [];
      if (descendants.length === 1) {
        place(descendants[0], column, row + 1, node.skillId, span);
        return;
      }
      const childSpan = descendants.reduce((sum, child) => sum + spans.get(child.skillId)!, 0);
      let nextColumn = column + Math.floor((span - childSpan) / 2);
      for (const child of descendants) {
        place(child, nextColumn, row + 1, node.skillId);
        nextColumn += spans.get(child.skillId)!;
      }
    }
    place(root, 1, 1);
    return { id: root.skillId, columns, placements };
  });
}

/** Bounds come from CSS grid after text layout, not a guessed card height. */
export function routeSkillEdges(branch: SkillBranch, bounds: Map<string, SkillBounds>) {
  return branch.placements.flatMap(({ node, parentId }) => {
    const parent = parentId ? bounds.get(parentId) : undefined;
    const child = bounds.get(node.skillId);
    if (!parent || !child) return [];
    const fromX = parent.x + parent.width / 2;
    const fromY = parent.y + parent.height;
    const toX = child.x + child.width / 2;
    const mergeY = child.y - SKILL_ROW_GAP / 2;
    return [
      {
        fromId: parentId!,
        toId: node.skillId,
        path: `M ${fromX} ${fromY} V ${mergeY} H ${toX} V ${child.y}`,
      },
    ];
  });
}
