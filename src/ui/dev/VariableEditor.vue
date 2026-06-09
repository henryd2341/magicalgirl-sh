<script setup lang="ts">
import { useSessionStore } from "@/stores/sessionStore";
import type { GameVariablesRoot } from "@/types/variables";
import { computed, nextTick, onMounted, onUnmounted, ref } from "vue";

const emit = defineEmits<{ close: [] }>();

const sessionStore = useSessionStore();

interface TreeNode {
  key: string;
  path: string;
  value: unknown;
  type: "object" | "array" | "string" | "number" | "boolean" | "null";
  depth: number;
  expanded: boolean;
  visible: boolean;
  editing: boolean;
  editValue: string;
}

const nodes = ref<TreeNode[]>([]);
const searchQuery = ref("");
const varRoot = ref<GameVariablesRoot | null>(null);
const currentRecord = ref<{ stateHash: string; version: number } | null>(null);
const loading = ref(true);
const errorMsg = ref<string | null>(null);
const savingPath = ref<string | null>(null);

function getType(val: unknown): TreeNode["type"] {
  if (val === null || val === undefined) return "null";
  if (Array.isArray(val)) return "array";
  if (typeof val === "object") return "object";
  if (typeof val === "boolean") return "boolean";
  if (typeof val === "number") return "number";
  return "string";
}

function valueDisplay(val: unknown, type: TreeNode["type"]): string {
  if (type === "null") return "null";
  if (type === "object") return "{}";
  if (type === "array") return `Array(${(val as unknown[]).length})`;
  if (type === "string") return `"${val}"`;
  return String(val);
}

function buildTree(
  obj: Record<string, unknown>,
  parentPath: string,
  depth: number,
): TreeNode[] {
  const result: TreeNode[] = [];
  for (const key of Object.keys(obj).sort()) {
    const path = parentPath ? `${parentPath}.${key}` : key;
    const value = obj[key];
    const type = getType(value);
    result.push({
      key,
      path,
      value,
      type,
      depth,
      expanded: depth < 2,
      visible: true,
      editing: false,
      editValue: "",
    });
    if (type === "object" && value !== null) {
      result.push(
        ...buildTree(
          value as Record<string, unknown>,
          path,
          depth + 1,
        ),
      );
    }
  }
  return result;
}

function rebuildTree() {
  if (!varRoot.value) {
    nodes.value = [];
    return;
  }
  nodes.value = buildTree(varRoot.value as unknown as Record<string, unknown>, "", 0);
  applySearch();
}

function applySearch() {
  const q = searchQuery.value.toLowerCase().trim();
  if (!q) {
    for (const n of nodes.value) n.visible = true;
    return;
  }
  // Find matching leaf paths, then make their ancestors visible
  const matchingPaths = new Set<string>();
  for (const n of nodes.value) {
    if (n.path.toLowerCase().includes(q)) {
      matchingPaths.add(n.path);
      // Add all ancestor paths
      const parts = n.path.split(".");
      for (let i = 1; i < parts.length; i++) {
        matchingPaths.add(parts.slice(0, i).join("."));
      }
    }
  }
  for (const n of nodes.value) {
    n.visible = matchingPaths.has(n.path);
  }
}

function toggleExpand(node: TreeNode) {
  if (node.type !== "object" && node.type !== "array") return;
  node.expanded = !node.expanded;
}

function isChildOf(node: TreeNode, parent: TreeNode): boolean {
  return node.path.startsWith(parent.path + ".") && node.depth > parent.depth;
}

function visibleChildren(parent: TreeNode): TreeNode[] {
  const idx = nodes.value.indexOf(parent);
  const result: TreeNode[] = [];
  for (let i = idx + 1; i < nodes.value.length; i++) {
    const child = nodes.value[i];
    if (child.depth <= parent.depth) break;
    if (child.depth === parent.depth + 1) result.push(child);
  }
  return result;
}

function startEdit(node: TreeNode) {
  node.editing = true;
  if (node.type === "boolean") {
    node.editValue = String(!node.value);
  } else if (node.type === "null") {
    node.editValue = "";
  } else if (node.type === "array") {
    node.editValue = JSON.stringify(node.value);
  } else {
    node.editValue = node.value === null ? "" : String(node.value);
  }
}

async function confirmEdit(node: TreeNode) {
  node.editing = false;
  let newValue: unknown;
  try {
    switch (node.type) {
      case "number":
        newValue = Number(node.editValue);
        if (isNaN(newValue as number)) return;
        break;
      case "boolean":
        newValue = node.editValue === "true";
        break;
      case "array":
        newValue = JSON.parse(node.editValue);
        if (!Array.isArray(newValue)) return;
        break;
      case "null":
        newValue = node.editValue === "null" ? null : node.editValue;
        break;
      default:
        newValue = node.editValue;
    }
  } catch {
    return;
  }

  savingPath.value = node.path;
  errorMsg.value = null;
  try {
    await sessionStore.patchVariables(
      [{ path: node.path, value: newValue }],
      "variable-editor",
    );
    // Refresh tree
    const snapshot = await sessionStore.getVariableSnapshot();
    if (snapshot) {
      varRoot.value = snapshot.root;
      currentRecord.value = {
        stateHash: snapshot.stateHash,
        version: snapshot.version,
      };
      rebuildTree();
    }
  } catch (err) {
    errorMsg.value = err instanceof Error ? err.message : "写入失败";
    // Reload to ensure UI is consistent
    const snapshot = await sessionStore.getVariableSnapshot();
    if (snapshot) {
      varRoot.value = snapshot.root;
      rebuildTree();
    }
  } finally {
    savingPath.value = null;
  }
}

function cancelEdit(node: TreeNode) {
  node.editing = false;
}

function onEditKeydown(e: KeyboardEvent, node: TreeNode) {
  if (e.key === "Enter") {
    e.preventDefault();
    confirmEdit(node);
  } else if (e.key === "Escape") {
    e.preventDefault();
    cancelEdit(node);
  }
}

// Refresh data from store
async function refreshData() {
  loading.value = true;
  errorMsg.value = null;
  try {
    const snapshot = await sessionStore.getVariableSnapshot();
    if (snapshot) {
      varRoot.value = snapshot.root;
      currentRecord.value = {
        stateHash: snapshot.stateHash,
        version: snapshot.version,
      };
      rebuildTree();
    }
  } catch (err) {
    errorMsg.value = err instanceof Error ? err.message : "读取变量失败";
  } finally {
    loading.value = false;
  }
}

function onOverlayKeydown(e: KeyboardEvent) {
  if (e.key === "Escape") {
    emit("close");
  }
}

onMounted(async () => {
  await refreshData();
  document.addEventListener("keydown", onOverlayKeydown);
  // Focus trap
  await nextTick();
  const input = document.querySelector(".mg-ve__search-input") as HTMLInputElement;
  input?.focus();
});

onUnmounted(() => {
  document.removeEventListener("keydown", onOverlayKeydown);
});

const versionInfo = computed(() => {
  if (!currentRecord.value) return "";
  return `v${currentRecord.value.version} / ${currentRecord.value.stateHash.slice(0, 8)}`;
});
</script>

<template>
  <div class="mg-modal-overlay" @click.self="emit('close')">
    <div class="mg-modal-card mg-modal-card--lg mg-ve">
      <button class="mg-modal__close" @click="emit('close')">
        <i class="fas fa-times"></i>
      </button>
      <h2 class="mg-modal__title">
        <i class="fas fa-code"></i> 变量修改器
        <span class="mg-ve__version">{{ versionInfo }}</span>
      </h2>

      <!-- Search -->
      <div class="mg-ve__search">
        <i class="fas fa-search mg-ve__search-icon"></i>
        <input
          v-model="searchQuery"
          class="mg-ve__search-input"
          type="text"
          placeholder="搜索变量路径..."
          @input="applySearch"
        />
        <button
          v-if="searchQuery"
          class="mg-ve__search-clear"
          @click="searchQuery = ''; applySearch()"
        >
          <i class="fas fa-times"></i>
        </button>
      </div>

      <!-- Error -->
      <div v-if="errorMsg" class="mg-ve__error">
        <i class="fas fa-exclamation-triangle"></i> {{ errorMsg }}
        <button class="mg-ve__error-dismiss" @click="errorMsg = null">
          <i class="fas fa-times"></i>
        </button>
      </div>

      <!-- Tree -->
      <div class="mg-modal__body mg-scroll mg-ve__tree">
        <div v-if="loading" class="mg-ve__loading">
          <i class="fas fa-spinner fa-spin"></i> 加载中...
        </div>
        <div v-else-if="nodes.length === 0" class="mg-ve__empty">
          无变量数据
        </div>
        <div
          v-for="node in nodes"
          v-show="node.visible"
          :key="node.path"
          class="mg-ve__node"
          :class="{
            'mg-ve__node--hidden': false,
          }"
          :style="{ paddingLeft: node.depth * 20 + 8 + 'px' }"
        >
          <!-- Expand toggle + key -->
          <span
            class="mg-ve__toggle"
            :class="{ 'mg-ve__toggle--invisible': node.type !== 'object' && node.type !== 'array' }"
            @click="toggleExpand(node)"
          >
            <i
              v-if="node.type === 'object' || node.type === 'array'"
              :class="node.expanded ? 'fas fa-caret-down' : 'fas fa-caret-right'"
            ></i>
          </span>

          <span class="mg-ve__key">{{ node.key }}</span>

          <!-- Value display (non-editing) -->
          <template v-if="!node.editing">
            <span
              class="mg-ve__value"
              :class="`mg-ve__value--${node.type}`"
              @click="node.type !== 'object' ? startEdit(node) : undefined"
              :title="node.type !== 'object' ? '点击编辑' : undefined"
            >
              {{ valueDisplay(node.value, node.type) }}
            </span>
            <span v-if="savingPath === node.path" class="mg-ve__saving">
              <i class="fas fa-spinner fa-spin"></i>
            </span>
          </template>

          <!-- Editing -->
          <template v-else>
            <!-- Boolean toggle -->
            <label v-if="node.type === 'boolean'" class="mg-ve__bool-label">
              <input
                type="checkbox"
                v-model="node.editValue"
                true-value="true"
                false-value="false"
                @change="confirmEdit(node)"
              />
              <span>{{ node.editValue === "true" ? "true" : "false" }}</span>
            </label>

            <!-- Number input -->
            <input
              v-else-if="node.type === 'number'"
              v-model="node.editValue"
              type="number"
              class="mg-ve__input mg-ve__input--number"
              @keydown="onEditKeydown($event, node)"
              @blur="confirmEdit(node)"
              ref="editInput"
            />

            <!-- Array textarea -->
            <textarea
              v-else-if="node.type === 'array'"
              v-model="node.editValue"
              class="mg-ve__input mg-ve__input--textarea"
              rows="3"
              @keydown.escape="cancelEdit(node)"
              @blur="confirmEdit(node)"
            ></textarea>

            <!-- String / null input -->
            <input
              v-else
              v-model="node.editValue"
              type="text"
              class="mg-ve__input"
              @keydown="onEditKeydown($event, node)"
              @blur="confirmEdit(node)"
            />

            <span class="mg-ve__edit-hint">Enter 确认 · Esc 取消</span>
          </template>
        </div>
      </div>

      <!-- Footer -->
      <div class="mg-ve__footer">
        <button class="mg-btn mg-btn--sm mg-btn--ghost" @click="refreshData">
          <i class="fas fa-sync-alt"></i> 刷新
        </button>
        <span class="mg-ve__hint">直接修改任意变量值，绕过 isAllowedPath 限制</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.mg-ve {
  max-width: 680px;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
}
.mg-ve__version {
  font-size: 12px;
  opacity: 0.5;
  font-weight: normal;
  margin-left: 8px;
}
.mg-ve__search {
  position: relative;
  margin: 0 20px 8px;
}
.mg-ve__search-icon {
  position: absolute;
  left: 10px;
  top: 50%;
  transform: translateY(-50%);
  opacity: 0.4;
  font-size: 13px;
}
.mg-ve__search-input {
  width: 100%;
  padding: 6px 32px 6px 30px;
  font-size: 13px;
  border: 1px solid var(--mg-border);
  border-radius: 6px;
  background: var(--mg-surface);
  color: var(--mg-text);
  outline: none;
}
.mg-ve__search-input:focus {
  border-color: var(--mg-accent, #3498db);
}
.mg-ve__search-clear {
  position: absolute;
  right: 6px;
  top: 50%;
  transform: translateY(-50%);
  background: none;
  border: none;
  cursor: pointer;
  opacity: 0.4;
  color: var(--mg-text);
  font-size: 12px;
}
.mg-ve__error {
  margin: 0 20px 8px;
  padding: 6px 10px;
  background: rgba(231, 76, 60, 0.12);
  color: #e74c3c;
  border-radius: 6px;
  font-size: 13px;
  display: flex;
  align-items: center;
  gap: 6px;
}
.mg-ve__error-dismiss {
  margin-left: auto;
  background: none;
  border: none;
  cursor: pointer;
  color: inherit;
  opacity: 0.6;
}
.mg-ve__tree {
  flex: 1;
  overflow-y: auto;
  padding: 4px 20px;
}
.mg-ve__loading,
.mg-ve__empty {
  text-align: center;
  padding: 40px;
  opacity: 0.5;
  font-size: 14px;
}
.mg-ve__node {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 13px;
  line-height: 24px;
  min-height: 28px;
  border-radius: 4px;
  padding-right: 8px;
  white-space: nowrap;
}
.mg-ve__node:hover {
  background: rgba(128, 128, 128, 0.06);
}
.mg-ve__toggle {
  width: 16px;
  flex-shrink: 0;
  cursor: pointer;
  text-align: center;
  opacity: 0.5;
  font-size: 12px;
  user-select: none;
}
.mg-ve__toggle--invisible {
  visibility: hidden;
}
.mg-ve__key {
  color: var(--mg-accent, #9b59b6);
  font-weight: 500;
  flex-shrink: 0;
}
.mg-ve__key::after {
  content: ":";
  color: var(--mg-text);
  opacity: 0.4;
}
.mg-ve__value {
  margin-left: 6px;
  cursor: default;
  max-width: 360px;
  overflow: hidden;
  text-overflow: ellipsis;
}
.mg-ve__value--string {
  color: #27ae60;
}
.mg-ve__value--number {
  color: #2980b9;
}
.mg-ve__value--boolean {
  color: #e67e22;
}
.mg-ve__value--null {
  color: #95a5a6;
  font-style: italic;
}
.mg-ve__value--object,
.mg-ve__value--array {
  color: #7f8c8d;
  cursor: default;
}
.mg-ve__value:not(.mg-ve__value--object):not(.mg-ve__value--array) {
  cursor: pointer;
  padding: 1px 4px;
  border-radius: 3px;
}
.mg-ve__value:not(.mg-ve__value--object):not(.mg-ve__value--array):hover {
  background: rgba(52, 152, 219, 0.12);
}
.mg-ve__saving {
  margin-left: 4px;
  font-size: 11px;
  opacity: 0.5;
}
.mg-ve__input {
  margin-left: 6px;
  padding: 2px 6px;
  font-size: 13px;
  border: 1px solid var(--mg-accent, #3498db);
  border-radius: 4px;
  background: var(--mg-surface);
  color: var(--mg-text);
  outline: none;
  min-width: 120px;
  font-family: inherit;
}
.mg-ve__input--number {
  width: 100px;
}
.mg-ve__input--textarea {
  min-width: 200px;
  resize: horizontal;
}
.mg-ve__edit-hint {
  font-size: 10px;
  opacity: 0.4;
  margin-left: 4px;
  flex-shrink: 0;
}
.mg-ve__bool-label {
  margin-left: 6px;
  display: flex;
  align-items: center;
  gap: 4px;
  cursor: pointer;
  font-size: 13px;
}
.mg-ve__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 20px;
  border-top: 1px solid var(--mg-border, rgba(128, 128, 128, 0.15));
  margin-top: 4px;
}
.mg-ve__hint {
  font-size: 11px;
  opacity: 0.4;
}
</style>
