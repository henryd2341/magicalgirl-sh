<script setup lang="ts">
import { getChatPersistenceClient } from "@/persistence/chatRuntime";
import { useBattleStore } from "@/stores/battleStore";
import { useChatStore } from "@/stores/chatStore";
import { useSessionStore } from "@/stores/sessionStore";
import BattleOverlay from "@/ui/battle/BattleOverlay.vue";
import GameConversationPanel from "@/ui/game/GameConversationPanel.vue";
import GameInputDock from "@/ui/game/GameInputDock.vue";
import GameStatusBanner from "@/ui/game/GameStatusBanner.vue";
import GameTopBar from "@/ui/game/GameTopBar.vue";
import PromptViewerDrawer from "@/ui/dev/PromptViewerDrawer.vue";
import PostCombatPanel from "@/ui/session/PostCombatPanel.vue";
import SettingsView from "./SettingsView.vue";
import ApiSettingsView from "./ApiSettingsView.vue";
import SaveExportView from "./SaveExportView.vue";
import { storeToRefs } from "pinia";
import { computed, onMounted, ref } from "vue";

const chatStore = useChatStore();
const sessionStore = useSessionStore();
const battleStore = useBattleStore();
const { snapshot } = storeToRefs(sessionStore);
const { pendingBattle, activeBattle } = storeToRefs(battleStore);

// ── Initialization guard ──
const hasInitialized = ref(false);

// ── Panel collapse state ──
const leftPanelOpen = ref(true);
const rightPanelOpen = ref(true);
const bottomBarOpen = ref(false);

// ── Modal state ──
const showSettings = ref(false);
const showApiSettings = ref(false);
const showSaveManage = ref(false);

// ── Save reminder banner ──
const showSaveReminder = ref(false);

// ── Battle / post-combat visibility ──
const shouldShowBattleOverlay = computed(() => {
  const isPending = snapshot.value.sessionState === "COMBAT_PENDING" && pendingBattle.value !== null;
  const isActive = snapshot.value.sessionState === "IN_COMBAT" && activeBattle.value !== null;
  return isPending || isActive;
});

const shouldShowPostCombatPanel = computed(() => {
  return snapshot.value.sessionState === "POST_COMBAT_READY";
});

// ── Debug battle (kept for testing) ──
function launchDebugBattleForTestingOnly() {
  battleStore.stagePendingEncounter({
    encounterId: "enc-main-game-debug-battle",
    narrativeReason: "测试用预置战斗入口，后续应删除。",
    enemies: [{ enemy_id: "debug-shadow", count: 1 }],
  });
  sessionStore.enterCombatPending();
  sessionStore.startBattle([
    {
      id: "player-heroine-1",
      side: "player",
      displayName: "鹿目真昼",
      hp: { current: 120, max: 120 },
      mp: { current: 48, max: 48 },
      isDown: false,
      isActive: true,
    },
  ]);
}

onMounted(async () => {
  if (hasInitialized.value) return;
  hasInitialized.value = true;

  const persistenceClient = getChatPersistenceClient();
  if (persistenceClient) {
    await chatStore.configurePersistence({ client: persistenceClient });
    await sessionStore.configurePersistence({ client: persistenceClient });
    await sessionStore.recoverFromInterruptedCombat();
  }
  await chatStore.refreshMessages();
});
</script>

<template>
  <main id="main-game-view" class="mg-game" role="main">
    <!-- ═══ Top Bar ═══ -->
    <GameTopBar
      @open-settings="showSettings = true"
      @open-api-settings="showApiSettings = true"
      @open-save-manage="showSaveManage = true"
    />

    <!-- ═══ Center Row (3 columns) ═══ -->
    <div class="mg-game__center">
      <!-- Left Panel -->
      <aside class="mg-game__left mg-scroll" :class="{ 'mg-game__left--closed': !leftPanelOpen }">
        <button class="mg-panel-toggle" @click="leftPanelOpen = !leftPanelOpen" :title="leftPanelOpen ? '收起面板' : '展开面板'">
          <i :class="leftPanelOpen ? 'fas fa-chevron-left' : 'fas fa-chevron-right'"></i>
        </button>
        <div v-if="leftPanelOpen" class="mg-game__left-content">
          <!-- TODO: 等待实现的功能 — 场景缩略图（提取自世界变量） -->
          <div class="mg-card mg-card--sm">
            <p class="mg-card__placeholder"><i class="fas fa-image"></i> 场景缩略图</p>
          </div>
          <!-- TODO: 等待实现的功能 — 世界信息展示 -->
          <div class="mg-card mg-card--sm">
            <p class="mg-card__placeholder"><i class="fas fa-globe"></i> 世界信息</p>
          </div>
          <!-- TODO: 等待实现的功能 — BGM播放器 -->
          <div class="mg-card mg-card--sm">
            <p class="mg-card__placeholder"><i class="fas fa-music"></i> // TODO: 等待实现的功能 — BGM播放器</p>
          </div>
          <nav class="mg-game__left-actions">
            <button class="mg-btn mg-btn--sm mg-btn--ghost">
              <i class="fas fa-users"></i> 队伍编组
            </button>
            <button class="mg-btn mg-btn--sm mg-btn--ghost">
              <i class="fas fa-book"></i> 技能学习
            </button>
            <button class="mg-btn mg-btn--sm mg-btn--ghost">
              <i class="fas fa-scroll"></i> Credits
            </button>
          </nav>
        </div>
      </aside>

      <!-- Center Chat Area -->
      <section class="mg-game__chat">
        <!-- Save reminder banner -->
        <div v-if="showSaveReminder" class="mg-game__reminder">
          <span><i class="fas fa-exclamation-triangle"></i> 提醒：请定期导出存档以避免数据丢失</span>
          <button @click="showSaveReminder = false"><i class="fas fa-times"></i></button>
        </div>
        <GameStatusBanner />
        <div class="mg-game__messages">
          <GameConversationPanel />
        </div>
        <PostCombatPanel v-if="shouldShowPostCombatPanel" />
        <GameInputDock />
      </section>

      <!-- Right Panel -->
      <aside class="mg-game__right mg-scroll" :class="{ 'mg-game__right--closed': !rightPanelOpen }">
        <button class="mg-panel-toggle mg-panel-toggle--right" @click="rightPanelOpen = !rightPanelOpen" :title="rightPanelOpen ? '收起面板' : '展开面板'">
          <i :class="rightPanelOpen ? 'fas fa-chevron-right' : 'fas fa-chevron-left'"></i>
        </button>
        <div v-if="rightPanelOpen" class="mg-game__right-content">
          <!-- TODO: 等待实现的功能 — 角色信息卡片（实时变量） -->
          <div class="mg-card mg-card--sm mg-card--char">
            <p class="mg-card__placeholder"><i class="fas fa-user-circle"></i> 角色卡片</p>
            <p class="mg-card__hint">可视化角色相关变量</p>
          </div>
        </div>
      </aside>
    </div>

    <!-- ═══ Bottom Bar (dev tools, hidden by default) ═══ -->
    <footer v-if="bottomBarOpen" class="mg-game__bottom">
      <button class="mg-btn mg-btn--sm mg-btn--ghost" @click="launchDebugBattleForTestingOnly">
        <i class="fas fa-flask"></i> 测试：启动预置战斗
      </button>
      <button class="mg-btn mg-btn--sm mg-btn--ghost">
        <i class="fas fa-eye"></i> 查看提示词
      </button>
      <button class="mg-btn mg-btn--sm mg-btn--ghost">
        <i class="fas fa-code"></i> 变量修改器
      </button>
      <button class="mg-btn mg-btn--sm mg-btn--ghost">
        <i class="fas fa-list"></i> 日志列表
      </button>
      <button class="mg-btn mg-btn--sm mg-btn--ghost">
        <i class="fas fa-project-diagram"></i> 查看状态机
      </button>
    </footer>

    <!-- Dev tools toggle (bottom-right corner, very subtle) -->
    <button
      class="mg-game__dev-toggle"
      @click="bottomBarOpen = !bottomBarOpen"
      :title="bottomBarOpen ? '隐藏开发者工具' : '显示开发者工具'"
      :aria-label="bottomBarOpen ? '隐藏开发者工具' : '显示开发者工具'"
    >
      <i class="fas fa-terminal"></i>
    </button>

    <!-- ═══ Battle Overlay ═══ -->
    <BattleOverlay v-if="shouldShowBattleOverlay" />
    <PromptViewerDrawer />

    <!-- ═══ In-Game Modals ═══ -->
    <div v-if="showSettings" class="mg-modal-overlay" @click.self="showSettings = false">
      <div class="mg-modal-card mg-modal-card--wide">
        <button class="mg-modal__close" @click="showSettings = false"><i class="fas fa-times"></i></button>
        <h2 class="mg-modal__title">提示词设置</h2>
        <div class="mg-modal__body mg-scroll">
          <SettingsView :embedded="true" @close="showSettings = false" />
        </div>
      </div>
    </div>

    <div v-if="showApiSettings" class="mg-modal-overlay" @click.self="showApiSettings = false">
      <div class="mg-modal-card mg-modal-card--wide">
        <button class="mg-modal__close" @click="showApiSettings = false"><i class="fas fa-times"></i></button>
        <h2 class="mg-modal__title">API 设置</h2>
        <div class="mg-modal__body mg-scroll">
          <ApiSettingsView :embedded="true" @close="showApiSettings = false" />
        </div>
      </div>
    </div>

    <div v-if="showSaveManage" class="mg-modal-overlay" @click.self="showSaveManage = false">
      <div class="mg-modal-card mg-modal-card--wide">
        <button class="mg-modal__close" @click="showSaveManage = false"><i class="fas fa-times"></i></button>
        <h2 class="mg-modal__title">存档管理</h2>
        <div class="mg-modal__body mg-scroll">
          <SaveExportView :embedded="true" @close="showSaveManage = false" />
        </div>
      </div>
    </div>
  </main>
</template>

<style lang="scss" scoped>
// ============================================================
// MainGameView — 3×3 Grid Layout
// ============================================================

.mg-game {
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
  background: var(--mg-bg, #1a1a1a);
}

// ── Center row ──
.mg-game__center {
  display: flex;
  flex: 1;
  overflow: hidden;
}

// ── Left panel ──
.mg-game__left {
  position: relative;
  width: 240px;
  min-width: 0;
  background: var(--mg-bg-card, #2d2d2d);
  border-right: var(--mg-border-width, 2px) solid var(--mg-border, #c0c0c0);
  transition: width var(--mg-transition-base, 250ms ease);
  flex-shrink: 0;

  &--closed {
    width: 36px;
  }
}

.mg-game__left-content {
  padding: var(--mg-space-md, 16px);
  display: flex;
  flex-direction: column;
  gap: var(--mg-space-sm, 8px);
}

.mg-game__left-actions {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: var(--mg-space-sm, 8px);
}

// ── Right panel ──
.mg-game__right {
  position: relative;
  width: 220px;
  min-width: 0;
  background: var(--mg-bg-card, #2d2d2d);
  border-left: var(--mg-border-width, 2px) solid var(--mg-border, #c0c0c0);
  transition: width var(--mg-transition-base, 250ms ease);
  flex-shrink: 0;

  &--closed {
    width: 36px;
  }
}

.mg-game__right-content {
  padding: var(--mg-space-md, 16px);
  display: flex;
  flex-direction: column;
  gap: var(--mg-space-sm, 8px);
}

// ── Panel toggle buttons ──
.mg-panel-toggle {
  position: absolute;
  top: 8px;
  right: 4px;
  width: 28px;
  height: 28px;
  border: var(--mg-border-width, 2px) solid var(--mg-border, #c0c0c0);
  border-radius: 50%;
  background: var(--mg-bg-card, #2d2d2d);
  color: var(--mg-text-secondary, #c9a0dc);
  font-size: 0.7rem;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2;
  transition: all var(--mg-transition-fast, 150ms ease);

  &:hover {
    color: var(--mg-accent, #ff6b9d);
    border-color: var(--mg-accent, #ff6b9d);
  }

  &--right {
    right: auto;
    left: 4px;
  }
}

// ── Center chat area ──
.mg-game__chat {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-width: 0;
}

.mg-game__messages {
  flex: 1;
  overflow-y: auto;
  padding: var(--mg-space-md, 16px);
  min-height: 0;
}

// ── Save reminder ──
.mg-game__reminder {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 16px;
  background: var(--mg-surface-pink);
  border-bottom: var(--mg-border-width, 2px) solid var(--mg-accent, #ff6b9d);
  font-size: 0.85rem;
  color: var(--mg-accent-strong, #ff2d78);

  button {
    background: none;
    border: none;
    color: inherit;
    cursor: pointer;
    font-size: 0.85rem;
  }
}

// ── Bottom dev bar ──
.mg-game__bottom {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 12px;
  background: var(--mg-bg-card, #2d2d2d);
  border-top: var(--mg-border-width, 2px) solid var(--mg-border, #c0c0c0);
  flex-shrink: 0;
  flex-wrap: wrap;
}

.mg-game__dev-toggle {
  position: fixed;
  bottom: 12px;
  right: 12px;
  width: 28px;
  height: 28px;
  border: 1px solid transparent;
  border-radius: var(--mg-radius-sm, 8px);
  background: transparent;
  color: transparent;
  font-size: 0.7rem;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: var(--mg-z-devtools, 400);
  transition: all var(--mg-transition-base, 250ms ease);
  opacity: 0.15;

  &:hover {
    opacity: 1;
    color: var(--mg-accent, #ff6b9d);
    border-color: var(--mg-accent, #ff6b9d);
    background: var(--mg-bg-card, #2d2d2d);
  }
}

// ── Shared mini-buttons & cards ──
.mg-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  border: var(--mg-border-width, 2px) solid var(--mg-border, #c0c0c0);
  border-radius: var(--mg-radius-pill, 999px);
  font-family: var(--mg-font-body, "Quicksand", sans-serif);
  font-size: 0.85rem;
  color: var(--mg-text, #f5f0f6);
  background: var(--mg-bg-card, #2d2d2d);
  cursor: pointer;
  transition: all var(--mg-transition-bounce, 300ms cubic-bezier(0.34, 1.56, 0.64, 1));
  white-space: nowrap;

  i { font-size: 0.8rem; }

  &:hover { transform: scale(1.03); border-color: var(--mg-accent, #ff6b9d); }
  &:active { transform: scale(0.97); }

  &--sm { padding: 5px 12px; font-size: 0.78rem; }

  &--ghost {
    background: transparent;
    border-color: var(--mg-border-light, rgba(255, 107, 157, 0.2));
    color: var(--mg-text-secondary, #c9a0dc);
    justify-content: flex-start;
    &:hover { color: var(--mg-accent, #ff6b9d); }
  }
}

.mg-card {
  background: var(--mg-surface-pink);
  border: var(--mg-border-width, 2px) solid var(--mg-border-light, rgba(255, 107, 157, 0.2));
  border-radius: var(--mg-radius-sm, 8px);
  padding: var(--mg-space-sm, 8px) var(--mg-space-md, 16px);

  &--sm { padding: var(--mg-space-sm, 8px) var(--mg-space-sm, 8px); }

  &--char { overflow-y: hidden; }

  &__placeholder {
    font-size: 0.8rem;
    color: var(--mg-text-muted, #888);
    text-align: center;
    margin: 0;
    i { margin-right: 4px; }
  }

  &__hint {
    font-size: 0.7rem;
    color: var(--mg-text-muted, #888);
    text-align: center;
    margin: 4px 0 0;
  }
}

// ── Modal styles (mirrors SplashScreen until extracted) ──
.mg-modal-overlay {
  position: fixed;
  inset: 0;
  z-index: var(--mg-z-modal, 200);
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--mg-bg-overlay, rgba(26, 26, 26, 0.92));
  backdrop-filter: blur(4px);
  animation: mg-fade-in 200ms ease;
}

.mg-modal-card {
  position: relative;
  background: var(--mg-bg-card, #2d2d2d);
  border: var(--mg-border-width, 2px) solid var(--mg-border, #c0c0c0);
  border-radius: var(--mg-radius, 16px);
  box-shadow: var(--mg-shadow-style);
  max-height: 85vh;
  width: 90vw;
  max-width: 520px;
  display: flex;
  flex-direction: column;

  &--wide { max-width: 720px; }
}

.mg-modal__close {
  position: absolute;
  top: 12px;
  right: 12px;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: none;
  background: transparent;
  color: var(--mg-text-secondary, #c9a0dc);
  font-size: 1rem;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1;

  &:hover {
    color: var(--mg-accent, #ff6b9d);
    background: var(--mg-surface-pink);
  }
}

.mg-modal__title {
  font-family: var(--mg-font-heading, "Fredoka", sans-serif);
  font-size: 1.2rem;
  font-weight: 700;
  color: var(--mg-text, #f5f0f6);
  padding: 20px 24px 0;
  margin: 0;
}

.mg-modal__body {
  padding: 20px 24px 24px;
  overflow-y: auto;
  flex: 1;
}

@keyframes mg-fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}
</style>
