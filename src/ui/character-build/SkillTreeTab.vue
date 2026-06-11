<script setup lang="ts">
import { getCharacterByName, getSkill } from "@/content/contentRegistry";
import { useSessionStore } from "@/stores/sessionStore";
import { computed, onMounted, onUnmounted, reactive, ref, watch } from "vue";
import type { SkillTreeNode, CharacterContent, SkillCategory } from "@/types/content";
import { SKILL_CATEGORIES } from "@/types/content";

const props = defineProps<{
  characterId: string;
}>();

const CATEGORY_LABELS: Record<SkillCategory, string> = {
  physical: "物理",
  magic: "魔法",
  heal: "回复",
  support: "辅助",
  passive: "被动",
};

const CATEGORY_ICONS: Record<SkillCategory, string> = {
  physical: "fa-fist-raised",
  magic: "fa-magic",
  heal: "fa-heart",
  support: "fa-shield-alt",
  passive: "fa-circle",
};

const sessionStore = useSessionStore();
const currentLevel = ref(1);
const currentMoney = ref(0);
const loading = ref(true);
const learnResult = ref<string | null>(null);
const activeCategory = ref<SkillCategory>("physical");

// ── Drag-to-pan state ──
const pan = reactive({ x: 0, y: 0 });
const isPanning = ref(false);
let panStartX = 0;
let panStartY = 0;
let panStartPanX = 0;
let panStartPanY = 0;

function onPanStart(e: MouseEvent) {
  if ((e.target as HTMLElement).closest(".skilltree-tab__node--learnable")) return;
  isPanning.value = true;
  panStartX = e.clientX;
  panStartY = e.clientY;
  panStartPanX = pan.x;
  panStartPanY = pan.y;
}

function onPanMove(e: MouseEvent) {
  if (!isPanning.value) return;
  e.preventDefault();
  pan.x = panStartPanX + (e.clientX - panStartX);
  pan.y = panStartPanY + (e.clientY - panStartY);
}

function onPanEnd() {
  isPanning.value = false;
  clampPan();
}

// ── Touch pan handlers ──
function onTouchStart(e: TouchEvent) {
  if ((e.target as HTMLElement).closest(".skilltree-tab__node--learnable")) return;
  isPanning.value = true;
  panStartX = e.touches[0].clientX;
  panStartY = e.touches[0].clientY;
  panStartPanX = pan.x;
  panStartPanY = pan.y;
}

function onTouchMove(e: TouchEvent) {
  if (!isPanning.value) return;
  pan.x = panStartPanX + (e.touches[0].clientX - panStartX);
  pan.y = panStartPanY + (e.touches[0].clientY - panStartY);
}

function onTouchEnd() {
  isPanning.value = false;
  clampPan();
}

// ── Boundary clamping ──
function clampPan() {
  const container = document.querySelector(".skilltree-tab__graph-wrap");
  if (!container) return;
  const cw = container.clientWidth;
  const ch = container.clientHeight;
  const tw = totalWidth.value;
  const th = totalHeight.value;
  // Allow 30% overhang, don't let nodes escape left/top edge
  const maxPanX = Math.max(0, tw * 0.3);
  const minPanX = cw - tw - 20;
  const maxPanY = Math.max(0, th * 0.3);
  const minPanY = ch - th - 20;
  pan.x = Math.max(minPanX, Math.min(maxPanX, pan.x));
  pan.y = Math.max(minPanY, Math.min(maxPanY, pan.y));
}

onMounted(() => {
  window.addEventListener("mousemove", onPanMove);
  window.addEventListener("mouseup", onPanEnd);
  window.addEventListener("touchmove", onTouchMove, { passive: true });
  window.addEventListener("touchend", onTouchEnd);
});

onUnmounted(() => {
  window.removeEventListener("mousemove", onPanMove);
  window.removeEventListener("mouseup", onPanEnd);
  window.removeEventListener("touchmove", onTouchMove);
  window.removeEventListener("touchend", onTouchEnd);
});

// ── Load data ──

onMounted(async () => {
  await refreshData();
});

async function refreshData() {
  loading.value = true;
  try {
    const varState = await sessionStore.getVariableSnapshot();
    if (varState) {
      const charState = varState.root.characters[props.characterId];
      const isPlayer = charState?.displayName === varState.root.player?.profile?.name;
      if (isPlayer || !charState?.combat) {
        currentLevel.value = varState.root.player.combat.level;
        currentMoney.value = varState.root.player.money;
      } else if (charState?.combat) {
        currentLevel.value = charState.combat.level;
        currentMoney.value = varState.root.player.money;
      }
    }
  } catch {
    // Keep defaults
  }
  loading.value = false;
}

// ── Character data ──

const isPlayerChar = computed(() => props.characterId === "__player__");

const character = computed<CharacterContent | null>(() => {
  const lookupId = isPlayerChar.value ? "player" : props.characterId;
  try {
    return getCharacterByName(lookupId);
  } catch {
    return null;
  }
});

// ── Category counts ──

const categoryCounts = computed(() => {
  const counts: Record<string, number> = {};
  for (const cat of SKILL_CATEGORIES) counts[cat] = 0;
  const tree = character.value?.skillTree ?? [];
  for (const node of tree) {
    try {
      const skill = getSkill(node.skillId);
      counts[skill.category] = (counts[skill.category] ?? 0) + 1;
    } catch { /* skip */ }
  }
  return counts;
});

// ── Filtered tree by category ──

const filteredTreeNodes = computed(() => {
  const tree = character.value?.skillTree ?? [];
  return tree.filter((node) => {
    try {
      return getSkill(node.skillId).category === activeCategory.value;
    } catch {
      return false;
    }
  });
});

// ── DAG Layout ──

interface LayoutNode {
  skillId: string;
  name: string;
  description: string;
  cost: number;
  requiredLevel: number;
  prerequisites: string[];
  depth: number;
  x: number;
  y: number;
  state: "learned" | "learnable" | "locked";
  missingConditions: string[];
  isGhost?: boolean;
  ghostFromCategory?: string;
}

interface LayoutEdge {
  fromId: string;
  toId: string;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  isGhost?: boolean;
}

const charLearned = computed(() => {
  const allLearned = sessionStore.learnedSkills as unknown as Map<string, Set<string>>;
  let key = props.characterId;
  if (isPlayerChar.value) {
    // Protagonist learned skills use "player" key in learnedSkills map
    key = "player";
  }
  return allLearned.get(key) ?? new Set<string>();
});

const allNodesMap = computed(() => {
  const tree = character.value?.skillTree ?? [];
  const result = new Map<string, LayoutNode>();
  for (const node of tree) {
    const isLearned = charLearned.value.has(node.skillId);
    const meetsLevel = currentLevel.value >= node.requiredLevel;
    const meetsPrereqs = node.prerequisites.length === 0 || node.prerequisites.every(p => charLearned.value.has(p));
    const meetsMoney = currentMoney.value >= node.cost;

    let state: "learned" | "learnable" | "locked";
    const missing: string[] = [];
    if (isLearned) {
      state = "learned";
    } else if (meetsLevel && meetsPrereqs && meetsMoney) {
      state = "learnable";
    } else {
      state = "locked";
      if (!meetsLevel) missing.push(`需要Lv.${node.requiredLevel}`);
      if (!meetsPrereqs) missing.push("缺少前置技能");
      if (!meetsMoney) missing.push(`需要${node.cost}G`);
    }

    let skillName = node.skillId;
    let skillDesc = "";
    try {
      const sk = getSkill(node.skillId);
      skillName = sk.name;
      skillDesc = sk.description;
    } catch { /* skill not found */ }

    result.set(node.skillId, {
      skillId: node.skillId,
      name: skillName,
      description: skillDesc,
      cost: node.cost,
      requiredLevel: node.requiredLevel,
      prerequisites: node.prerequisites,
      depth: 0,
      x: 0,
      y: 0,
      state,
      missingConditions: missing,
    });
  }
  return result;
});

// ── Node states for current category (with ghost references) ──

const nodeStates = computed(() => {
  const result = new Map(allNodesMap.value);
  const filtered = filteredTreeNodes.value;
  const filteredIds = new Set(filtered.map(n => n.skillId));

  // Add ghost nodes for cross-category prerequisites
  const ghostNodes = new Map<string, LayoutNode>();
  for (const node of filtered) {
    for (const prereqId of node.prerequisites) {
      if (!filteredIds.has(prereqId) && !ghostNodes.has(prereqId)) {
        const prereqNode = allNodesMap.value.get(prereqId);
        if (prereqNode) {
          let ghostCategory = "physical";
          try {
            ghostCategory = getSkill(prereqId).category;
          } catch { /* */ }
          ghostNodes.set(prereqId, {
            ...prereqNode,
            isGhost: true,
            ghostFromCategory: ghostCategory,
            state: "locked",
            missingConditions: [`需先学习 ${CATEGORY_LABELS[ghostCategory as SkillCategory] ?? ghostCategory} 技能`],
          });
        }
      }
    }
  }

  // Return only filtered nodes + ghost references
  const final = new Map<string, LayoutNode>();
  for (const node of filtered) {
    final.set(node.skillId, result.get(node.skillId)!);
  }
  for (const [id, ghost] of ghostNodes) {
    final.set(id, ghost);
  }

  return final;
});

// ── Cycle detection ──

const cycleResult = computed(() => {
  const nodes = nodeStates.value;
  const adj = new Map<string, string[]>();
  for (const [id, node] of nodes) {
    if (node.isGhost) continue;
    adj.set(id, node.prerequisites.filter(p => nodes.has(p) && !nodes.get(p)?.isGhost));
  }

  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = new Map<string, number>();
  const parent = new Map<string, string | null>();
  for (const id of nodes.keys()) color.set(id, WHITE);

  let cyclePath: string[] = [];
  let found = false;

  function dfs(u: string) {
    if (found) return;
    color.set(u, GRAY);
    const prereqs = adj.get(u) ?? [];
    for (const v of prereqs) {
      if (!color.has(v)) continue;
      if (color.get(v) === GRAY) {
        found = true;
        cyclePath = [v, u];
        let cur = u;
        while (cur !== v && parent.has(cur)) {
          cur = parent.get(cur)!;
          cyclePath.push(cur);
        }
        cyclePath.reverse();
        return;
      }
      if (color.get(v) === WHITE) {
        parent.set(v, u);
        dfs(v);
      }
    }
    color.set(u, BLACK);
  }

  for (const id of nodes.keys()) {
    if (color.get(id) === WHITE && !found) dfs(id);
  }

  return { hasCycle: found, cyclePath };
});

// ── Layout ──

const layoutNodes = computed(() => {
  if (cycleResult.value.hasCycle) return [];

  const nodes = new Map(nodeStates.value);
  const nodeList = Array.from(nodes.values()).filter(n => !n.isGhost);

  // Compute depth
  let changed = true;
  while (changed) {
    changed = false;
    for (const node of nodeList) {
      if (node.prerequisites.length === 0) {
        if (node.depth !== 0) { node.depth = 0; changed = true; }
      } else {
        let maxDepth = -1;
        for (const p of node.prerequisites) {
          const pn = nodes.get(p);
          if (pn && !pn.isGhost) maxDepth = Math.max(maxDepth, pn.depth);
        }
        if (maxDepth >= 0 && node.depth !== maxDepth + 1) {
          node.depth = maxDepth + 1;
          changed = true;
        }
      }
    }
  }

  // Group by depth
  const byDepth = new Map<number, LayoutNode[]>();
  for (const node of nodeList) {
    const list = byDepth.get(node.depth) ?? [];
    list.push(node);
    byDepth.set(node.depth, list);
  }

  const NODE_WIDTH = 140;
  const H_GAP = 24;
  const V_GAP = 60;
  const PADDING = 16;

  for (const [, layer] of byDepth) {
    const startX = PADDING;
    for (let i = 0; i < layer.length; i++) {
      layer[i].x = startX + i * (NODE_WIDTH + H_GAP);
      layer[i].y = PADDING + layer[i].depth * (NODE_HEIGHT + V_GAP);
    }
  }

  // Place ghost nodes near the nodes that reference them
  for (const node of nodes.values()) {
    if (node.isGhost) {
      // Find the first real node that depends on this ghost
      const dependent = nodeList.find(n => n.prerequisites.includes(node.skillId));
      if (dependent) {
        node.x = dependent.x;
        node.y = dependent.y + NODE_HEIGHT + 4; // Below the dependent, avoiding overlap with next layer
      } else {
        node.x = PADDING;
        node.y = PADDING + (byDepth.size) * (NODE_HEIGHT + V_GAP);
      }
    }
  }

  return Array.from(nodes.values());
});

const NODE_HEIGHT = 56;

const totalWidth = computed(() => {
  if (layoutNodes.value.length === 0) return 400;
  const maxX = Math.max(...layoutNodes.value.map(n => n.x + 140));
  return Math.max(maxX + 24, 400);
});

const totalHeight = computed(() => {
  if (layoutNodes.value.length === 0) return 300;
  const maxY = Math.max(...layoutNodes.value.map(n => n.y + NODE_HEIGHT));
  return Math.max(maxY + 24, 300);
});

const edges = computed<LayoutEdge[]>(() => {
  if (cycleResult.value.hasCycle) return [];
  const result: LayoutEdge[] = [];
  for (const node of layoutNodes.value) {
    for (const prereqId of node.prerequisites) {
      const prereq = layoutNodes.value.find(n => n.skillId === prereqId);
      if (!prereq) continue;
      result.push({
        fromId: prereqId,
        toId: node.skillId,
        fromX: prereq.x + 70,
        fromY: prereq.y + NODE_HEIGHT,
        toX: node.x + 70,
        toY: node.y,
        isGhost: prereq.isGhost || node.isGhost,
      });
    }
  }
  return result;
});

function nodeStyle(node: LayoutNode) {
  return {
    left: `${node.x}px`,
    top: `${node.y}px`,
    width: '140px',
  };
}

function edgePath(edge: LayoutEdge): string {
  const cp1x = edge.fromX;
  const cp1y = edge.fromY + Math.abs(edge.toY - edge.fromY) * 0.4;
  const cp2x = edge.toX;
  const cp2y = edge.toY - Math.abs(edge.toY - edge.fromY) * 0.4;
  return `M ${edge.fromX} ${edge.fromY} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${edge.toX} ${edge.toY}`;
}

// ── Actions ──

function getContentCharId(): string {
  return isPlayerChar.value ? "player" : props.characterId;
}

async function handleLearnSkill(skillId: string) {
  const result = await sessionStore.learnSkill(getContentCharId(), skillId);
  if (result === "ok") {
    await refreshData();
    learnResult.value = "学习了技能！";
  } else {
    const messages: Record<string, string> = {
      not_in_tree: "技能不在技能树中",
      already_learned: "已学习该技能",
      level_insufficient: "等级不足",
      missing_prerequisites: "缺少前置技能",
      insufficient_money: "金钱不足",
    };
    learnResult.value = messages[result] ?? "学习失败";
  }
  setTimeout(() => { learnResult.value = null; }, 3000);
}

// Reset pan on category change
watch(activeCategory, () => {
  pan.x = 0;
  pan.y = 0;
});
</script>

<template>
  <div class="skilltree-tab">
    <!-- Toast -->
    <div v-if="learnResult" class="skilltree-tab__toast">{{ learnResult }}</div>

    <!-- Loading -->
    <div v-if="loading" class="skilltree-tab__loading">
      <i class="fas fa-spinner fa-spin"></i> 加载技能树...
    </div>

    <!-- No character -->
    <div v-else-if="!character" class="skilltree-tab__empty">
      <i class="fas fa-exclamation-triangle"></i> 未找到角色数据
    </div>

    <!-- Cycle error -->
    <div v-else-if="cycleResult.hasCycle" class="skilltree-tab__error">
      <i class="fas fa-exclamation-triangle"></i>
      <p>技能树配置错误：检测到循环依赖</p>
      <p v-if="cycleResult.cyclePath.length" class="skilltree-tab__error-path">
        循环路径: {{ cycleResult.cyclePath.join(" → ") }}
      </p>
    </div>

    <!-- Normal view -->
    <template v-else>
      <!-- Category tabs -->
      <nav class="skilltree-tab__cats">
        <button
          v-for="cat in SKILL_CATEGORIES"
          :key="cat"
          class="skilltree-tab__cat"
          :class="{
            'skilltree-tab__cat--active': activeCategory === cat,
            [`skilltree-tab__cat--${cat}`]: true,
          }"
          @click="activeCategory = cat"
        >
          <i :class="['fas', CATEGORY_ICONS[cat]]"></i>
          {{ CATEGORY_LABELS[cat] }}
          <span class="skilltree-tab__cat-count">{{ categoryCounts[cat] ?? 0 }}</span>
        </button>
      </nav>

      <!-- Passive: show as simple list (not a DAG) -->
      <div v-if="activeCategory === 'passive'" class="skilltree-tab__passive-list mg-scroll">
        <div
          v-for="node in layoutNodes.filter(n => !n.isGhost)"
          :key="node.skillId"
          class="skilltree-tab__passive-row"
          :class="`skilltree-tab__passive-row--${node.state}`"
        >
          <div class="skilltree-tab__passive-info">
            <span class="skilltree-tab__passive-name">{{ node.name }}</span>
            <span class="skilltree-tab__passive-desc">{{ node.description }}</span>
          </div>
          <div class="skilltree-tab__passive-cost">
            <span v-if="node.state === 'learnable'">{{ node.cost }}G</span>
            <span v-else-if="node.state === 'locked'" class="skilltree-tab__node-missing">
              <span v-for="cond in node.missingConditions" :key="cond" class="skilltree-tab__node-cond">{{ cond }}</span>
            </span>
          </div>
          <button
            v-if="node.state === 'learnable'"
            class="skilltree-tab__learn-btn"
            @click="handleLearnSkill(node.skillId)"
          >
            <i class="fas fa-graduation-cap"></i> 学习
          </button>
          <span v-else-if="node.state === 'learned'" class="skilltree-tab__learned-badge">
            <i class="fas fa-check"></i> 已学习
          </span>
        </div>
        <div v-if="layoutNodes.filter(n => !n.isGhost).length === 0" class="skilltree-tab__empty">
          <i class="fas fa-circle"></i> 该角色没有被动技能
        </div>
      </div>

      <!-- Active (non-passive) categories: DAG graph with drag-to-pan -->
      <div
        v-else
        class="skilltree-tab__graph-wrap"
        :class="{ 'skilltree-tab__graph-wrap--grabbing': isPanning }"
        @mousedown="onPanStart"
      >
        <div
          class="skilltree-tab__graph"
          :style="{
            width: totalWidth + 'px',
            height: totalHeight + 'px',
            transform: `translate(${pan.x}px, ${pan.y}px)`,
          }"
        >
          <!-- SVG edges -->
          <svg class="skilltree-tab__edges" :width="totalWidth" :height="totalHeight">
            <path
              v-for="edge in edges"
              :key="`${edge.fromId}-${edge.toId}`"
              :d="edgePath(edge)"
              class="skilltree-tab__edge"
              :class="{ 'skilltree-tab__edge--ghost': edge.isGhost }"
            />
          </svg>

          <!-- Nodes -->
          <div
            v-for="node in layoutNodes"
            :key="node.skillId"
            class="skilltree-tab__node"
            :class="[
              `skilltree-tab__node--${node.state}`,
              { 'skilltree-tab__node--ghost': node.isGhost },
            ]"
            :style="nodeStyle(node)"
            :title="node.description"
          >
            <span v-if="node.isGhost" class="skilltree-tab__node-ghost-tag">
              {{ node.ghostFromCategory ? CATEGORY_LABELS[node.ghostFromCategory as SkillCategory] : '其他' }}
            </span>
            <span class="skilltree-tab__node-name">{{ node.name }}</span>
            <span v-if="node.state === 'learnable' && !node.isGhost" class="skilltree-tab__node-cost">{{ node.cost }}G</span>
            <div v-if="node.state === 'locked' && !node.isGhost" class="skilltree-tab__node-missing">
              <span v-for="cond in node.missingConditions" :key="cond" class="skilltree-tab__node-cond">{{ cond }}</span>
            </div>

            <!-- Only learn button (no equip/unequip) -->
            <div v-if="node.state === 'learnable' && !node.isGhost" class="skilltree-tab__node-actions">
              <button
                class="skilltree-tab__action-btn skilltree-tab__action-btn--learn"
                @click.stop="handleLearnSkill(node.skillId)"
                title="学习技能"
              >
                <i class="fas fa-graduation-cap"></i>
              </button>
            </div>
            <div v-else-if="node.state === 'learned' && !node.isGhost" class="skilltree-tab__node-check">
              <i class="fas fa-check-circle"></i>
            </div>
          </div>
        </div>

        <!-- Pan hint -->
        <div v-if="layoutNodes.length > 6" class="skilltree-tab__pan-hint">
          <i class="fas fa-arrows-alt"></i> 拖拽平移
        </div>
      </div>
    </template>
  </div>
</template>

<style lang="scss" scoped>
.skilltree-tab {
  position: relative;
  min-height: 300px;
}

// ── Toast ──
.skilltree-tab__toast {
  position: absolute;
  top: 0;
  left: 50%;
  transform: translateX(-50%);
  z-index: 10;
  padding: 6px 16px;
  border: var(--mg-border-width) var(--mg-border-width) var(--mg-border);
  border-radius: var(--mg-radius-pill);
  background: var(--mg-surface-pink);
  color: var(--mg-ink-outline);
  font-weight: 700;
  font-size: 0.85rem;
  animation: skilltree-toast-in 0.2s ease;
  white-space: nowrap;
}

@keyframes skilltree-toast-in {
  from { opacity: 0; transform: translateX(-50%) translateY(-8px); }
  to   { opacity: 1; transform: translateX(-50%) translateY(0); }
}

// ── Category tabs ──
.skilltree-tab__cats {
  display: flex;
  gap: 4px;
  margin-bottom: var(--mg-space-md);
  flex-wrap: wrap;
}

.skilltree-tab__cat {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 12px;
  border: var(--mg-border-width) solid var(--mg-border);
  border-radius: var(--mg-radius-pill);
  background: var(--mg-bg-card);
  color: var(--mg-text-secondary);
  cursor: pointer;
  font-family: var(--mg-font-heading);
  font-size: 0.75rem;
  font-weight: 600;
  transition: all var(--mg-transition-fast);

  i { font-size: 0.65rem; }

  &:hover {
    border-color: var(--mg-border-strong);
    color: var(--mg-text);
  }

  &--active {
    color: var(--mg-ink-outline);
    box-shadow: 0 0 6px rgba(0,0,0,0.12);

    &.skilltree-tab__cat--physical { background: #e74c3c; border-color: #c0392b; }
    &.skilltree-tab__cat--magic    { background: #8e44ad; border-color: #6c3483; }
    &.skilltree-tab__cat--heal     { background: #27ae60; border-color: #1e8449; }
    &.skilltree-tab__cat--support  { background: #2980b9; border-color: #1f6dad; }
    &.skilltree-tab__cat--passive  { background: #7f8c8d; border-color: #667273; }
  }
}

.skilltree-tab__cat-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  height: 18px;
  padding: 0 4px;
  border-radius: 9px;
  background: rgba(255,255,255,0.3);
  font-size: 0.65rem;
  color: inherit;
}

// ── Loading / Empty / Error ──
.skilltree-tab__loading,
.skilltree-tab__empty,
.skilltree-tab__error {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--mg-space-sm);
  padding: var(--mg-space-2xl);
  color: var(--mg-text-secondary);
  text-align: center;

  i { font-size: 2rem; opacity: 0.4; }
}

.skilltree-tab__error-path {
  font-size: 0.8rem;
  font-family: monospace;
  color: var(--mg-accent-strong);
  opacity: 0.7;
}

// ── Passive list ──
.skilltree-tab__passive-list {
  max-height: 400px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.skilltree-tab__passive-row {
  display: flex;
  align-items: center;
  gap: var(--mg-space-sm);
  padding: 8px 12px;
  border: var(--mg-border-width) solid var(--mg-border);
  border-radius: var(--mg-radius);
  background: var(--mg-bg-card);
  font-size: 0.82rem;

  &--learned { border-color: var(--mg-success); background: rgba(100,220,100,0.06); }
  &--learnable { border-color: var(--mg-accent); }
  &--locked { opacity: 0.5; }
}

.skilltree-tab__passive-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.skilltree-tab__passive-name {
  font-weight: 700;
}

.skilltree-tab__passive-desc {
  font-size: 0.72rem;
  color: var(--mg-text-secondary);
}

.skilltree-tab__learn-btn {
  padding: 4px 12px;
  border: 1px solid var(--mg-accent);
  border-radius: var(--mg-radius-pill);
  background: var(--mg-accent);
  color: var(--mg-ink-outline);
  cursor: pointer;
  font-weight: 700;
  font-size: 0.75rem;
  white-space: nowrap;

  &:hover { filter: brightness(1.1); }
}

.skilltree-tab__learned-badge {
  color: var(--mg-success);
  font-size: 0.75rem;
  font-weight: 600;
  white-space: nowrap;
}

// ── Graph wrap (drag-to-pan) ──
.skilltree-tab__graph-wrap {
  overflow: hidden;
  position: relative;
  cursor: grab;
  min-height: 250px;

  &--grabbing {
    cursor: grabbing;
  }
}

.skilltree-tab__graph {
  position: relative;
  transition: none;
}

.skilltree-tab__pan-hint {
  position: absolute;
  bottom: 8px;
  right: 12px;
  font-size: 0.65rem;
  color: var(--mg-text-muted);
  opacity: 0.5;
  pointer-events: none;
}

// ── SVG edges ──
.skilltree-tab__edges {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 0;
}

.skilltree-tab__edge {
  fill: none;
  stroke: var(--mg-border-strong);
  stroke-width: 2px;
  opacity: 0.5;

  &--ghost {
    stroke-dasharray: 5 3;
    opacity: 0.3;
    stroke: var(--mg-text-muted);
  }
}

// ── Nodes ──
.skilltree-tab__node {
  position: absolute;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  padding: 6px 8px;
  border: var(--mg-border-width) solid var(--mg-border);
  border-radius: var(--mg-radius);
  background: var(--mg-bg-card);
  color: var(--mg-text);
  cursor: default;
  transition: box-shadow var(--mg-transition-fast);
  z-index: 1;
  font-size: 0.78rem;
  text-align: center;
  min-height: 48px;
  box-sizing: border-box;

  &:hover { z-index: 3; }

  &--ghost {
    opacity: 0.45;
    border-style: dashed;
    background: var(--mg-bg-card);
    filter: none;
    z-index: 0;
    pointer-events: none;
    min-height: 32px;
    height: 32px;
    font-size: 0.65rem;

    &:hover { z-index: 0; }
  }
}

.skilltree-tab__node-ghost-tag {
  position: absolute;
  top: -8px;
  right: -4px;
  padding: 1px 6px;
  border-radius: 8px;
  background: var(--mg-bg-card);
  border: 1px solid var(--mg-border);
  font-size: 0.55rem;
  color: var(--mg-text-muted);
  white-space: nowrap;
}

// Learned
.skilltree-tab__node--learned {
  border-color: var(--mg-success);
  background: linear-gradient(135deg, var(--mg-bg-card) 0%, rgba(100,220,100,0.12) 100%);
  box-shadow: 0 0 6px rgba(100,220,100,0.2);
}

// Learnable
.skilltree-tab__node--learnable {
  border-color: var(--mg-accent);
  background: linear-gradient(135deg, var(--mg-bg-card) 0%, var(--mg-surface-pink) 100%);
  cursor: pointer;
  box-shadow: var(--mg-glow-pink);

  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(255,107,157,0.3);
  }
}

// Locked
.skilltree-tab__node--locked {
  border-color: var(--mg-border);
  opacity: 0.55;
  filter: grayscale(0.3);
}

.skilltree-tab__node-name {
  font-weight: 700;
  font-size: 0.82rem;
  line-height: 1.2;
}

.skilltree-tab__node-cost {
  font-size: 0.68rem;
  color: var(--mg-ink-outline);
  font-weight: 600;
}

.skilltree-tab__node-missing {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.skilltree-tab__node-cond {
  font-size: 0.6rem;
  color: var(--mg-text-muted);
  line-height: 1.2;
}

.skilltree-tab__node-check {
  color: var(--mg-success);
  font-size: 0.85rem;
  margin-top: 2px;
}

// ── Action button ──
.skilltree-tab__node-actions {
  display: flex;
  gap: 4px;
  margin-top: 2px;
}

.skilltree-tab__action-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border: 1px solid var(--mg-border);
  border-radius: var(--mg-radius-pill);
  background: var(--mg-bg-card);
  cursor: pointer;
  font-size: 0.65rem;
  transition: all var(--mg-transition-fast);
  padding: 0;

  &:hover { transform: scale(1.15); }

  &--learn {
    color: var(--mg-accent);
    border-color: var(--mg-accent);
    &:hover { background: var(--mg-surface-pink); }
  }
}

// ═══════════════════════════════════════════
// Mobile: touch-optimized panning
// ═══════════════════════════════════════════
@media (max-width: 639px) {
  .skilltree-tab__graph-wrap {
    overflow: auto;
    -webkit-overflow-scrolling: touch;
    touch-action: none;
    min-height: 350px;
  }

  .skilltree-tab__cats {
    overflow-x: auto;
    flex-wrap: nowrap;
    padding-bottom: 4px;
    -webkit-overflow-scrolling: touch;
  }

  .skilltree-tab__cat {
    flex-shrink: 0;
  }

  .skilltree-tab__pan-hint {
    display: none;
  }
}

@media (max-width: 399px) {
  .skilltree-tab__node {
    width: 110px !important;
    font-size: 0.7rem;
    padding: 4px 6px;
    min-height: 40px;
  }
}
</style>
