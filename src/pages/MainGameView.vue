<script setup lang="ts">
import { getChatPersistenceClient } from "@/persistence/chatRuntime";
import { useBattleStore } from "@/stores/battleStore";
import { useChatStore } from "@/stores/chatStore";
import { useSessionStore } from "@/stores/sessionStore";
import BattleOverlay from "@/ui/battle/BattleOverlay.vue";
import GameConversationPanel from "@/ui/game/GameConversationPanel.vue";
import GameInputDock from "@/ui/game/GameInputDock.vue";
import GameTopBar from "@/ui/game/GameTopBar.vue";
import SessionStateModal from "@/ui/dev/SessionStateModal.vue";
import PromptViewerDrawer from "@/ui/dev/PromptViewerDrawer.vue";
import CreditsModal from "@/ui/dev/CreditsModal.vue";
import PostCombatPanel from "@/ui/session/PostCombatPanel.vue";
import SceneThumbnail from "@/ui/game/SceneThumbnail.vue";
import WorldInfo from "@/ui/game/WorldInfo.vue";
import BgmPlayer from "@/ui/game/BgmPlayer.vue";
import CharacterCard from "@/ui/game/CharacterCard.vue";
import SystemSettingsPanel from "@/ui/settings/SystemSettingsPanel.vue";
import SettingsView from "./SettingsView.vue";
import ApiSettingsView from "./ApiSettingsView.vue";
import SaveExportView from "./SaveExportView.vue";
import { storeToRefs } from "pinia";
import { computed, onMounted, onUnmounted, ref } from "vue";
import { startTracking, resetHistory } from "@/composables/useStateTransitionHistory";

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
const showSystemSettings = ref(false);
const showCreditsModal = ref(false);
const promptViewerDrawerRef = ref();
const showStateModal = ref(false);

// ── Theme & PixiJS settings (read from localStorage, kept reactive for template) ──
const activeTheme = ref(window.localStorage.getItem("mg-theme") || "e-girl");
const pixiEnabled = ref(
  window.localStorage.getItem("mg-pixi-enabled") !== "false",
);
const pixiBlurEnabled = ref(
  window.localStorage.getItem("mg-pixi-blur") !== "false",
);

function setTheme(id: string) {
  activeTheme.value = id;
  window.localStorage.setItem("mg-theme", id);
  document.documentElement.dataset.theme = id;
}

function setPixiEnabled(val: boolean) {
  pixiEnabled.value = val;
  window.localStorage.setItem("mg-pixi-enabled", String(val));
  if (!val) pixiBlurEnabled.value = false;
  window.dispatchEvent(
    new window.CustomEvent("mg-pixi-toggle", { detail: val }),
  );
}

function setPixiBlur(val: boolean) {
  pixiBlurEnabled.value = val;
  window.localStorage.setItem("mg-pixi-blur", String(val));
  window.dispatchEvent(
    new window.CustomEvent("mg-pixi-blur-toggle", { detail: val }),
  );
}

// ── Save reminder banner ──
const showSaveReminder = ref(false);

// ── Battle / post-combat visibility ──
const shouldShowBattleOverlay = computed(() => {
  const isPending =
    snapshot.value.sessionState === "COMBAT_PENDING" &&
    pendingBattle.value !== null;
  const isActive =
    snapshot.value.sessionState === "IN_COMBAT" && activeBattle.value !== null;
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

async function handlePreviewPrompt() {
  await sessionStore.previewPrompt("(预览请求)");
  promptViewerDrawerRef.value?.open();
}

onMounted(async () => {
  if (hasInitialized.value) return;
  hasInitialized.value = true;

  startTracking();

  const persistenceClient = getChatPersistenceClient();
  if (persistenceClient) {
    await chatStore.configurePersistence({ client: persistenceClient });
    await sessionStore.configurePersistence({ client: persistenceClient });
    await sessionStore.recoverFromInterruptedCombat();
  }
  await chatStore.refreshMessages();
});

onUnmounted(() => {
  resetHistory();
});
</script>

<template>
  <main id="main-game-view" class="mg-game" role="main">
    <!-- ═══ Top Bar ═══ -->
    <GameTopBar
      @open-prompt-settings="showSettings = true"
      @open-api-settings="showApiSettings = true"
      @open-save-manage="showSaveManage = true"
      @open-system-settings="showSystemSettings = true"
    />

    <!-- ═══ Center Row (3 columns) ═══ -->
    <div class="mg-game__center">
      <!-- Left Panel -->
      <aside
        class="mg-game__left mg-scroll"
        :class="{ 'mg-game__left--closed': !leftPanelOpen }"
      >
        <button
          class="mg-panel-toggle"
          @click="leftPanelOpen = !leftPanelOpen"
          :title="leftPanelOpen ? '收起面板' : '展开面板'"
        >
          <i
            :class="
              leftPanelOpen ? 'fas fa-chevron-left' : 'fas fa-chevron-right'
            "
          ></i>
        </button>
        <Transition name="mg-panel">
          <div v-if="leftPanelOpen" class="mg-game__left-content">
            <SceneThumbnail />
            <WorldInfo />
            <BgmPlayer />
            <nav class="mg-game__left-actions">
            <div class="mg-chain-divider" aria-hidden="true"></div>
            <button class="mg-btn mg-btn--sm mg-btn--ghost mg-btn--blue">
              <i class="fas fa-users"></i> 队伍编组
            </button>
            <button class="mg-btn mg-btn--sm mg-btn--ghost mg-btn--green">
              <i class="fas fa-book"></i> 技能学习
            </button>
            <button class="mg-btn mg-btn--sm mg-btn--ghost mg-btn--yellow" @click="showCreditsModal = true">
              <i class="fas fa-scroll"></i> Credits
            </button>
          </nav>
          </div>
        </Transition>
      </aside>

      <!-- Center Chat Area -->
      <section class="mg-game__chat">
        <!-- Save reminder banner -->
        <div v-if="showSaveReminder" class="mg-game__reminder mg-checkerboard">
          <span><i class="fas fa-exclamation-triangle"></i>
            提醒：请定期导出存档以避免数据丢失</span>
          <button @click="showSaveReminder = false">
            <i class="fas fa-times"></i>
          </button>
        </div>
        <div class="mg-game__messages mg-scroll">
          <GameConversationPanel />
        </div>
        <PostCombatPanel v-if="shouldShowPostCombatPanel" />
        <GameInputDock />
      </section>

      <!-- Right Panel -->
      <aside
        class="mg-game__right mg-scroll"
        :class="{ 'mg-game__right--closed': !rightPanelOpen }"
      >
        <button
          class="mg-panel-toggle mg-panel-toggle--right"
          @click="rightPanelOpen = !rightPanelOpen"
          :title="rightPanelOpen ? '收起面板' : '展开面板'"
        >
          <i
            :class="
              rightPanelOpen ? 'fas fa-chevron-right' : 'fas fa-chevron-left'
            "
          ></i>
        </button>
        <Transition name="mg-panel">
          <div v-if="rightPanelOpen" class="mg-game__right-content">
            <CharacterCard />
          </div>
        </Transition>
      </aside>
    </div>

    <!-- ═══ Bottom Bar (dev tools, hidden by default) ═══ -->
    <footer v-if="bottomBarOpen" class="mg-game__bottom">
      <button
        class="mg-btn mg-btn--sm mg-btn--ghost"
        @click="launchDebugBattleForTestingOnly"
      >
        <i class="fas fa-flask"></i> 测试：启动预置战斗
      </button>
      <button class="mg-btn mg-btn--sm mg-btn--ghost" @click="handlePreviewPrompt">
        <i class="fas fa-eye"></i> 查看提示词
      </button>
      <!-- TODO: 等待实现 — 变量修改器 -->
      <button class="mg-btn mg-btn--sm mg-btn--ghost">
        <i class="fas fa-code"></i> 变量修改器
      </button>
      <!-- TODO: 等待实现 — 日志列表 -->
      <button class="mg-btn mg-btn--sm mg-btn--ghost">
        <i class="fas fa-list"></i> 日志列表
      </button>
      <button class="mg-btn mg-btn--sm mg-btn--ghost" @click="showStateModal = true">
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
    <PromptViewerDrawer ref="promptViewerDrawerRef" />

    <SessionStateModal v-if="showStateModal" @close="showStateModal = false" />

    <CreditsModal v-if="showCreditsModal" @close="showCreditsModal = false" />

    <!-- ═══ In-Game Modals ═══ -->
    <div
      v-if="showSettings"
      class="mg-modal-overlay"
      @click.self="showSettings = false"
    >
      <div class="mg-modal-card mg-modal-card--wide">
        <button class="mg-modal__close" @click="showSettings = false">
          <i class="fas fa-times"></i>
        </button>
        <h2 class="mg-modal__title">提示词设置</h2>
        <div class="mg-modal__body mg-scroll">
          <SettingsView :embedded="true" @close="showSettings = false" />
        </div>
      </div>
    </div>

    <div
      v-if="showApiSettings"
      class="mg-modal-overlay"
      @click.self="showApiSettings = false"
    >
      <div class="mg-modal-card mg-modal-card--wide">
        <button class="mg-modal__close" @click="showApiSettings = false">
          <i class="fas fa-times"></i>
        </button>
        <h2 class="mg-modal__title">API 设置</h2>
        <div class="mg-modal__body mg-scroll">
          <ApiSettingsView :embedded="true" @close="showApiSettings = false" />
        </div>
      </div>
    </div>

    <div
      v-if="showSaveManage"
      class="mg-modal-overlay"
      @click.self="showSaveManage = false"
    >
      <div class="mg-modal-card mg-modal-card--wide">
        <button class="mg-modal__close" @click="showSaveManage = false">
          <i class="fas fa-times"></i>
        </button>
        <h2 class="mg-modal__title">存档管理</h2>
        <div class="mg-modal__body mg-scroll">
          <SaveExportView :embedded="true" @close="showSaveManage = false" />
        </div>
      </div>
    </div>

    <!-- System Settings Modal -->
    <div
      v-if="showSystemSettings"
      class="mg-modal-overlay"
      @click.self="showSystemSettings = false"
    >
      <div class="mg-modal-card">
        <button class="mg-modal__close" @click="showSystemSettings = false">
          <i class="fas fa-times"></i>
        </button>
        <h2 class="mg-modal__title">系统设置</h2>
        <div class="mg-modal__body">
          <div class="mg-system-settings">
            <div class="mg-sys-section">
              <h3>主题切换</h3>
              <div class="mg-theme-options">
                <button
                  v-for="theme in [
                    { id: 'e-girl', label: 'E-girl / E-boy', icon: 'fa-heart' },
                    { id: 'kidcore', label: 'Kidcore', icon: 'fa-star' },
                    {
                      id: 'pastel-brutalism',
                      label: 'Pastel Brutalism',
                      icon: 'fa-square',
                    },
                  ]"
                  :key="theme.id"
                  class="mg-theme-btn"
                  :class="{ 'mg-theme-btn--active': activeTheme === theme.id }"
                  @click="setTheme(theme.id)"
                >
                  <i :class="`fas ${theme.icon}`"></i>
                  {{ theme.label }}
                </button>
              </div>
            </div>
            <div class="mg-sys-section">
              <h3><i class="fas fa-bolt"></i> 性能设置</h3>
              <p class="mg-sys-section__hint">
                PixiJS WebGL 背景特效对首次加载影响较大，可在低性能设备上关闭。
              </p>
              <label class="mg-toggle">
                <input
                  type="checkbox"
                  :checked="pixiEnabled"
                  @change="
                    setPixiEnabled(($event.target as HTMLInputElement).checked)
                  "
                />
                <span class="mg-toggle__slider"></span>
                <span class="mg-toggle__label">PixiJS 背景特效</span>
              </label>
              <label
                class="mg-toggle"
                :class="{ 'mg-toggle--disabled': !pixiEnabled }"
              >
                <input
                  type="checkbox"
                  :checked="pixiBlurEnabled"
                  :disabled="!pixiEnabled"
                  @change="
                    setPixiBlur(($event.target as HTMLInputElement).checked)
                  "
                />
                <span class="mg-toggle__slider"></span>
                <span class="mg-toggle__label">背景模糊动效</span>
              </label>
            </div>
            <SystemSettingsPanel />
          </div>
        </div>
      </div>
    </div>
  </main>
</template>

<style lang="scss" scoped>
// ============================================================
// MainGameView — LAYOUT ONLY (shared classes in _e-girl.scss)
// ============================================================

.mg-game          { display: flex; flex-direction: column; height: 100vh; overflow: hidden; background: transparent; }
.mg-game__center  { display: flex; position: relative; flex: 1; overflow: hidden; }

// Panels
.mg-game__left    { flex: 0 0 clamp(240px, 18vw, 320px); position: relative; background: var(--mg-bg-card); border-right: var(--mg-border-width) solid var(--mg-border); transition: background 0.3s ease, border-color 0.3s ease; &--closed { background: transparent; border-right-color: transparent; pointer-events: none; .mg-panel-toggle { pointer-events: auto; } } }
.mg-game__left-content  { padding: var(--mg-space-md); display: flex; flex-direction: column; gap: var(--mg-space-sm); }
.mg-game__left-actions  { display: flex; flex-direction: column; gap: 6px; margin-top: var(--mg-space-sm); }
.mg-game__right   { flex: 0 0 clamp(240px, 18vw, 320px); position: relative; background: var(--mg-bg-card); border-left: var(--mg-border-width) solid var(--mg-border); transition: background 0.3s ease, border-color 0.3s ease; &--closed { background: transparent; border-left-color: transparent; pointer-events: none; .mg-panel-toggle { pointer-events: auto; } } }
.mg-game__right-content { padding: var(--mg-space-md); display: flex; flex-direction: column; gap: var(--mg-space-sm); }

// Panel content transition
.mg-panel-enter-active,
.mg-panel-leave-active { transition: opacity 0.3s ease, transform 0.3s ease; }
.mg-panel-enter-from,
.mg-panel-leave-to       { opacity: 0; }
.mg-panel-enter-from   { transform: translateX(-12px); }
.mg-panel-leave-to     { transform: translateX(-12px); }
.mg-game__right .mg-panel-enter-from,
.mg-game__right .mg-panel-leave-to { transform: translateX(12px); }

// Panel toggles
.mg-panel-toggle  { position: absolute; top: 8px; right: 4px; width: 28px; height: 28px; border: var(--mg-border-width) solid var(--mg-border); border-radius: 50%; background: var(--mg-bg-card); color: var(--mg-text-secondary); font-size: 0.7rem; cursor: pointer; display: flex; align-items: center; justify-content: center; z-index: 2; transition: all var(--mg-transition-fast); &:hover { color: var(--mg-accent); border-color: var(--mg-accent); box-shadow: var(--mg-glow-pink); } &--right { right: auto; left: 4px; } }
.mg-game__left--closed .mg-panel-toggle  { right: auto; left: 4px; }
.mg-game__right--closed .mg-panel-toggle { left: auto; right: 4px; }

// Chat area — fixed width, never stretches
.mg-game__chat    { flex: 0 0 calc(100vw - 2 * clamp(240px, 18vw, 320px)); display: flex; flex-direction: column; overflow: hidden; min-width: 0; }
.mg-game__messages { flex: 1; overflow-y: auto; padding: var(--mg-space-md); min-height: 0; }

// Reminder banner
.mg-game__reminder { display: flex; align-items: center; justify-content: space-between; padding: 8px 16px; background: var(--mg-surface-pink); border-bottom: var(--mg-border-width) solid var(--mg-accent); font-size: 0.85rem; color: var(--mg-accent-strong); button { background: none; border: none; color: inherit; cursor: pointer; font-size: 0.85rem; } }

// Bottom dev bar & toggle
.mg-game__bottom  { display: flex; align-items: center; gap: 4px; padding: 6px 12px; background: var(--mg-bg-card); border-top: var(--mg-border-width) solid var(--mg-border); flex-shrink: 0; flex-wrap: wrap; }
.mg-game__dev-toggle { position: fixed; bottom: 12px; right: 12px; width: 28px; height: 28px; border: 1px solid transparent; border-radius: var(--mg-radius-sm); background: transparent; color: transparent; font-size: 0.7rem; cursor: pointer; display: flex; align-items: center; justify-content: center; z-index: var(--mg-z-devtools); transition: all var(--mg-transition-base); opacity: 0.15; &:hover { opacity: 1; color: var(--mg-accent); border-color: var(--mg-accent); background: var(--mg-bg-card); } }
</style>
