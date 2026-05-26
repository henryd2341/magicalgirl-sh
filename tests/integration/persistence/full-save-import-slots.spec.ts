import {
  importFullSaveToSlot,
  restoreFullSaveSlot,
} from "@/persistence/importSave";
import {
  DbWorkerClient,
  createInProcessDbWorkerEndpoint,
} from "@/persistence/dbClient";
import { DbChatHistoryRepository } from "@/persistence/repositories/chatHistoryRepository";
import { DbCheckpointRepository } from "@/persistence/repositories/checkpointRepository";
import { DbEventLogRepository } from "@/persistence/repositories/eventLogRepository";
import { DbSaveMetaRepository } from "@/persistence/repositories/saveMetaRepository";
import {
  DbVariableChangeLogRepository,
  DbVariableRepository,
} from "@/persistence/repositories/variableRepository";
import { DbWorldInfoRepository } from "@/persistence/repositories/worldInfoRepository";
import { VariableEngine } from "@/engine/variableEngine";
import { createDbWorkerRuntime } from "@/workers/db.worker";
import type { FullSaveExportV1 } from "@/persistence/exportSave";
import type { CheckpointSnapshotRecord } from "@/types/recovery";
import { describe, expect, it } from "vitest";

function createSaveCheckpoint(): CheckpointSnapshotRecord {
  const variableValue = {
    ...new VariableEngine().createInitialState(),
    rootId: "root-imported",
    stateHash: "hash-imported",
    updatedAt: "2026-05-25T08:01:00.000Z",
  };

  return {
    id: "checkpoint-imported-save",
    kind: "save_checkpoint",
    snapshotVersion: 1,
    createdAt: "2026-05-25T08:01:00.000Z",
    reason: "manual_save_export",
    sessionSnapshot: {
      sessionState: "IDLE",
      pipelineState: null,
      activeRequestId: null,
    },
    variableValue,
    chatMessages: [
      {
        id: "msg-imported-user",
        role: "user",
        kind: "normal",
        content: "导入槽位里的对话。",
        user_visible: true,
        ai_visible: true,
        provisional: false,
        finalized: true,
        failed: false,
        created_at: "2026-05-25T08:00:00.000Z",
      },
    ],
    pendingBattle: undefined,
    activeBattle: undefined,
    metadata: {
      exportId: "export-imported-001",
      manualExport: true,
    },
  };
}

function createImportPayload(): FullSaveExportV1 {
  const checkpoint = createSaveCheckpoint();

  return {
    format: "magicalgirl-sh.full-save-export",
    version: 1,
    exportedAt: "2026-05-25T08:02:00.000Z",
    exportId: "export-imported-001",
    createdCheckpointId: checkpoint.id,
    saveMetaId: "save-meta-imported",
    data: {
      checkpointSnapshots: [checkpoint],
      saveMeta: [
        {
          id: "save-meta-imported",
          label: "外部导入存档",
          createdAt: "2026-05-25T08:02:00.000Z",
          updatedAt: "2026-05-25T08:02:00.000Z",
          checkpointId: checkpoint.id,
        },
      ],
      eventLog: [
        {
          id: "event-imported-started",
          type: "RequestStarted",
          createdAt: "2026-05-25T07:59:00.000Z",
          source: "fixture",
          payload: {
            requestId: "req-imported",
          },
        },
      ],
      chatMessages: checkpoint.chatMessages,
      variableValue: checkpoint.variableValue,
      variableChangeLog: [
        {
          id: "change-imported",
          rootId: "root-imported",
          requestId: "req-imported",
          toolCallId: "tool-imported",
          contextVersion: 1,
          stateHashBefore: "hash-before-imported",
          stateHashAfter: "hash-imported",
          patches: [{ path: "player.money", value: 20 }],
          createdAt: "2026-05-25T08:00:30.000Z",
        },
      ],
      worldInfo: [
        {
          id: "wi-imported",
          keywords: ["导入"],
          content: "这条世界书来自导入槽位。",
          priority: 10,
          enabled: true,
          isConstant: false,
        },
      ],
    },
  };
}

describe("full save import slots", () => {
  it("imports a full save into a slot without activating it, then restores the slot on explicit request", async () => {
    const client = new DbWorkerClient(
      createInProcessDbWorkerEndpoint(createDbWorkerRuntime()),
    );
    await client.initialize();
    const chatRepository = new DbChatHistoryRepository(client);
    const variableRepository = new DbVariableRepository(client);
    const checkpointRepository = new DbCheckpointRepository(client);
    const eventLogRepository = new DbEventLogRepository(client);
    const saveMetaRepository = new DbSaveMetaRepository(client);
    const variableChangeLogRepository = new DbVariableChangeLogRepository(client);
    const worldInfoRepository = new DbWorldInfoRepository(client);

    await chatRepository.save({
      id: "msg-current",
      role: "user",
      kind: "normal",
      content: "当前进度不能被导入动作覆盖。",
      user_visible: true,
      ai_visible: true,
      provisional: false,
      finalized: true,
      failed: false,
      created_at: "2026-05-25T07:00:00.000Z",
    });
    await variableRepository.saveCurrent({
      ...new VariableEngine().createInitialState(),
      rootId: "root-current",
      stateHash: "hash-current",
      updatedAt: "2026-05-25T07:00:00.000Z",
    });

    const payload = createImportPayload();
    const importResult = await importFullSaveToSlot({
      client,
      jsonText: JSON.stringify(payload),
      sourceFileName: "external-save.json",
      idFactory: {
        slotId: () => "slot-imported-001",
      },
      now: () => "2026-05-25T08:05:00.000Z",
    });

    expect(importResult).toEqual({
      ok: true,
      slotId: "slot-imported-001",
      createdCheckpointId: "checkpoint-imported-save",
    });
    expect(await client.listSaveSlots()).toEqual([
      expect.objectContaining({
        id: "slot-imported-001",
        sourceFileName: "external-save.json",
        exportId: "export-imported-001",
        createdCheckpointId: "checkpoint-imported-save",
      }),
    ]);
    expect(await chatRepository.list()).toEqual([
      expect.objectContaining({
        id: "msg-current",
      }),
    ]);
    expect(await variableRepository.getCurrent()).toMatchObject({
      rootId: "root-current",
    });

    await restoreFullSaveSlot({ client, slotId: "slot-imported-001" });

    expect(await chatRepository.list()).toEqual(payload.data.chatMessages);
    expect(await variableRepository.getCurrent()).toMatchObject({
      rootId: "root-imported",
      stateHash: "hash-imported",
    });
    expect(await checkpointRepository.list()).toEqual(
      payload.data.checkpointSnapshots,
    );
    expect(await eventLogRepository.list()).toEqual(payload.data.eventLog);
    expect(await saveMetaRepository.list()).toEqual(payload.data.saveMeta);
    expect(await variableChangeLogRepository.list()).toEqual(
      payload.data.variableChangeLog,
    );
    expect(await worldInfoRepository.list()).toEqual(payload.data.worldInfo);
  });

  it("rejects malformed save JSON without creating a slot", async () => {
    const client = new DbWorkerClient(
      createInProcessDbWorkerEndpoint(createDbWorkerRuntime()),
    );
    await client.initialize();

    await expect(
      importFullSaveToSlot({
        client,
        jsonText: JSON.stringify({
          format: "wrong-format",
          version: 1,
        }),
        sourceFileName: "broken.json",
      }),
    ).rejects.toThrow("[FULL_SAVE_IMPORT_INVALID]");
    expect(await client.listSaveSlots()).toEqual([]);
  });

  it("deletes an imported save slot without touching current progress", async () => {
    const client = new DbWorkerClient(
      createInProcessDbWorkerEndpoint(createDbWorkerRuntime()),
    );
    await client.initialize();
    const chatRepository = new DbChatHistoryRepository(client);
    const variableRepository = new DbVariableRepository(client);

    await chatRepository.save({
      id: "msg-current-before-slot-delete",
      role: "user",
      kind: "normal",
      content: "删除槽位不应影响当前进度。",
      user_visible: true,
      ai_visible: true,
      provisional: false,
      finalized: true,
      failed: false,
      created_at: "2026-05-25T09:00:00.000Z",
    });
    await variableRepository.saveCurrent({
      ...new VariableEngine().createInitialState(),
      rootId: "root-current-before-slot-delete",
      stateHash: "hash-current-before-slot-delete",
      updatedAt: "2026-05-25T09:00:00.000Z",
    });

    await importFullSaveToSlot({
      client,
      jsonText: JSON.stringify(createImportPayload()),
      sourceFileName: "delete-me.json",
      idFactory: {
        slotId: () => "slot-delete-me",
      },
      now: () => "2026-05-25T09:05:00.000Z",
    });

    await client.deleteSaveSlot("slot-delete-me");

    expect(await client.listSaveSlots()).toEqual([]);
    expect(await chatRepository.list()).toEqual([
      expect.objectContaining({
        id: "msg-current-before-slot-delete",
      }),
    ]);
    expect(await variableRepository.getCurrent()).toMatchObject({
      rootId: "root-current-before-slot-delete",
      stateHash: "hash-current-before-slot-delete",
    });
  });
});
