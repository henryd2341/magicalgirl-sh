<script setup lang="ts">
import { getChatPersistenceClient } from "@/persistence/chatRuntime";
import { createFullSaveExport } from "@/persistence/exportSave";
import { DbChatHistoryRepository } from "@/persistence/repositories/chatHistoryRepository";
import { DbCheckpointRepository } from "@/persistence/repositories/checkpointRepository";
import { DbEventLogRepository } from "@/persistence/repositories/eventLogRepository";
import { DbSaveMetaRepository } from "@/persistence/repositories/saveMetaRepository";
import {
  DbVariableChangeLogRepository,
  DbVariableRepository,
} from "@/persistence/repositories/variableRepository";
import { DbWorldInfoRepository } from "@/persistence/repositories/worldInfoRepository";
import { useBattleStore } from "@/stores/battleStore";
import { useSessionStore } from "@/stores/sessionStore";
import { computed, ref } from "vue";
import { useRouter } from "vue-router";

const router = useRouter();
const sessionStore = useSessionStore();
const battleStore = useBattleStore();
const persistenceClient = getChatPersistenceClient();
const isExporting = ref(false);
const lastExport = ref<{
  fileName: string;
  checkpointId: string;
  exportedAt: string;
} | null>(null);
const errorMessage = ref<string | null>(null);
const canExport = computed(() => persistenceClient !== null && !isExporting.value);

async function returnToGame() {
  await router.push({ name: "game" });
}

function createDownload(fileName: string, jsonText: string) {
  const blob = new window.Blob([jsonText], {
    type: "application/json;charset=utf-8",
  });
  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  window.URL.revokeObjectURL(url);
}

async function exportFullSave() {
  if (!persistenceClient || isExporting.value) {
    return;
  }

  isExporting.value = true;
  errorMessage.value = null;

  try {
    const result = await createFullSaveExport({
      repositories: {
        checkpointRepository: new DbCheckpointRepository(persistenceClient),
        eventLogRepository: new DbEventLogRepository(persistenceClient),
        saveMetaRepository: new DbSaveMetaRepository(persistenceClient),
        chatRepository: new DbChatHistoryRepository(persistenceClient),
        variableRepository: new DbVariableRepository(persistenceClient),
        variableChangeLogRepository: new DbVariableChangeLogRepository(
          persistenceClient,
        ),
        worldInfoRepository: new DbWorldInfoRepository(persistenceClient),
      },
      getSessionSnapshot: () => sessionStore.snapshot,
      getPendingBattle: () => battleStore.pendingBattle,
      getActiveBattle: () => battleStore.activeBattle,
    });

    createDownload(result.fileName, result.jsonText);
    lastExport.value = {
      fileName: result.fileName,
      checkpointId: result.exportRecord.checkpointId,
      exportedAt: result.exportRecord.updatedAt,
    };
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : "完整备份导出失败。";
  } finally {
    isExporting.value = false;
  }
}
</script>

<template>
  <main
    id="save-export-view"
    class="save-export-view scrapbook-panel"
    role="main"
  >
    <section class="save-export-view__panel">
      <p class="eyebrow eyebrow--lime">Save Export</p>
      <h1 class="section-heading--playful">存档导出入口</h1>
      <p class="hero-subtitle">
        创建当前时刻的 save checkpoint，并导出完整恢复数据包。
      </p>
      <p v-if="!persistenceClient" class="hero-subtitle">
        当前没有可导出的数据库会话。
      </p>
      <p v-if="lastExport" class="hero-subtitle" role="status">
        已导出 {{ lastExport.fileName }}，checkpoint
        {{ lastExport.checkpointId }}，时间 {{ lastExport.exportedAt }}。
      </p>
      <p v-if="errorMessage" class="hero-subtitle" role="alert">
        {{ errorMessage }}
      </p>
      <div class="save-export-view__actions">
        <button
          id="save-export-full-backup"
          class="primary-cta"
          type="button"
          :disabled="!canExport"
          @click="exportFullSave"
        >
          {{ isExporting ? "导出中" : "导出完整备份" }}
        </button>
        <button
          id="save-export-return-game"
          class="secondary-cta"
          type="button"
          @click="returnToGame"
        >
          返回主游戏
        </button>
      </div>
    </section>
  </main>
</template>
