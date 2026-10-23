<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { getCharacterByName, getSkill } from "@/content/contentRegistry";
import { useSessionStore } from "@/stores/sessionStore";
import { SKILL_CATEGORIES, type SkillCategory, type SkillTreeNode } from "@/types/content";
import {
  buildSkillBranches,
  routeSkillEdges,
  skillBlockWidth,
  SKILL_CARD_WIDTH,
  SKILL_LANE_GAP,
  SKILL_ROW_GAP,
  type SkillBounds,
} from "@/ui/character-build/skillTreeLayout";

const props = defineProps<{ characterId: string }>();
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
const STATE_LABELS = { learned: "已学习", learnable: "可学习", locked: "未解锁" };
const sessionStore = useSessionStore();
const activeCategory = ref<SkillCategory>("physical");
const selectedBranch = ref("");
const viewport = ref<HTMLElement>();
const zoom = ref(1);
const dragging = ref(false);
let pan: { pointerId: number; target: Element; x: number; y: number; left: number; top: number } | undefined;
let suppressClick = false;
const currentLevel = ref(1);
const currentMoney = ref(0);
const loading = ref(true);
const loadError = ref(false);
const learnResult = ref("");
const learning = ref(false);
const focusedSkill = ref("");
let refreshVersion = 0;
let toastTimer: ReturnType<typeof setTimeout> | undefined;
let observer: ResizeObserver | undefined;

const contentCharacterId = computed(() => (props.characterId === "__player__" ? "player" : props.characterId));
const contentResult = computed(() => {
  try {
    const character = getCharacterByName(contentCharacterId.value);
    const ids = new Set(character.skillTree.flatMap((node) => [node.skillId, ...node.prerequisites]));
    const skills = new Map(Array.from(ids, (id) => [id, getSkill(id)]));
    return { character, skills, error: "" };
  } catch (error) {
    const missingCharacter = error instanceof Error
      && error.message === `Character not found: "${contentCharacterId.value}"`;
    return { character: null, skills: new Map<string, ReturnType<typeof getSkill>>(), error: missingCharacter ? "" : String(error) };
  }
});
const character = computed(() => contentResult.value.character);
const learned = computed(() => sessionStore.learnedSkills.get(contentCharacterId.value) ?? new Set<string>());
const tree = computed(() => character.value?.skillTree ?? []);
const skills = computed(() => contentResult.value.skills);
const categoryCounts = computed(() =>
  Object.fromEntries(
    SKILL_CATEGORIES.map((category) => [
      category,
      tree.value.filter((node) => skills.value.get(node.skillId)?.category === category).length,
    ]),
  ),
);
const categoryTree = computed(() =>
  tree.value.filter((node) => skills.value.get(node.skillId)?.category === activeCategory.value),
);
const branchResult = computed(() => {
  try {
    return { branches: buildSkillBranches(categoryTree.value), error: "" };
  } catch (error) {
    return { branches: [], error: String(error) };
  }
});
const branches = computed(() => branchResult.value.branches);
const visibleBranches = computed(() =>
  selectedBranch.value === "all"
    ? branches.value
    : branches.value.filter((branch) => branch.id === selectedBranch.value),
);
const stateById = computed(
  () =>
    new Map(
      tree.value.map((node) => {
        const missing: string[] = [];
        if (currentLevel.value < node.requiredLevel) missing.push(`需要 Lv.${node.requiredLevel}`);
        if (node.prerequisites.some((id) => !learned.value.has(id))) missing.push("缺少前置技能");
        if (currentMoney.value < node.cost) missing.push(`需要 ${node.cost} G`);
        const state = learned.value.has(node.skillId) ? "learned" : missing.length ? "locked" : "learnable";
        return [node.skillId, { state, missing }] as const;
      }),
    ),
);
const focusRoute = computed(() => {
  const route = new Set<string>();
  const visit = (id: string) => {
    if (route.has(id)) return;
    route.add(id);
    tree.value.find((node) => node.skillId === id)?.prerequisites.forEach(visit);
  };
  if (focusedSkill.value) visit(focusedSkill.value);
  return route;
});
const edgePaths = ref<Record<string, ReturnType<typeof routeSkillEdges>>>({});

function branchName(id: string) {
  return skills.value.get(id)?.name ?? id;
}
function prerequisiteLabel(id: string) {
  const skill = skills.value.get(id)!;
  const state = learned.value.has(id) ? "已学习" : "未学习";
  return `${skill.name} · ${CATEGORY_LABELS[skill.category]} · ${state}`;
}
function hasTreeNode(id: string) {
  return tree.value.some((node) => node.skillId === id);
}
function blockStyle(node: SkillTreeNode, column: number, span: number, row: number) {
  if (activeCategory.value === "passive") return {};
  return { gridColumn: `${column} / span ${span}`, gridRow: row, width: `${skillBlockWidth(node)}px` };
}

async function refreshData() {
  const version = ++refreshVersion;
  loading.value = true;
  loadError.value = false;
  try {
    const snapshot = await sessionStore.getVariableSnapshot();
    if (version !== refreshVersion) return;
    if (!snapshot) throw new Error("存档尚未就绪");
    // Match the store's purchase gate; companion combat levels are not purchase levels.
    currentLevel.value = snapshot.root.player.combat.level;
    currentMoney.value = snapshot.root.player.money;
  } catch {
    if (version === refreshVersion) loadError.value = true;
  } finally {
    if (version === refreshVersion) loading.value = false;
  }
}

function measureConnections() {
  const paths: typeof edgePaths.value = {};
  for (const branch of visibleBranches.value) {
    const graph = Array.from(viewport.value?.querySelectorAll<HTMLElement>("[data-branch-graph]") ?? []).find(
      (element) => element.dataset.branchGraph === branch.id,
    );
    if (!graph || activeCategory.value === "passive") continue;
    const origin = graph.getBoundingClientRect();
    const bounds = new Map<string, SkillBounds>();
    for (const block of graph.querySelectorAll<HTMLElement>("[data-skill-block]")) {
      const rect = block.getBoundingClientRect();
      bounds.set(block.dataset.skillBlock!, {
        x: (rect.left - origin.left) / zoom.value,
        y: (rect.top - origin.top) / zoom.value,
        width: rect.width / zoom.value,
        height: rect.height / zoom.value,
      });
    }
    paths[branch.id] = routeSkillEdges(branch, bounds);
  }
  edgePaths.value = paths;
}

async function observeLayout() {
  await nextTick();
  observer?.disconnect();
  viewport.value
    ?.querySelectorAll("[data-branch-graph], [data-skill-block]")
    .forEach((element) => observer?.observe(element));
  measureConnections();
}

function resetViewport() {
  endPan();
  focusedSkill.value = "";
  if (viewport.value) {
    viewport.value.scrollLeft = 0;
    viewport.value.scrollTop = 0;
    if (selectedBranch.value !== "all") {
      const root = viewport.value.querySelector<HTMLElement>("[data-skill-id]");
      if (root) {
        const card = root.getBoundingClientRect();
        const view = viewport.value.getBoundingClientRect();
        viewport.value.scrollLeft = Math.max(
          0,
          Math.min(
            viewport.value.scrollWidth - viewport.value.clientWidth,
            card.left - view.left - (viewport.value.clientWidth - card.width) / 2,
          ),
        );
      }
    }
  }
}

function startPan(event: PointerEvent) {
  suppressClick = false;
  const view = viewport.value;
  const target = event.target;
  if (!view || event.pointerType !== "mouse" || event.button !== 0 || !(target instanceof Element)) return;
  if (target.closest("button, a, input, select, textarea, [role='button'], [contenteditable='true']")) return;
  const rect = view.getBoundingClientRect();
  // Leave the native scrollbar gutters to the browser.
  if (event.clientX >= rect.left + view.clientLeft + view.clientWidth
    || event.clientY >= rect.top + view.clientTop + view.clientHeight) return;
  pan = { pointerId: event.pointerId, target, x: event.clientX, y: event.clientY, left: view.scrollLeft, top: view.scrollTop };
  target.setPointerCapture?.(event.pointerId);
}

function movePan(event: PointerEvent) {
  if (!pan || pan.pointerId !== event.pointerId || !viewport.value) return;
  if (!(event.buttons & 1)) {
    endPan();
    return;
  }
  const dx = event.clientX - pan.x;
  const dy = event.clientY - pan.y;
  if (!dragging.value && Math.hypot(dx, dy) < 6) return;
  dragging.value = true;
  suppressClick = true;
  event.preventDefault();
  viewport.value.scrollLeft = pan.left - dx;
  viewport.value.scrollTop = pan.top - dy;
}

function endPan(event?: PointerEvent) {
  if (!pan || (event && event.pointerId !== pan.pointerId)) return;
  if (event?.type !== "pointerup") suppressClick = true;
  const { target, pointerId } = pan;
  pan = undefined;
  dragging.value = false;
  if (target.hasPointerCapture?.(pointerId)) target.releasePointerCapture(pointerId);
}

function onCanvasClick(event: MouseEvent) {
  if (!suppressClick || event.detail === 0) return;
  event.preventDefault();
  event.stopPropagation();
  suppressClick = false;
}

async function setZoom(value: number, clientX?: number, clientY?: number) {
  const view = viewport.value;
  const nextZoom = Math.min(2, Math.max(0.5, value));
  if (!view || nextZoom === zoom.value) return;
  endPan();
  const rect = view.getBoundingClientRect();
  const x = clientX === undefined ? view.clientWidth / 2 : clientX - rect.left - view.clientLeft;
  const y = clientY === undefined ? view.clientHeight / 2 : clientY - rect.top - view.clientTop;
  const anchorX = (view.scrollLeft + x) / zoom.value;
  const anchorY = (view.scrollTop + y) / zoom.value;
  zoom.value = nextZoom;
  await nextTick();
  if (viewport.value !== view || zoom.value !== nextZoom) return;
  view.scrollLeft = anchorX * nextZoom - x;
  view.scrollTop = anchorY * nextZoom - y;
}

function onCanvasWheel(event: WheelEvent) {
  if (!event.ctrlKey) return;
  event.preventDefault();
  const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? viewport.value!.clientHeight : 1;
  void setZoom(zoom.value * Math.exp(-event.deltaY * unit * 0.002), event.clientX, event.clientY);
}

function onViewportKeydown(event: KeyboardEvent) {
  if (event.target !== viewport.value || !viewport.value) return;
  const delta: Record<string, [number, number]> = {
    ArrowLeft: [-160, 0],
    ArrowRight: [160, 0],
    ArrowUp: [0, -160],
    ArrowDown: [0, 160],
  };
  const step = delta[event.key];
  if (!step) return;
  event.preventDefault();
  viewport.value.scrollLeft += step[0];
  viewport.value.scrollTop += step[1];
}

async function jumpToSkill(id: string) {
  if (!hasTreeNode(id)) return;
  activeCategory.value = skills.value.get(id)!.category;
  await nextTick();
  selectedBranch.value =
    branches.value.find((branch) => branch.placements.some(({ node }) => node.skillId === id))?.id ?? "";
  await nextTick();
  const target = Array.from(viewport.value?.querySelectorAll<HTMLElement>("[data-skill-id]") ?? []).find(
    (element) => element.dataset.skillId === id,
  );
  target?.scrollIntoView?.({ block: "nearest", inline: "center" });
  target?.focus({ preventScroll: true });
  focusedSkill.value = id;
}

async function handleLearnSkill(skillId: string) {
  if (learning.value) return;
  learning.value = true;
  clearTimeout(toastTimer);
  try {
    const result = await sessionStore.learnSkill(contentCharacterId.value, skillId);
    const messages: Record<string, string> = {
      ok: "学习了技能！",
      not_in_tree: "技能不在技能树中",
      already_learned: "已学习该技能",
      level_insufficient: "等级不足",
      missing_prerequisites: "缺少前置技能",
      insufficient_money: "金钱不足",
    };
    learnResult.value = messages[result] ?? "学习失败";
    if (result === "ok") {
      await refreshData();
      await nextTick();
      const target = viewport.value?.querySelector<HTMLElement>(`[data-skill-id="${skillId}"]`);
      target?.focus();
    }
  } catch {
    learnResult.value = "学习失败，请稍后重试";
  } finally {
    learning.value = false;
    toastTimer = setTimeout(() => {
      learnResult.value = "";
    }, 3000);
  }
}

watch(
  branches,
  (value) => {
    selectedBranch.value = value[0]?.id ?? "";
  },
  { immediate: true },
);
watch([activeCategory, selectedBranch, loading], resetViewport, { flush: "post" });
watch(zoom, measureConnections, { flush: "post" });
watch([visibleBranches, loading, loadError, learned, currentMoney, currentLevel], observeLayout, {
  flush: "post",
  deep: true,
});
watch(
  () => props.characterId,
  () => {
    zoom.value = 1;
    activeCategory.value = "physical";
    learnResult.value = "";
    void refreshData();
  },
  { immediate: true },
);
onMounted(() => {
  window.addEventListener("blur", cancelPan);
  if (typeof ResizeObserver !== "undefined") observer = new ResizeObserver(measureConnections);
  void observeLayout();
});
onUnmounted(() => {
  endPan();
  window.removeEventListener("blur", cancelPan);
  refreshVersion++;
  observer?.disconnect();
  clearTimeout(toastTimer);
});

function cancelPan() {
  endPan();
}
</script>

<template>
  <div class="skilltree-tab">
    <p v-if="learnResult" class="skilltree-tab__toast" role="status">{{ learnResult }}</p>
    <div v-if="loading" class="skilltree-tab__loading">加载技能树...</div>
    <div v-else-if="loadError" class="skilltree-tab__error" role="alert">
      <p>读取角色进度失败，请重试。</p>
      <button type="button" class="skilltree-tab__learn-btn" @click="refreshData">重试</button>
    </div>
    <div v-else-if="contentResult.error" class="skilltree-tab__error" role="alert">
      技能树配置错误：{{ contentResult.error }}
    </div>
    <div v-else-if="!character" class="skilltree-tab__empty">未找到角色数据</div>
    <template v-else>
      <nav class="skilltree-tab__cats" aria-label="技能分类">
        <button
          v-for="category in SKILL_CATEGORIES"
          :key="category"
          type="button"
          class="skilltree-tab__cat"
          :class="[`skilltree-tab__cat--${category}`, { 'skilltree-tab__cat--active': activeCategory === category }]"
          :aria-label="`${CATEGORY_LABELS[category]}技能`"
          :aria-pressed="activeCategory === category"
          @click="activeCategory = category"
        >
          <i :class="['fas', CATEGORY_ICONS[category]]" aria-hidden="true"></i>
          {{ CATEGORY_LABELS[category] }} <span class="skilltree-tab__cat-count">{{ categoryCounts[category] }}</span>
        </button>
      </nav>
      <div v-if="branchResult.error" class="skilltree-tab__error" role="alert">
        技能树配置错误：{{ branchResult.error }}
      </div>
      <template v-else>
        <div v-if="branches.length" class="skilltree-tab__navigation">
          <label>
            技能分支
            <select v-model="selectedBranch" aria-label="技能分支">
              <option v-for="branch in branches" :key="branch.id" :value="branch.id">
                {{ branchName(branch.id) }}（{{ branch.placements.length }}）
              </option>
              <option value="all">全部分支</option>
            </select>
          </label>
          <button
            type="button"
            class="skilltree-tab__all"
            :aria-pressed="selectedBranch === 'all'"
            @click="selectedBranch = 'all'"
          >
            全部分支
          </button>
          <span>{{ selectedBranch === "all" ? "全部分支" : "单一分支" }} ·
            {{ categoryCounts[activeCategory] }} 个技能</span>
          <button type="button" class="skilltree-tab__zoom" :aria-label="`当前缩放 ${Math.round(zoom * 100)}%，重置为 100%`" @click="setZoom(1)">
            {{ Math.round(zoom * 100) }}% · 重置
          </button>
        </div>
        <p v-if="branches.length" class="skilltree-tab__hint">
          拖动画布或滚动浏览 · Ctrl + 滚轮缩放。也可滑动或聚焦画布后用方向键；前置技能可点击跳转。
        </p>
        <div
          ref="viewport"
          class="skilltree-tab__graph-wrap mg-scroll"
          :class="{ 'skilltree-tab__graph-wrap--dragging': dragging }"
          tabindex="0"
          role="region"
          :aria-label="`${CATEGORY_LABELS[activeCategory]}技能树画布`"
          @keydown="onViewportKeydown"
          @pointerdown="startPan"
          @pointermove="movePan"
          @pointerup="endPan"
          @pointercancel="endPan"
          @lostpointercapture="endPan"
          @click.capture="onCanvasClick"
          @wheel="onCanvasWheel"
        >
          <section
            v-for="branch in visibleBranches"
            :key="branch.id"
            class="skilltree-tab__branch"
            :style="{ zoom }"
            :data-branch-id="branch.id"
            :aria-label="`${branchName(branch.id)}分支`"
          >
            <header class="skilltree-tab__branch-heading">
              <h3>
                {{ branchName(branch.id) }} <span>· {{ branch.placements.length }} 个技能</span>
              </h3>
              <button
                v-if="selectedBranch === 'all'"
                type="button"
                :aria-label="`只看${branchName(branch.id)}分支`"
                @click="selectedBranch = branch.id"
              >
                只看此分支
              </button>
            </header>
            <div
              class="skilltree-tab__graph"
              :class="{ 'skilltree-tab__graph--passive': activeCategory === 'passive' }"
              :data-branch-graph="branch.id"
              :style="{
                gridTemplateColumns: `repeat(${branch.columns}, ${SKILL_CARD_WIDTH}px)`,
                columnGap: `${SKILL_LANE_GAP}px`,
                rowGap: `${SKILL_ROW_GAP}px`,
              }"
            >
              <svg v-if="activeCategory !== 'passive'" class="skilltree-tab__edges" aria-hidden="true">
                <path
                  v-for="edge in edgePaths[branch.id] ?? []"
                  :key="`${edge.fromId}-${edge.toId}`"
                  :d="edge.path"
                  :data-edge-from="edge.fromId"
                  :data-edge-to="edge.toId"
                  class="skilltree-tab__edge"
                  :class="{
                    'skilltree-tab__edge--focused': focusRoute.has(edge.toId),
                    'skilltree-tab__edge--subdued': focusedSkill && !focusRoute.has(edge.toId),
                  }"
                />
              </svg>
              <div
                v-for="{ node, column, span, row } in branch.placements"
                :key="node.skillId"
                class="skilltree-tab__block"
                :data-skill-block="node.skillId"
                :style="blockStyle(node, column, span, row)"
              >
                <div v-if="node.prerequisites.length > 1" class="skilltree-tab__merge" :data-merge-for="node.skillId">
                  <div
                    class="skilltree-tab__merge-parents"
                    :style="{ gridTemplateColumns: `repeat(${node.prerequisites.length}, minmax(0, 1fr))` }"
                  >
                    <div v-for="id in node.prerequisites" :key="id" class="skilltree-tab__merge-parent">
                      <button
                        v-if="hasTreeNode(id)"
                        type="button"
                        class="skilltree-tab__reference"
                        :data-prerequisite-id="id"
                        :data-state="learned.has(id) ? 'learned' : 'missing'"
                        :aria-label="`查看 ${prerequisiteLabel(id)}`"
                        @click="jumpToSkill(id)"
                      >
                        {{ prerequisiteLabel(id) }} <span aria-hidden="true">↗</span>
                      </button>
                      <span
                        v-else
                        class="skilltree-tab__reference"
                        :data-prerequisite-id="id"
                        :data-state="learned.has(id) ? 'learned' : 'missing'"
                      >{{ prerequisiteLabel(id) }} · 天生技能</span>
                    </div>
                  </div>
                  <div class="skilltree-tab__join" :style="{ marginInline: `${SKILL_CARD_WIDTH / 2}px` }"></div>
                  <strong class="skilltree-tab__merge-label">全部前置 · {{ node.prerequisites.filter((id) => learned.has(id)).length }}/{{
                    node.prerequisites.length
                  }}
                    已学习</strong>
                </div>
                <article
                  class="skilltree-tab__node"
                  :class="`skilltree-tab__node--${stateById.get(node.skillId)!.state}`"
                  :data-skill-id="node.skillId"
                  :data-state="stateById.get(node.skillId)!.state"
                  tabindex="0"
                  :aria-label="`${branchName(node.skillId)}，${STATE_LABELS[stateById.get(node.skillId)!.state]}`"
                  @focusin="focusedSkill = node.skillId"
                  @click="focusedSkill = node.skillId"
                >
                  <h4 class="skilltree-tab__node-name">{{ branchName(node.skillId) }}</h4>
                  <p class="skilltree-tab__description">{{ skills.get(node.skillId)?.description }}</p>
                  <p class="skilltree-tab__requirements">Lv.{{ node.requiredLevel }} · {{ node.cost }} G</p>
                  <div v-if="node.prerequisites.length === 1" class="skilltree-tab__prerequisites">
                    <span>前置技能</span>
                    <button
                      v-if="hasTreeNode(node.prerequisites[0])"
                      type="button"
                      class="skilltree-tab__reference"
                      :data-prerequisite-id="node.prerequisites[0]"
                      :data-state="learned.has(node.prerequisites[0]) ? 'learned' : 'missing'"
                      :aria-label="`查看 ${prerequisiteLabel(node.prerequisites[0])}`"
                      @click="jumpToSkill(node.prerequisites[0])"
                    >
                      {{ prerequisiteLabel(node.prerequisites[0]) }} <span aria-hidden="true">↗</span>
                    </button>
                    <span
                      v-else
                      class="skilltree-tab__reference"
                      :data-prerequisite-id="node.prerequisites[0]"
                      :data-state="learned.has(node.prerequisites[0]) ? 'learned' : 'missing'"
                    >{{ prerequisiteLabel(node.prerequisites[0]) }} · 天生技能</span>
                  </div>
                  <span v-if="stateById.get(node.skillId)!.state === 'learned'" class="skilltree-tab__learned-badge"><i class="fas fa-check-circle" aria-hidden="true"></i> 已学习</span>
                  <button
                    v-else-if="stateById.get(node.skillId)!.state === 'learnable'"
                    type="button"
                    class="skilltree-tab__learn-btn"
                    :aria-label="`学习 ${branchName(node.skillId)}`"
                    :disabled="learning"
                    @click="handleLearnSkill(node.skillId)"
                  >
                    <i class="fas fa-graduation-cap" aria-hidden="true"></i> 学习
                  </button>
                  <p v-else class="skilltree-tab__node-missing">
                    {{ stateById.get(node.skillId)!.missing.join(" · ") }}
                  </p>
                </article>
              </div>
            </div>
          </section>
          <p v-if="!branches.length" class="skilltree-tab__empty">
            该角色没有{{ CATEGORY_LABELS[activeCategory] }}技能
          </p>
        </div>
      </template>
    </template>
  </div>
</template>

<style lang="scss" scoped>
.skilltree-tab {
  position: relative;
  min-height: 300px;
  min-width: 0;
}
.skilltree-tab__toast {
  position: static;
  transform: none;
  animation: none;
  white-space: normal;
  margin: 0 0 var(--mg-space-md);
  padding: 8px 16px;
  border: var(--mg-border-width) solid var(--mg-border);
  border-radius: var(--mg-radius-pill);
  background: var(--mg-surface-pink);
  color: var(--mg-text);
  font-weight: 700;
}
.skilltree-tab :is(button, select, article, [role="region"]):focus-visible {
  outline: 3px solid var(--mg-accent);
  outline-offset: 4px;
}
.skilltree-tab__cats {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: var(--mg-space-md);
}
.skilltree-tab__cat,
.skilltree-tab__all,
.skilltree-tab__zoom,
.skilltree-tab__branch-heading button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 44px;
  padding: 8px 12px;
  border: var(--mg-border-width) solid var(--mg-border);
  border-radius: var(--mg-radius-pill);
  background: var(--mg-bg-card);
  color: var(--mg-text);
  cursor: pointer;
  font: inherit;
}
.skilltree-tab__cat {
  font-family: var(--mg-font-heading);
  font-size: 0.85rem;
  font-weight: 600;
  &--active {
    color: var(--mg-ink-outline);
    &.skilltree-tab__cat--physical {
      background: #e74c3c;
      border-color: #c0392b;
    }
    &.skilltree-tab__cat--magic {
      background: #8e44ad;
      border-color: #6c3483;
    }
    &.skilltree-tab__cat--heal {
      background: #27ae60;
      border-color: #1e8449;
    }
    &.skilltree-tab__cat--support {
      background: #2980b9;
      border-color: #1f6dad;
    }
    &.skilltree-tab__cat--passive {
      background: #7f8c8d;
      border-color: #667273;
    }
  }
}
.skilltree-tab__cat-count {
  border-radius: 12px;
  padding: 0 6px;
  background: rgba(255, 255, 255, 0.25);
}
.skilltree-tab__navigation {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
  font-size: 0.85rem;
  label {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }
  select {
    min-height: 44px;
    max-width: 100%;
    padding: 8px;
    background: var(--mg-bg-card);
    color: var(--mg-text);
    border: 1px solid var(--mg-border);
    border-radius: var(--mg-radius);
    font: inherit;
  }
}
.skilltree-tab__all[aria-pressed="true"] {
  border-color: var(--mg-accent);
  background: var(--mg-surface-pink);
}
.skilltree-tab__hint {
  color: var(--mg-text-secondary);
  font-size: 0.8rem;
  margin: 12px 0;
}
.skilltree-tab__graph-wrap {
  overflow: auto;
  position: relative;
  min-height: 250px;
  max-height: 65vh;
  touch-action: pan-x pan-y;
  overscroll-behavior: contain;
  scrollbar-gutter: stable;
  overflow-anchor: none;
  cursor: grab;
  border: 1px solid var(--mg-border);
  border-radius: var(--mg-radius);
}
.skilltree-tab__graph-wrap--dragging,
.skilltree-tab__graph-wrap--dragging * {
  cursor: grabbing;
  user-select: none;
}
.skilltree-tab__branch {
  padding: 20px 0;
  min-width: 100%;
  width: max-content;
  border-bottom: 1px solid var(--mg-border);
}
.skilltree-tab__branch-heading {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 16px;
  padding: 0 24px 16px;
  h3 {
    margin: 0;
    font: 700 1rem var(--mg-font-heading);
  }
  h3 span {
    color: var(--mg-text-secondary);
    font-size: 0.8rem;
    font-weight: 400;
  }
}
.skilltree-tab__graph {
  display: grid;
  position: relative;
  padding: 24px;
  width: max-content;
  align-items: start;
}
.skilltree-tab__edges {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}
.skilltree-tab__edge {
  fill: none;
  stroke: var(--mg-border-strong);
  stroke-width: 2px;
  opacity: 0.65;
  &--focused {
    stroke: var(--mg-accent);
    opacity: 1;
    stroke-width: 3px;
  }
  &--subdued {
    opacity: 0.2;
  }
}
.skilltree-tab__block {
  justify-self: center;
  position: relative;
  z-index: 1;
}
.skilltree-tab__node {
  position: relative;
  width: 280px;
  margin-inline: auto;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  justify-content: flex-start;
  gap: 12px;
  box-sizing: border-box;
  padding: 18px;
  border: var(--mg-border-width) solid var(--mg-border);
  border-radius: var(--mg-radius);
  background: var(--mg-bg-card);
  color: var(--mg-text);
  text-align: left;
  font-size: 0.9rem;
  overflow-wrap: anywhere;
  transition: box-shadow var(--mg-transition-fast);
  p,
  h4 {
    margin: 0;
  }
  &--learned {
    border-color: var(--mg-success);
    background: linear-gradient(135deg, var(--mg-bg-card), rgba(100, 220, 100, 0.12));
  }
  &--learnable {
    border-color: var(--mg-accent);
    background: linear-gradient(135deg, var(--mg-bg-card), var(--mg-surface-pink));
    box-shadow: var(--mg-glow-pink);
    cursor: default;
  }
  &--learnable:hover {
    transform: none;
  }
  &--locked {
    opacity: 1;
    filter: none;
  }
}
.skilltree-tab__node-name {
  font-size: 1rem;
  font-weight: 700;
  line-height: 0.5;
}
.skilltree-tab__description {
  font-size: 0.85rem;
  line-height: 1.2;
  color: var(--mg-text-secondary);
}
.skilltree-tab__requirements,
.skilltree-tab__node-missing {
  font-size: 0.82rem;
  line-height: 0.6;
  color: var(--mg-text-secondary);
}
.skilltree-tab__prerequisites {
  display: flex;
  flex-direction: column;
  gap: 8px;
  font-size: 0.8rem;
}
.skilltree-tab__reference {
  display: block;
  width: 100%;
  box-sizing: border-box;
  min-height: 44px;
  padding: 10px;
  border: 1px dashed var(--mg-border-strong);
  border-radius: var(--mg-radius);
  background: var(--mg-bg-card);
  color: var(--mg-text);
  font: inherit;
  font-size: 0.85rem;
  line-height: 1.6;
  text-align: left;
  overflow-wrap: anywhere;
  &[data-state="learned"] {
    border-color: var(--mg-success);
    color: var(--mg-success);
  }
}
button.skilltree-tab__reference {
  cursor: pointer;
}
.skilltree-tab__merge-parents {
  display: grid;
  column-gap: 64px;
}
.skilltree-tab__merge-parent {
  display: flex;
  position: relative;
  &::after {
    content: "";
    position: absolute;
    top: 100%;
    left: 50%;
    height: 24px;
    border-left: 2px solid var(--mg-border-strong);
  }
}
.skilltree-tab__join {
  height: 24px;
  border-bottom: 2px solid var(--mg-border-strong);
}
.skilltree-tab__merge-label {
  display: block;
  position: relative;
  text-align: center;
  padding: 18px 0;
  font-size: 0.9rem;
  &::before,
  &::after {
    content: "";
    position: absolute;
    left: 50%;
    height: 12px;
    border-left: 2px solid var(--mg-border-strong);
  }
  &::before {
    top: 0;
  }
  &::after {
    bottom: 0;
  }
}
.skilltree-tab__learn-btn {
  min-height: 44px;
  padding: 8px 16px;
  border: 1px solid var(--mg-accent);
  border-radius: var(--mg-radius-pill);
  background: var(--mg-accent);
  color: var(--mg-text-on-accent);
  cursor: pointer;
  font: inherit;
  font-weight: 700;
  &:disabled {
    opacity: 0.6;
    cursor: wait;
  }
}
.skilltree-tab__learned-badge {
  color: var(--mg-success);
  font-weight: 700;
  font-size: 0.85rem;
}
.skilltree-tab__graph--passive {
  display: flex;
  flex-direction: column;
  gap: 24px !important;
  width: min(640px, calc(100vw - 96px));
  min-width: 280px;
  .skilltree-tab__block {
    width: 100%;
  }
  .skilltree-tab__node {
    width: 100%;
  }
  .skilltree-tab__merge-parents {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .skilltree-tab__merge-parent::after,
  .skilltree-tab__join {
    display: none;
  }
}
.skilltree-tab__loading,
.skilltree-tab__empty,
.skilltree-tab__error {
  padding: 24px;
  text-align: center;
  color: var(--mg-text-secondary);
}
</style>
