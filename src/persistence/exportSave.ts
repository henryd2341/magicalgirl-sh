import { createCheckpointManager } from "@/engine/checkpointManager";
import type { SessionSnapshot } from "@/engine/sessionManager";
import { ensureVariableState } from "@/engine/variableStateBootstrap";
import type { ChatHistoryRepository } from "@/persistence/repositories/chatHistoryRepository";
import type { CheckpointRepository } from "@/persistence/repositories/checkpointRepository";
import type { EventLogRepository } from "@/persistence/repositories/eventLogRepository";
import type { SaveMetaRepository } from "@/persistence/repositories/saveMetaRepository";
import type {
  VariableChangeLogRepository,
  VariableRepository,
} from "@/persistence/repositories/variableRepository";
import type {
  WorldInfoEntry,
  WorldInfoRepository,
} from "@/persistence/repositories/worldInfoRepository";
import type { BattleSnapshot, PendingBattleSnapshot } from "@/types/battle";
import type { ChatMessage } from "@/types/chat";
import type {
  CheckpointSnapshotRecord,
  EventLogRecord,
  SaveMetaRecord,
} from "@/types/recovery";
import type {
  VariableChangeLogRecord,
  VariableValueRecord,
} from "@/types/variables";

export const FULL_SAVE_EXPORT_FORMAT = "magicalgirl-sh.full-save-export";

export interface FullSaveExportV1 {
  format: typeof FULL_SAVE_EXPORT_FORMAT;
  version: 1;
  exportedAt: string;
  exportId: string;
  createdCheckpointId: string;
  saveMetaId: string;
  data: {
    checkpointSnapshots: CheckpointSnapshotRecord[];
    saveMeta: SaveMetaRecord[];
    eventLog: EventLogRecord[];
    chatMessages: ChatMessage[];
    variableValue: VariableValueRecord | null;
    variableChangeLog: VariableChangeLogRecord[];
    worldInfo: WorldInfoEntry[];
  };
}

export interface FullSaveExportRepositories {
  checkpointRepository: CheckpointRepository;
  eventLogRepository: EventLogRepository;
  saveMetaRepository: SaveMetaRepository;
  chatRepository: ChatHistoryRepository;
  variableRepository: VariableRepository;
  variableChangeLogRepository: VariableChangeLogRepository;
  worldInfoRepository: WorldInfoRepository;
}

export interface FullSaveExportIdFactory {
  exportId: () => string;
  checkpointId: () => string;
  eventId: () => string;
  saveMetaId: () => string;
}

export interface CreateFullSaveExportInput {
  repositories: FullSaveExportRepositories;
  getSessionSnapshot: () => SessionSnapshot;
  getPendingBattle: () => PendingBattleSnapshot | null;
  getActiveBattle: () => BattleSnapshot | null;
  idFactory?: FullSaveExportIdFactory;
  now?: () => string;
}

export interface CreateFullSaveExportResult {
  fileName: string;
  jsonText: string;
  exportRecord: SaveMetaRecord;
}

function defaultId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random()
    .toString(16)
    .slice(2, 10)}`;
}

function createDefaultIdFactory(): FullSaveExportIdFactory {
  return {
    exportId: () => defaultId("export-full"),
    checkpointId: () => defaultId("checkpoint-save"),
    eventId: () => defaultId("event-save"),
    saveMetaId: () => defaultId("save-meta"),
  };
}

function formatTimestampParts(isoTimestamp: string): {
  label: string;
  fileStamp: string;
} {
  const match = isoTimestamp.match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/,
  );

  if (!match) {
    const safeStamp = isoTimestamp.replace(/[^0-9A-Za-z]+/g, "-");
    return {
      label: isoTimestamp,
      fileStamp: safeStamp,
    };
  }

  const [, year, month, day, hour, minute, second] = match;
  return {
    label: `${year}-${month}-${day} ${hour}:${minute}:${second}`,
    fileStamp: `${year}${month}${day}-${hour}${minute}${second}`,
  };
}

export async function createFullSaveExport(
  input: CreateFullSaveExportInput,
): Promise<CreateFullSaveExportResult> {
  const now = input.now ?? (() => new Date().toISOString());
  const idFactory = input.idFactory ?? createDefaultIdFactory();
  const exportedAt = now();
  const exportId = idFactory.exportId();

  await ensureVariableState(input.repositories.variableRepository, {
    now: () => exportedAt,
  });

  const checkpointManager = createCheckpointManager({
    checkpointRepository: input.repositories.checkpointRepository,
    eventLogRepository: input.repositories.eventLogRepository,
    chatRepository: input.repositories.chatRepository,
    variableRepository: input.repositories.variableRepository,
    getSessionSnapshot: input.getSessionSnapshot,
    getPendingBattle: input.getPendingBattle,
    getActiveBattle: input.getActiveBattle,
    idFactory: {
      checkpointId: idFactory.checkpointId,
      eventId: idFactory.eventId,
    },
    now: () => exportedAt,
  });
  const checkpoint = await checkpointManager.createCheckpoint({
    kind: "save_checkpoint",
    reason: "manual_save_export",
    metadata: {
      exportId,
      manualExport: true,
    },
  });
  const timestampParts = formatTimestampParts(exportedAt);
  const exportRecord: SaveMetaRecord = {
    id: idFactory.saveMetaId(),
    label: `手动导出 ${timestampParts.label}`,
    createdAt: exportedAt,
    updatedAt: exportedAt,
    checkpointId: checkpoint.id,
  };

  await input.repositories.saveMetaRepository.save(exportRecord);

  const exportPayload: FullSaveExportV1 = {
    format: FULL_SAVE_EXPORT_FORMAT,
    version: 1,
    exportedAt,
    exportId,
    createdCheckpointId: checkpoint.id,
    saveMetaId: exportRecord.id,
    data: {
      checkpointSnapshots: await input.repositories.checkpointRepository.list(),
      saveMeta: await input.repositories.saveMetaRepository.list(),
      eventLog: await input.repositories.eventLogRepository.list(),
      chatMessages: await input.repositories.chatRepository.list(),
      variableValue: await input.repositories.variableRepository.getCurrent(),
      variableChangeLog:
        await input.repositories.variableChangeLogRepository.list(),
      worldInfo: await input.repositories.worldInfoRepository.list(),
    },
  };

  return {
    fileName: `magicalgirl-sh-save-${timestampParts.fileStamp}.json`,
    jsonText: JSON.stringify(exportPayload, null, 2),
    exportRecord,
  };
}
