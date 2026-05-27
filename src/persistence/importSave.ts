import { syncPlayerGenderWorldInfoActivation } from "@/content/worldInfoActivation";
import type { DbWorkerClient } from "@/persistence/dbClient";
import {
  FULL_SAVE_EXPORT_FORMAT,
  type FullSaveExportV1,
} from "@/persistence/exportSave";
import { DbVariableRepository } from "@/persistence/repositories/variableRepository";
import { DbWorldInfoRepository } from "@/persistence/repositories/worldInfoRepository";
import type { SaveSlotRecord } from "@/persistence/saveSlotTypes";
import type { CheckpointSnapshotRecord } from "@/types/recovery";

export interface FullSaveImportIdFactory {
  slotId: () => string;
}

export interface ImportFullSaveToSlotInput {
  client: DbWorkerClient;
  jsonText: string;
  sourceFileName: string;
  idFactory?: FullSaveImportIdFactory;
  now?: () => string;
}

export interface ImportFullSaveToSlotResult {
  ok: true;
  slotId: string;
  createdCheckpointId: string;
}

export interface RestoreFullSaveSlotInput {
  client: DbWorkerClient;
  slotId: string;
}

export interface RestoreFullSaveSlotResult {
  ok: true;
  slotId: string;
  checkpoint: CheckpointSnapshotRecord;
}

function defaultSlotId(): string {
  return `save-slot-${Date.now().toString(36)}-${Math.random()
    .toString(16)
    .slice(2, 10)}`;
}

function invalidImport(message: string): Error {
  return new Error(`[FULL_SAVE_IMPORT_INVALID] ${message}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertArray(value: unknown, fieldName: string): asserts value is unknown[] {
  if (!Array.isArray(value)) {
    throw invalidImport(`Missing or invalid data.${fieldName}.`);
  }
}

export function parseFullSaveImport(jsonText: string): FullSaveExportV1 {
  let parsed: unknown;

  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw invalidImport("JSON parse failed.");
  }

  if (!isRecord(parsed)) {
    throw invalidImport("Payload must be an object.");
  }

  if (parsed.format !== FULL_SAVE_EXPORT_FORMAT || parsed.version !== 1) {
    throw invalidImport("Unsupported save export format or version.");
  }

  if (
    typeof parsed.exportedAt !== "string" ||
    typeof parsed.exportId !== "string" ||
    typeof parsed.createdCheckpointId !== "string" ||
    typeof parsed.saveMetaId !== "string" ||
    !isRecord(parsed.data)
  ) {
    throw invalidImport("Missing required save export metadata.");
  }

  assertArray(parsed.data.checkpointSnapshots, "checkpointSnapshots");
  assertArray(parsed.data.saveMeta, "saveMeta");
  assertArray(parsed.data.eventLog, "eventLog");
  assertArray(parsed.data.chatMessages, "chatMessages");
  assertArray(parsed.data.variableChangeLog, "variableChangeLog");
  assertArray(parsed.data.worldInfo, "worldInfo");

  const payload = parsed as unknown as FullSaveExportV1;
  const createdCheckpoint = payload.data.checkpointSnapshots.find(
    (checkpoint) => checkpoint.id === payload.createdCheckpointId,
  );

  if (!createdCheckpoint || createdCheckpoint.kind !== "save_checkpoint") {
    throw invalidImport("createdCheckpointId must point to a save checkpoint.");
  }

  return payload;
}

function createSlotLabel(payload: FullSaveExportV1): string {
  const saveMeta = payload.data.saveMeta.find(
    (record) => record.id === payload.saveMetaId,
  );

  return saveMeta?.label ?? `导入存档 ${payload.exportedAt}`;
}

export async function importFullSaveToSlot(
  input: ImportFullSaveToSlotInput,
): Promise<ImportFullSaveToSlotResult> {
  const payload = parseFullSaveImport(input.jsonText);
  const slot: SaveSlotRecord = {
    id: input.idFactory?.slotId() ?? defaultSlotId(),
    sourceFileName: input.sourceFileName,
    importedAt: input.now?.() ?? new Date().toISOString(),
    exportedAt: payload.exportedAt,
    exportId: payload.exportId,
    createdCheckpointId: payload.createdCheckpointId,
    saveMetaId: payload.saveMetaId,
    label: createSlotLabel(payload),
    payload,
  };

  await input.client.saveSaveSlot(slot);

  return {
    ok: true,
    slotId: slot.id,
    createdCheckpointId: slot.createdCheckpointId,
  };
}

export async function restoreFullSaveSlot(
  input: RestoreFullSaveSlotInput,
): Promise<RestoreFullSaveSlotResult> {
  const slot = await input.client.getSaveSlotById(input.slotId);

  if (!slot) {
    throw new Error(`[SAVE_SLOT_NOT_FOUND] No save slot found: ${input.slotId}.`);
  }

  const checkpoint = slot.payload.data.checkpointSnapshots.find(
    (candidate) => candidate.id === slot.createdCheckpointId,
  );

  if (!checkpoint) {
    throw invalidImport("Save slot is missing its created checkpoint.");
  }

  await input.client.replaceFullSaveData(slot.payload.data);
  await syncPlayerGenderWorldInfoActivation({
    variableRepository: new DbVariableRepository(input.client),
    worldInfoRepository: new DbWorldInfoRepository(input.client),
  });

  return {
    ok: true,
    slotId: slot.id,
    checkpoint,
  };
}
