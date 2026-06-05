<script setup lang="ts">
import { renderOpeningMessage } from "@/content/openingMessage";
import { seedRawWorldInfoEntries } from "@/content/rawWorldInfoLoader";
import { syncPlayerGenderWorldInfoActivation } from "@/content/worldInfoActivation";
import { VariableEngine } from "@/engine/variableEngine";
import { getChatPersistenceClient } from "@/persistence/chatRuntime";
import { DbVariableRepository } from "@/persistence/repositories/variableRepository";
import { DbWorldInfoRepository } from "@/persistence/repositories/worldInfoRepository";
import { useChatStore } from "@/stores/chatStore";
import { useSessionStore } from "@/stores/sessionStore";
import { computed, ref } from "vue";
import { useRouter } from "vue-router";

const router = useRouter();

// ── Submission lock ──
const isSubmitting = ref(false);
const submitError = ref<string | null>(null);

// ── Step 1: Basic Info (required) ──
const playerName = ref("");
const playerGender = ref<"男" | "女">("女");

// ── Step 2: Appearance (optional) ──
const bodyType = ref("");
const hairColor = ref("");
const eyeColor = ref("");

// ── Step 3: Background (optional) ──
const familyBackground = ref("");
const pastExperience = ref("");

// ── Card form state ──
const currentStep = ref(1);
const totalSteps = 3;

const canProceedFromStep1 = computed(() => playerName.value.trim().length > 0);

function nextStep() {
  if (currentStep.value < totalSteps) currentStep.value++;
}
function prevStep() {
  if (currentStep.value > 1) currentStep.value--;
}

async function writeNewGameVariables(
  variableRepository: DbVariableRepository,
): Promise<void> {
  const current =
    (await variableRepository.getCurrent()) ??
    new VariableEngine().createInitialState();
  const patches = [
    { path: "player.profile.name", value: playerName.value.trim() },
    { path: "player.profile.gender", value: playerGender.value },
  ];
  if (bodyType.value.trim()) patches.push({ path: "player.profile.bodyType", value: bodyType.value.trim() });
  if (hairColor.value.trim()) patches.push({ path: "player.profile.hairColor", value: hairColor.value.trim() });
  if (eyeColor.value.trim()) patches.push({ path: "player.profile.eyeColor", value: eyeColor.value.trim() });
  if (familyBackground.value.trim()) patches.push({ path: "player.profile.familyBackground", value: familyBackground.value.trim() });
  if (pastExperience.value.trim()) patches.push({ path: "player.profile.pastExperience", value: pastExperience.value.trim() });

  const result = new VariableEngine().applyPatchSet({
    current,
    envelope: {
      request_id: "new-game-setup",
      context_version: 1,
      state_hash: current.stateHash,
      tool_call_id: "new-game-setup-initial-profile",
      patches,
    },
  });
  await variableRepository.saveCurrent(result.next);
}

async function confirmNewGame() {
  if (!canProceedFromStep1.value || isSubmitting.value) return;

  isSubmitting.value = true;
  submitError.value = null;

  try {
    const persistenceClient = getChatPersistenceClient();
    const chatStore = useChatStore();
    const sessionStore = useSessionStore();

    if (persistenceClient) {
      await persistenceClient.resetCurrentGameData();

      const variableRepository = new DbVariableRepository(persistenceClient);
      const worldInfoRepository = new DbWorldInfoRepository(persistenceClient);

      // Phase 1: seed world info + write variables in parallel (different tables)
      await Promise.all([
        seedRawWorldInfoEntries(worldInfoRepository),
        writeNewGameVariables(variableRepository),
      ]);

      // Phase 2: activate world info (depends on phase 1 writes)
      await syncPlayerGenderWorldInfoActivation({ variableRepository, worldInfoRepository });

      // Phase 3: configure stores + clear snapshot in parallel
      await Promise.all([
        chatStore.configurePersistence({ client: persistenceClient }),
        sessionStore.configurePersistence({ client: persistenceClient }),
        persistenceClient.clearRuntimeSnapshot(),
      ]);

      // Phase 4: create opening message (sync) + save + refresh
      const openingMessage = renderOpeningMessage({
        playerName: playerName.value.trim(),
        playerGender: playerGender.value.trim(),
      });
      const { repository } = chatStore.getActiveChatRuntime();
      await repository.save(openingMessage);
      await chatStore.refreshMessages();
    } else {
      chatStore.resetToInMemoryPersistence();
    }

    await router.push({ name: "game" });
  } catch (err) {
    submitError.value = err instanceof Error ? err.message : "创建新游戏失败，请重试。";
    isSubmitting.value = false;
  }
}

function cancelNewGame() {
  if (isSubmitting.value) return;
  router.push({ name: "title" });
}
</script>

<template>
  <main id="new-game-setup-view" class="mg-setup" role="main">
    <div class="mg-setup__card">
      <p class="mg-setup__eyebrow">New Game Setup</p>

      <!-- Step indicators -->
      <div class="mg-setup__steps">
        <span
          v-for="step in totalSteps"
          :key="step"
          class="mg-setup__step-dot"
          :class="{ 'mg-setup__step-dot--active': step === currentStep, 'mg-setup__step-dot--done': step < currentStep }"
        ></span>
      </div>

      <div class="mg-chain-divider" aria-hidden="true"></div>

      <!-- ═══ Submitting overlay ═══ -->
      <div v-if="isSubmitting" class="mg-setup__submitting">
        <i class="fas fa-spinner fa-spin"></i>
        <span>正在创建新游戏…</span>
      </div>

      <!-- ═══ Submit error ═══ -->
      <p v-if="submitError" class="mg-setup__error" role="alert">{{ submitError }}</p>

      <!-- ═══ Step 1: Basic Info ═══ -->
      <div v-if="currentStep === 1" class="mg-setup__step">
        <h2 class="mg-setup__step-title">基本信息</h2>
        <label class="mg-setup__label" for="new-game-player-name">角色姓名</label>
        <input
          id="new-game-player-name"
          v-model="playerName"
          class="mg-input"
          type="text"
          placeholder="请输入主角名称"
          :disabled="isSubmitting"
        />
        <fieldset class="mg-setup__fieldset" :disabled="isSubmitting">
          <legend class="mg-setup__label">角色性别</legend>
          <div class="mg-setup__radio-group">
            <label class="mg-setup__radio" :class="{ 'mg-setup__radio--checked': playerGender === '女' }">
              <input v-model="playerGender" type="radio" value="女" :disabled="isSubmitting" />
              <i class="fas fa-venus"></i> 女
            </label>
            <label class="mg-setup__radio" :class="{ 'mg-setup__radio--checked': playerGender === '男' }">
              <input v-model="playerGender" type="radio" value="男" :disabled="isSubmitting" />
              <i class="fas fa-mars"></i> 男
            </label>
          </div>
        </fieldset>
      </div>

      <!-- ═══ Step 2: Appearance ═══ -->
      <div v-if="currentStep === 2" class="mg-setup__step">
        <h2 class="mg-setup__step-title">外貌特征 <span class="mg-setup__optional">选填</span></h2>
        <label class="mg-setup__label" for="new-game-body-type">体型</label>
        <input id="new-game-body-type" v-model="bodyType" class="mg-input" type="text" placeholder="例如：纤细、匀称（留空使用默认值）" :disabled="isSubmitting" />
        <label class="mg-setup__label" for="new-game-hair-color">发色</label>
        <input id="new-game-hair-color" v-model="hairColor" class="mg-input" type="text" placeholder="例如：黑色长发（留空使用默认值）" :disabled="isSubmitting" />
        <label class="mg-setup__label" for="new-game-eye-color">瞳色</label>
        <input id="new-game-eye-color" v-model="eyeColor" class="mg-input" type="text" placeholder="例如：深棕色（留空使用默认值）" :disabled="isSubmitting" />
      </div>

      <!-- ═══ Step 3: Background ═══ -->
      <div v-if="currentStep === 3" class="mg-setup__step">
        <h2 class="mg-setup__step-title">家庭与经历 <span class="mg-setup__optional">选填</span></h2>
        <label class="mg-setup__label" for="new-game-family-bg">家庭背景</label>
        <textarea id="new-game-family-bg" v-model="familyBackground" class="mg-input mg-input--textarea" rows="3" placeholder="描述角色的家庭背景（留空使用默认值）" :disabled="isSubmitting"></textarea>
        <label class="mg-setup__label" for="new-game-past-experience">过往经历</label>
        <textarea id="new-game-past-experience" v-model="pastExperience" class="mg-input mg-input--textarea" rows="4" placeholder="描述角色的过往经历（留空使用默认值）" :disabled="isSubmitting"></textarea>
      </div>

      <!-- ═══ Actions ═══ -->
      <div class="mg-chain-divider" aria-hidden="true"></div>
      <div class="mg-setup__actions">
        <button v-if="currentStep > 1" class="mg-btn mg-btn--ghost" type="button" :disabled="isSubmitting" @click="prevStep">
          <i class="fas fa-arrow-left"></i> 上一步
        </button>
        <button v-if="currentStep < totalSteps" class="mg-btn mg-btn--primary" type="button" :disabled="isSubmitting || (!canProceedFromStep1 && currentStep === 1)" @click="nextStep">
          下一步 <i class="fas fa-arrow-right"></i>
        </button>
        <button v-if="currentStep === totalSteps" class="mg-btn mg-btn--primary" type="button" :disabled="isSubmitting || !canProceedFromStep1" @click="confirmNewGame">
          <i v-if="isSubmitting" class="fas fa-spinner fa-spin"></i>
          <i v-else class="fas fa-check"></i>
          {{ isSubmitting ? '创建中…' : '确认并开始游戏' }}
        </button>
        <button class="mg-btn mg-btn--ghost" type="button" :disabled="isSubmitting" @click="cancelNewGame">
          <i class="fas fa-times"></i> 取消
        </button>
      </div>
    </div>
  </main>
</template>

<style lang="scss" scoped>
// ============================================================
// NewGameSetup — LAYOUT ONLY (shared classes in _e-girl.scss)
// ============================================================

.mg-setup           { display: flex; align-items: center; justify-content: center; min-height: 100vh; padding: var(--mg-space-lg); z-index: 1; }
.mg-setup__card     { background: var(--mg-bg-card); border: var(--mg-border-width-thick) solid var(--mg-accent); border-radius: var(--mg-radius-lg); padding: var(--mg-space-xl); width: 100%; max-width: 420px; box-shadow: var(--mg-shadow-style), var(--mg-shadow-card); transform: rotate(-0.5deg); transition: transform var(--mg-transition-base); &:hover { transform: rotate(0deg); } }
.mg-setup__eyebrow  { font-family: var(--mg-font-mono); font-size: 0.75rem; text-transform: uppercase; letter-spacing: var(--mg-tracking-eyebrow); color: var(--mg-accent); text-align: center; margin-bottom: var(--mg-space-md); }
.mg-setup__steps    { display: flex; justify-content: center; gap: var(--mg-space-sm); margin-bottom: var(--mg-space-lg); }
.mg-setup__step-dot { width: 14px; height: 14px; border-radius: 50%; background: var(--mg-bg); border: 2px solid var(--mg-border); transition: all var(--mg-transition-bounce); &--active { background: var(--mg-accent); border-color: var(--mg-accent-strong); box-shadow: var(--mg-glow-pink); transform: scale(1.3); } &--done { background: var(--mg-accent-strong); border-color: var(--mg-accent-strong); box-shadow: 0 0 6px var(--mg-accent-glow); } }
.mg-setup__step     { animation: mg-fade-in 250ms ease; }
.mg-setup__step-title { font-family: var(--mg-font-heading); font-size: var(--mg-font-lg); font-weight: var(--mg-font-weight-heading); color: var(--mg-accent); text-shadow: var(--mg-glow-pink); margin: 0 0 var(--mg-space-md); text-align: center; }
.mg-setup__optional { font-size: var(--mg-font-xs); font-weight: 400; color: var(--mg-text-muted); margin-left: 4px; }
.mg-setup__label    { display: block; font-family: var(--mg-font-body); font-size: 0.85rem; font-weight: 600; color: var(--mg-text-secondary); margin-bottom: 6px; margin-top: var(--mg-space-sm); }
.mg-setup__fieldset { border: none; padding: 0; margin: var(--mg-space-sm) 0 0; }
.mg-setup__radio-group { display: flex; gap: var(--mg-space-sm); }
.mg-setup__radio    { flex: 1; display: flex; align-items: center; justify-content: center; gap: 6px; padding: 10px; border: var(--mg-border-width) solid var(--mg-border-light); border-radius: var(--mg-radius-sm); cursor: pointer; font-size: var(--mg-font-md); color: var(--mg-text-secondary); transition: all var(--mg-transition-fast); input { display: none; } &:hover { border-color: var(--mg-accent); } &--checked { border-color: var(--mg-accent); color: var(--mg-accent); background: var(--mg-surface-pink); } }
.mg-setup__actions  { display: flex; flex-wrap: wrap; gap: var(--mg-space-sm); margin-top: var(--mg-space-lg); justify-content: center; }
.mg-setup__submitting { display: flex; align-items: center; justify-content: center; gap: 10px; padding: 16px; margin-bottom: var(--mg-space-md); border: var(--mg-border-width) solid var(--mg-accent); border-radius: var(--mg-radius-sm); background: var(--mg-surface-pink); color: var(--mg-accent); font-family: var(--mg-font-heading); font-size: 0.95rem; font-weight: 600; animation: mg-fade-in 200ms ease; }
.mg-setup__error    { text-align: center; color: var(--mg-accent-strong); font-size: 0.85rem; margin: 0 0 var(--mg-space-md); padding: 8px 16px; border: 1px solid var(--mg-accent-strong); border-radius: var(--mg-radius-sm); background: rgba(255, 45, 120, 0.08); }
</style>
