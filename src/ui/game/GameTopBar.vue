<script setup lang="ts">
import { useRouter } from "vue-router";

defineEmits<{
  openSettings: [];
  openApiSettings: [];
  openSaveManage: [];
}>();

const router = useRouter();

function returnToTitle() {
  router.push({ name: "title" });
}
</script>

<template>
  <header
    id="game-top-bar"
    class="mg-topbar"
    aria-label="主游戏顶部栏"
  >
    <span class="mg-topbar__title">MagicalGirl Shell</span>
    <nav class="mg-topbar__actions" aria-label="主游戏快捷操作">
      <button class="mg-topbar__btn" title="背包" type="button">
        <i class="fas fa-backpack"></i>
        <span>背包</span>
      </button>
      <button class="mg-topbar__btn" title="商店" type="button">
        <i class="fas fa-store"></i>
        <span>商店</span>
      </button>
      <button class="mg-topbar__btn" title="训练场" type="button">
        <i class="fas fa-dumbbell"></i>
        <span>训练场</span>
      </button>
      <button class="mg-topbar__btn" title="存档/读档" type="button" @click="$emit('openSaveManage')">
        <i class="fas fa-save"></i>
        <span>存档</span>
      </button>
      <button class="mg-topbar__btn" title="系统设置" type="button" @click="$emit('openSettings')">
        <i class="fas fa-sliders-h"></i>
        <span>设置</span>
      </button>
      <button class="mg-topbar__btn" title="返回标题" type="button" @click="returnToTitle">
        <i class="fas fa-home"></i>
        <span>标题</span>
      </button>
    </nav>
  </header>
</template>

<style lang="scss" scoped>
.mg-topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 16px;
  background: var(--mg-bg-card, #2d2d2d);
  border-bottom: var(--mg-border-width, 2px) solid var(--mg-border, #c0c0c0);
  z-index: var(--mg-z-content, 10);
  flex-shrink: 0;
}

.mg-topbar__title {
  font-family: var(--mg-font-heading, "Fredoka", sans-serif);
  font-size: 1rem;
  font-weight: 700;
  color: var(--mg-accent, #ff6b9d);
}

.mg-topbar__actions {
  display: flex;
  gap: 4px;
}

.mg-topbar__btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 6px 10px;
  border: var(--mg-border-width, 2px) solid transparent;
  border-radius: var(--mg-radius-sm, 8px);
  background: transparent;
  color: var(--mg-text-secondary, #c9a0dc);
  font-size: 0.8rem;
  cursor: pointer;
  transition: all var(--mg-transition-fast, 150ms ease);
  white-space: nowrap;

  &:hover {
    border-color: var(--mg-accent, #ff6b9d);
    color: var(--mg-accent, #ff6b9d);
    box-shadow: var(--mg-glow-pink);
  }

  i { font-size: 0.85rem; }
}
</style>
