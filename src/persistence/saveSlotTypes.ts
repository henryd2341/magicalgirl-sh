import type { FullSaveExportPayload } from "@/persistence/exportSave";

export interface SaveSlotRecord {
  id: string;
  sourceFileName: string;
  importedAt: string;
  exportedAt: string;
  exportId: string;
  createdCheckpointId: string;
  saveMetaId: string;
  label: string;
  payload: FullSaveExportPayload;
}
