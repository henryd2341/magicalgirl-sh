<script setup lang="ts">
import { findBattleActionMenuNodeById } from "@/engine/battle/battleActionCatalog";
import type {
  BattleActionId,
  BattleActionMenuNode,
} from "@/types/battle";
import { computed, ref } from "vue";

const props = withDefaults(defineProps<{
  actionMenu: BattleActionMenuNode[];
  currentMenuNodeId: string | null;
  selectedActionId: BattleActionId | null;
  isResultPhase: boolean;
  isLocked?: boolean;
  description: string;
}>(), {
  isLocked: false,
});

const emit = defineEmits<{
  selectMenuNode: [nodeId: string];
  returnRoot: [];
  completeBattle: [];
  hoverDescription: [desc: string | null];
}>();

const hoveredDescription = ref<string | null>(null);

const currentMenuNode = computed(() => {
  if (props.currentMenuNodeId == null) {
    return null;
  }

  return findBattleActionMenuNodeById(props.actionMenu, props.currentMenuNodeId);
});

const visibleMenu = computed(() => {
  return currentMenuNode.value?.children ?? props.actionMenu;
});

function selectMenuNode(nodeId: string) {
  if (props.isLocked) {
    return;
  }

  emit("selectMenuNode", nodeId);
}

function returnRoot() {
  if (props.isLocked) {
    return;
  }

  emit("returnRoot");
}

function onHoverAction(node: BattleActionMenuNode) {
  hoveredDescription.value = node.description ?? null;
  emit("hoverDescription", hoveredDescription.value);
}

function onLeaveAction() {
  hoveredDescription.value = null;
  emit("hoverDescription", null);
}
</script>

<template>
  <section class="battle-hud__command-column" aria-label="行动指令区域">
    <div class="battle-command-menu">
      <header class="battle-command-menu__header">
        <p class="battle-command-menu__label">Command</p>
        <button
          v-if="currentMenuNode !== null && !isResultPhase"
          type="button"
          class="battle-command-menu__back"
          :disabled="isLocked"
          @click="returnRoot"
        >
          返回根菜单
        </button>
      </header>

      <button
        v-if="isResultPhase"
        type="button"
        class="battle-command-menu__button battle-command-menu__button--primary"
        @click="emit('completeBattle')"
      >
        完成战斗
      </button>

      <ol v-else class="battle-command-menu__items mg-scroll">
        <li v-for="action in visibleMenu" :key="action.id">
          <button
            type="button"
            class="battle-command-menu__button"
            :aria-pressed="
              action.kind === 'action' && selectedActionId === action.actionId
            "
            :disabled="isLocked"
            @click="selectMenuNode(action.id)"
            @mouseenter="onHoverAction(action)"
            @mouseleave="onLeaveAction"
          >
            {{ action.label }}
          </button>
        </li>
      </ol>
    </div>
  </section>
</template>
