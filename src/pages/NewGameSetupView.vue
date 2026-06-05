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
.mg-setup {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  padding: var(--mg-space-lg, 24px);
  z-index: 1;
}

.mg-setup__card {
  background: var(--mg-bg-card, #2d2d2d);
  border: var(--mg-border-width, 2px) solid var(--mg-border, #c0c0c0);
  border-radius: var(--mg-radius, 16px);
  padding: var(--mg-space-xl, 32px);
  width: 100%;
  max-width: 420px;
  box-shadow: var(--mg-shadow-style);
}

.mg-setup__eyebrow {
  font-family: var(--mg-font-mono, monospace);
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--mg-text-secondary, #c9a0dc);
  text-align: center;
  margin-bottom: var(--mg-space-md, 16px);
}

.mg-setup__steps {
  display: flex;
  justify-content: center;
  gap: var(--mg-space-sm, 8px);
  margin-bottom: var(--mg-space-lg, 24px);
}

.mg-setup__step-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: var(--mg-border-light, rgba(255, 107, 157, 0.2));
  border: 2px solid var(--mg-border, #c0c0c0);
  transition: all var(--mg-transition-fast, 150ms ease);

  &--active { background: var(--mg-accent, #ff6b9d); border-color: var(--mg-accent-strong, #ff2d78); box-shadow: var(--mg-glow-pink); }
  &--done { background: var(--mg-accent-strong, #ff2d78); border-color: var(--mg-accent-strong, #ff2d78); }
}

.mg-setup__step {
  animation: mg-fade-in 250ms ease;
}

.mg-setup__step-title {
  font-family: var(--mg-font-heading, "Fredoka", sans-serif);
  font-size: 1.2rem;
  font-weight: 700;
  color: var(--mg-text, #f5f0f6);
  margin: 0 0 var(--mg-space-md, 16px);
  text-align: center;
}

.mg-setup__optional {
  font-size: 0.7rem;
  font-weight: 400;
  color: var(--mg-text-muted, #888);
  margin-left: 4px;
}

.mg-setup__label {
  display: block;
  font-family: var(--mg-font-body, "Quicksand", sans-serif);
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--mg-text-secondary, #c9a0dc);
  margin-bottom: 6px;
  margin-top: var(--mg-space-sm, 8px);
}

.mg-setup__fieldset {
  border: none;
  padding: 0;
  margin: var(--mg-space-sm, 8px) 0 0;
}

.mg-setup__radio-group {
  display: flex;
  gap: var(--mg-space-sm, 8px);
}

.mg-setup__radio {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 10px;
  border: var(--mg-border-width, 2px) solid var(--mg-border-light, rgba(255, 107, 157, 0.2));
  border-radius: var(--mg-radius-sm, 8px);
  cursor: pointer;
  font-size: 0.9rem;
  color: var(--mg-text-secondary, #c9a0dc);
  transition: all var(--mg-transition-fast, 150ms ease);

  input { display: none; }

  &:hover { border-color: var(--mg-accent, #ff6b9d); }

  &--checked {
    border-color: var(--mg-accent, #ff6b9d);
    color: var(--mg-accent, #ff6b9d);
    background: var(--mg-surface-pink);
  }
}

.mg-input {
  width: 100%;
  padding: 10px 14px;
  border: var(--mg-border-width, 2px) solid var(--mg-border, #c0c0c0);
  border-radius: var(--mg-radius-sm, 8px);
  background: var(--mg-bg, #1a1a1a);
  color: var(--mg-text, #f5f0f6);
  font-family: var(--mg-font-body, "Quicksand", sans-serif);
  font-size: 0.9rem;
  outline: none;
  transition: border-color var(--mg-transition-fast, 150ms ease);

  &:focus { border-color: var(--mg-accent, #ff6b9d); }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  &--textarea {
    resize: vertical;
    min-height: 60px;
  }
}

.mg-setup__actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--mg-space-sm, 8px);
  margin-top: var(--mg-space-lg, 24px);
  justify-content: center;
}

.mg-setup__submitting {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 16px;
  margin-bottom: var(--mg-space-md, 16px);
  border: var(--mg-border-width, 2px) solid var(--mg-accent, #ff6b9d);
  border-radius: var(--mg-radius-sm, 8px);
  background: var(--mg-surface-pink);
  color: var(--mg-accent, #ff6b9d);
  font-family: var(--mg-font-heading, "Fredoka", sans-serif);
  font-size: 0.95rem;
  font-weight: 600;
  animation: mg-fade-in 200ms ease;
}

.mg-setup__error {
  text-align: center;
  color: var(--mg-accent-strong, #ff2d78);
  font-size: 0.85rem;
  margin: 0 0 var(--mg-space-md, 16px);
  padding: 8px 16px;
  border: 1px solid var(--mg-accent-strong, #ff2d78);
  border-radius: var(--mg-radius-sm, 8px);
  background: rgba(255, 45, 120, 0.08);
}

.mg-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 10px 20px;
  border: var(--mg-border-width, 2px) solid var(--mg-border, #c0c0c0);
  border-radius: var(--mg-radius-pill, 999px);
  font-family: var(--mg-font-heading, "Fredoka", sans-serif);
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
  transition: all var(--mg-transition-bounce, 300ms cubic-bezier(0.34, 1.56, 0.64, 1));
  background: var(--mg-bg-card, #2d2d2d);
  color: var(--mg-text, #f5f0f6);

  &:hover:not(:disabled) { transform: scale(1.03); }
  &:active:not(:disabled) { transform: scale(0.97); }
  &:disabled { opacity: 0.4; cursor: not-allowed; }

  &--primary {
    background: var(--mg-accent, #ff6b9d);
    border-color: var(--mg-accent-strong, #ff2d78);
    color: #fff;
    &:hover:not(:disabled) { box-shadow: var(--mg-glow-pink); background: var(--mg-accent-strong, #ff2d78); }
  }

  &--ghost {
    background: transparent;
    border-color: var(--mg-border-light, rgba(255, 107, 157, 0.2));
    color: var(--mg-text-secondary, #c9a0dc);
    &:hover:not(:disabled) { border-color: var(--mg-accent, #ff6b9d); color: var(--mg-accent, #ff6b9d); }
  }
}

@keyframes mg-fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}
</style>
