<script setup lang="ts">
/* eslint-disable no-undef */
import { getChatPersistenceClient } from "@/persistence/chatRuntime";
import { createFullSaveExport } from "@/persistence/exportSave";
import {
  importFullSaveToSlot,
  restoreFullSaveSlot,
} from "@/persistence/importSave";
import { DbChatHistoryRepository } from "@/persistence/repositories/chatHistoryRepository";
import { DbCheckpointRepository } from "@/persistence/repositories/checkpointRepository";
import { DbEventLogRepository } from "@/persistence/repositories/eventLogRepository";
import { DbSaveMetaRepository } from "@/persistence/repositories/saveMetaRepository";
import {
  DbVariableChangeLogRepository,
  DbVariableRepository,
} from "@/persistence/repositories/variableRepository";
import { DbWorldInfoRepository } from "@/persistence/repositories/worldInfoRepository";
import type { SaveSlotRecord } from "@/persistence/saveSlotTypes";
import { useBattleStore } from "@/stores/battleStore";
import { useChatStore } from "@/stores/chatStore";
import { useSessionStore } from "@/stores/sessionStore";
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";

const router = useRouter();
const sessionStore = useSessionStore();
const battleStore = useBattleStore();
const chatStore = useChatStore();
const persistenceClient = getChatPersistenceClient();
const isExporting = ref(false);
const isImporting = ref(false);
const isRestoringSlotId = ref<string | null>(null);
const isDeletingSlotId = ref<string | null>(null);
const selectedImportFile = ref<File | null>(null);
const saveSlots = ref<SaveSlotRecord[]>([]);
const lastExport = ref<{
  fileName: string;
  checkpointId: string;
  exportedAt: string;
} | null>(null);
const lastImport = ref<{
  sourceFileName: string;
  checkpointId: string;
} | null>(null);
const lastRestore = ref<{
  slotId: string;
  checkpointId: string;
} | null>(null);
const lastDelete = ref<{
  slotId: string;
} | null>(null);
const errorMessage = ref<string | null>(null);
const canExport = computed(() => persistenceClient !== null && !isExporting.value);
const canImport = computed(
  () =>
    persistenceClient !== null &&
    selectedImportFile.value !== null &&
    !isImporting.value,
);

onMounted(async () => {
  await refreshSaveSlots();
});

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

async function refreshSaveSlots() {
  if (!persistenceClient) {
    saveSlots.value = [];
    return;
  }

  saveSlots.value = await persistenceClient.listSaveSlots();
}

function onImportFileChanged(event: Event) {
  const input = event.target as HTMLInputElement;
  selectedImportFile.value = input.files?.[0] ?? null;
}

async function readFileText(file: File): Promise<string> {
  if (typeof file.text === "function") {
    return file.text();
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      resolve(String(reader.result ?? ""));
    });
    reader.addEventListener("error", () => {
      reject(reader.error ?? new Error("读取导入文件失败。"));
    });
    reader.readAsText(file);
  });
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

async function importSelectedFullSave() {
  if (!persistenceClient || !selectedImportFile.value || isImporting.value) {
    return;
  }

  isImporting.value = true;
  errorMessage.value = null;
  lastImport.value = null;

  try {
    const file = selectedImportFile.value;
    const result = await importFullSaveToSlot({
      client: persistenceClient,
      jsonText: await readFileText(file),
      sourceFileName: file.name,
    });

    lastImport.value = {
      sourceFileName: file.name,
      checkpointId: result.createdCheckpointId,
    };
    await refreshSaveSlots();
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : "完整备份导入失败。";
  } finally {
    isImporting.value = false;
  }
}

async function restoreSlot(slot: SaveSlotRecord) {
  if (
    !persistenceClient ||
    isRestoringSlotId.value !== null ||
    isDeletingSlotId.value !== null
  ) {
    return;
  }

  const confirmed = window.confirm(
    `恢复槽位 ${slot.label} 会覆盖当前游戏进度。是否继续？`,
  );

  if (!confirmed) {
    return;
  }

  isRestoringSlotId.value = slot.id;
  errorMessage.value = null;
  lastRestore.value = null;

  try {
    const result = await restoreFullSaveSlot({
      client: persistenceClient,
      slotId: slot.id,
    });
    await chatStore.configurePersistence({ client: persistenceClient });
    await chatStore.refreshMessages();
    await sessionStore.restoreFromCheckpointSnapshot(result.checkpoint);
    lastRestore.value = {
      slotId: result.slotId,
      checkpointId: result.checkpoint.id,
    };
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : "从槽位恢复失败。";
  } finally {
    isRestoringSlotId.value = null;
  }
}

async function deleteSlot(slot: SaveSlotRecord) {
  if (
    !persistenceClient ||
    isRestoringSlotId.value !== null ||
    isDeletingSlotId.value !== null
  ) {
    return;
  }

  const confirmed = window.confirm(`删除槽位 ${slot.label}。是否继续？`);

  if (!confirmed) {
    return;
  }

  isDeletingSlotId.value = slot.id;
  errorMessage.value = null;
  lastDelete.value = null;

  try {
    await persistenceClient.deleteSaveSlot(slot.id);
    await refreshSaveSlots();
    lastDelete.value = {
      slotId: slot.id,
    };
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : "删除槽位失败。";
  } finally {
    isDeletingSlotId.value = null;
  }
}

function exportSlot(slot: SaveSlotRecord) {
  const safeFileName =
    slot.sourceFileName.trim().length > 0
      ? slot.sourceFileName
      : `magicalgirl-sh-slot-${slot.id}.json`;
  createDownload(safeFileName, JSON.stringify(slot.payload, null, 2));
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
        创建当前时刻的 save checkpoint，或导入完整恢复数据包到槽位。
      </p>
      <p v-if="!persistenceClient" class="hero-subtitle">
        当前没有可导出的数据库会话。
      </p>
      <p v-if="lastExport" class="hero-subtitle" role="status">
        已导出 {{ lastExport.fileName }}，checkpoint
        {{ lastExport.checkpointId }}，时间 {{ lastExport.exportedAt }}。
      </p>
      <p v-if="lastImport" class="hero-subtitle" role="status">
        已导入槽位 {{ lastImport.sourceFileName }}，checkpoint
        {{ lastImport.checkpointId }}。
      </p>
      <p v-if="lastRestore" class="hero-subtitle" role="status">
        已从槽位 {{ lastRestore.slotId }} 恢复到
        {{ lastRestore.checkpointId }}。
      </p>
      <p v-if="lastDelete" class="hero-subtitle" role="status">
        已删除槽位 {{ lastDelete.slotId }}。
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
        <label class="secondary-cta" for="save-import-file">
          选择导入文件
        </label>
        <input
          id="save-import-file"
          aria-label="导入完整备份 JSON"
          type="file"
          accept="application/json,.json"
          :disabled="!persistenceClient || isImporting"
          @change="onImportFileChanged"
        />
        <button
          id="save-import-full-backup"
          class="secondary-cta"
          type="button"
          :disabled="!canImport"
          @click="importSelectedFullSave"
        >
          {{ isImporting ? "导入中" : "导入到槽位" }}
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

      <section class="save-export-view__slots" aria-label="存档槽位">
        <h2 class="section-heading--playful">存档槽位</h2>
        <p v-if="saveSlots.length === 0" class="hero-subtitle">
          暂无导入槽位。
        </p>
        <article
          v-for="slot in saveSlots"
          :key="slot.id"
          class="save-export-view__slot"
        >
          <h3 class="hero-subtitle">{{ slot.label }}</h3>
          <p>{{ slot.sourceFileName }}</p>
          <p>{{ slot.createdCheckpointId }}</p>
          <div class="save-export-view__actions">
            <button
              type="button"
              class="secondary-cta secondary-cta--warning"
              :disabled="
                isRestoringSlotId !== null || isDeletingSlotId !== null
              "
              @click="restoreSlot(slot)"
            >
              恢复此槽位
            </button>
            <button
              type="button"
              class="secondary-cta"
              :disabled="isDeletingSlotId === slot.id"
              @click="exportSlot(slot)"
            >
              导出槽位 JSON
            </button>
            <button
              type="button"
              class="secondary-cta secondary-cta--warning"
              :disabled="
                isRestoringSlotId !== null || isDeletingSlotId !== null
              "
              @click="deleteSlot(slot)"
            >
              {{ isDeletingSlotId === slot.id ? "删除中" : "删除槽位" }}
            </button>
          </div>
        </article>
      </section>
    </section>
  </main>
</template>
