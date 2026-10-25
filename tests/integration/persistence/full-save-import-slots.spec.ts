import { buildToolFoldHtml } from "@/orchestrator/toolResults";
const recordedContent = "导入槽位里的对话。" + '<details class="chat-tool-fold"><summary>旧工具</summary>历史内容</details>' + buildToolFoldHtml([
  { tool_name: "update_variables", tool_call_id: "saved-batch", ok: true, output: { patches: [{ path: "player.money", value: 0 }, { path: "world.flags.test", value: false }, { path: "world.location.name", value: "天台" }] } },
  { tool_name: "read_skill", tool_call_id: "saved-skill", ok: true, output: { name: "夜行", content: "完整结果<&>" } },
]);
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
import { getTrainingProgress } from "@/engine/variablePolicy";
import { createDbWorkerRuntime } from "@/workers/db.worker";
import { createFullSaveExport, type FullSaveExportV1, type FullSaveExportV2 } from "@/persistence/exportSave";
import { encodeFullSaveV3 } from "@/persistence/fullSaveMessageCodec";
import { RecoveryService } from "@/engine/recoveryService";
import type { CheckpointSnapshotRecord } from "@/types/recovery";
import { describe, expect, it, vi } from "vitest";

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
        content: recordedContent,
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
  it.each([1, 2] as const)("loads an already-stored v%s slot without migration", async (version) => {
    const client = new DbWorkerClient(createInProcessDbWorkerEndpoint(createDbWorkerRuntime()));
    await client.initialize();
    const payload = { ...createImportPayload(), version };
    await client.saveSaveSlot({
      id: "old-slot", label: "old", sourceFileName: "old.json", importedAt: payload.exportedAt,
      exportedAt: payload.exportedAt, exportId: payload.exportId,
      createdCheckpointId: payload.createdCheckpointId, saveMetaId: payload.saveMetaId, payload,
    });
    await restoreFullSaveSlot({ client, slotId: "old-slot" });
    expect(await new DbChatHistoryRepository(client).list()).toEqual(payload.data.chatMessages);
    expect((await client.getSaveSlotById("old-slot"))?.payload.version).toBe(version);
  });

  it("exports v3, restores its slot, then rolls back to the original historical battle and message state", async () => {
    const client = new DbWorkerClient(createInProcessDbWorkerEndpoint(createDbWorkerRuntime()));
    await client.initialize();
    const repositories = {
      checkpointRepository: new DbCheckpointRepository(client),
      eventLogRepository: new DbEventLogRepository(client),
      saveMetaRepository: new DbSaveMetaRepository(client),
      chatRepository: new DbChatHistoryRepository(client),
      variableRepository: new DbVariableRepository(client),
      variableChangeLogRepository: new DbVariableChangeLogRepository(client),
      worldInfoRepository: new DbWorldInfoRepository(client),
    };
    const historical = createSaveCheckpoint();
    historical.kind = "combat_checkpoint";
    historical.sessionSnapshot.sessionState = "IN_COMBAT";
    historical.activeBattle = {
      lifecycleState: "ACTIVE", phase: "PLAYER_TURN", encounterId: "story-battle", source: "story",
      participants: [], pressTurn: { ownerSide: "player", icons: [] },
    };
    historical.chatMessages[0]!.reasoning = "历史思考";
    historical.chatMessages.push({ ...historical.chatMessages[0]!, id: "old-branch-only", content: "旧分支" });
    historical.variableValue!.root.player.money = 17;
    await repositories.checkpointRepository.save(historical);
    const current = { ...historical.chatMessages[0]!, content: "同 ID 已编辑", user_visible: false, ai_visible: false };
    await repositories.chatRepository.save(current);
    const variables = new VariableEngine().createInitialState();
    variables.root.player.money = 99;
    await repositories.variableRepository.saveCurrent(variables);
    const exported = await createFullSaveExport({
      repositories,
      getSessionSnapshot: () => ({ sessionState: "IDLE", pipelineState: null, activeRequestId: null }),
      getPendingBattle: () => null, getActiveBattle: () => null,
      idFactory: { exportId: () => "new-export", checkpointId: () => "new-save", eventId: () => "new-event", saveMetaId: () => "new-meta" },
      now: () => "2026-10-25T00:00:00Z",
    });
    const expectedCheckpoints = await repositories.checkpointRepository.list();
    await importFullSaveToSlot({ client, jsonText: exported.jsonText, sourceFileName: "roundtrip.json", idFactory: { slotId: () => "roundtrip" } });
    expect(await repositories.chatRepository.list()).toEqual([current]);
    await repositories.chatRepository.replaceAll([]);
    const restored = await restoreFullSaveSlot({ client, slotId: "roundtrip" });
    expect(restored.checkpoint.id).toBe("new-save");
    expect(restored.checkpoint.activeBattle).toBeUndefined();
    expect(await repositories.chatRepository.list()).toEqual([current]);
    expect(await repositories.checkpointRepository.list()).toEqual(expectedCheckpoints);
    expect((await repositories.variableRepository.getCurrent())?.root.player.money).toBe(99);
    const restoreSessionSnapshot = vi.fn();
    const restoreBattleSnapshot = vi.fn();
    const recovery = new RecoveryService({ ...repositories, restoreSessionSnapshot, restoreBattleSnapshot });
    await recovery.rollbackToLatest("combat_checkpoint");
    expect(await repositories.chatRepository.list()).toEqual(historical.chatMessages);
    expect(await repositories.variableRepository.getCurrent()).toEqual(historical.variableValue);
    expect(restoreSessionSnapshot).toHaveBeenCalledWith(historical.sessionSnapshot);
    expect(restoreBattleSnapshot).toHaveBeenCalledWith({ activeBattle: historical.activeBattle, pendingBattle: undefined });
  });

  it.each([
    ["missing pool", { messagePool: undefined }],
    ["non-array pool", { messagePool: {} }],
    ["null pool record", { messagePool: [null] }],
    ["invalid unused pool record", { messagePool: [createSaveCheckpoint().chatMessages[0], {}] }],
    ["missing current refs", { chatMessageRefs: undefined }],
    ["non-array current refs", { chatMessageRefs: {} }],
    ...[-1, 0.5, "0", null, 1].map((ref) => [`invalid ref ${ref}`, { chatMessageRefs: [ref] }]),
    ["missing checkpoint refs", { checkpointSnapshots: [{ id: "checkpoint-imported-save", kind: "save_checkpoint" }] }],
    ["non-array checkpoint refs", { checkpointSnapshots: [{ chatMessageRefs: {} }] }],
    ["invalid checkpoint ref", { checkpointSnapshots: [{ chatMessageRefs: [99] }] }],
    ["null checkpoint", { checkpointSnapshots: [null] }],
    ["missing linked checkpoint", { checkpointSnapshots: [] }],
    ["wrong checkpoint kind", { checkpointSnapshots: [{ id: "checkpoint-imported-save", kind: "idle_checkpoint", chatMessageRefs: [] }] }],
  ])("rejects v3 %s without changing active data or slots", async (_label, overrides) => {
    const client = new DbWorkerClient(createInProcessDbWorkerEndpoint(createDbWorkerRuntime()));
    await client.initialize();
    const original: FullSaveExportV2 = { ...createImportPayload(), version: 2 };
    await client.replaceFullSaveData(original.data);
    const wire = encodeFullSaveV3(original);
    Object.assign(wire.data, overrides);
    await expect(importFullSaveToSlot({ client, jsonText: JSON.stringify(wire), sourceFileName: "bad.json" }))
      .rejects.toThrow("[FULL_SAVE_IMPORT_INVALID]");
    expect(await client.listSaveSlots()).toEqual([]);
    expect(await new DbChatHistoryRepository(client).list()).toEqual(original.data.chatMessages);
    expect(await new DbCheckpointRepository(client).list()).toEqual(original.data.checkpointSnapshots);
    expect(await new DbVariableRepository(client).getCurrent()).toEqual(original.data.variableValue);
  });

  it.each([1, 2, 3] as const)("imports v%s without activating it, then restores on explicit request", async (version) => {
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
      jsonText: JSON.stringify(version === 3 ? encodeFullSaveV3({ ...payload, version: 2 }) : { ...payload, version }),
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

    const stored = await client.getSaveSlotById("slot-imported-001");
    expect(stored?.payload.version).toBe(version === 1 ? 1 : 2);
    expect(stored?.payload.data).not.toHaveProperty("messagePool");
    expect(stored?.payload.data.chatMessages).toEqual(payload.data.chatMessages);
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
    // After restore, raw_entries are synced too. Verify the imported entry is preserved.
    const restoredWorldInfo = await worldInfoRepository.list();
    const importedEntry = restoredWorldInfo.find((e) => e.id === "wi-imported");
    expect(importedEntry).toBeDefined();
    expect(importedEntry!.content).toBe("这条世界书来自导入槽位。");
    expect(importedEntry!.enabled).toBe(true);
    expect(importedEntry!.keywords).toEqual(["导入"]);
  });

  it("syncs gender-exclusive world info entries after restoring an imported save slot", async () => {
    const client = new DbWorkerClient(
      createInProcessDbWorkerEndpoint(createDbWorkerRuntime()),
    );
    await client.initialize();
    const worldInfoRepository = new DbWorldInfoRepository(client);
    const payload = createImportPayload();

    payload.data.variableValue!.root.player.profile.gender = "男";
    payload.data.worldInfo = [
      {
        id: "raw_entries/男user",
        keywords: ["男user"],
        content: "男性主角档案。",
        priority: 500,
        enabled: false,
        isConstant: false,
      },
      {
        id: "raw_entries/女user",
        keywords: ["女user"],
        content: "女性主角档案。",
        priority: 500,
        enabled: true,
        isConstant: false,
      },
    ];

    await importFullSaveToSlot({
      client,
      jsonText: JSON.stringify(payload),
      sourceFileName: "gender-activation-save.json",
      idFactory: {
        slotId: () => "slot-gender-activation",
      },
      now: () => "2026-05-25T08:06:00.000Z",
    });

    await restoreFullSaveSlot({ client, slotId: "slot-gender-activation" });

    await expect(worldInfoRepository.list()).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "raw_entries/男user",
          enabled: true,
        }),
        expect.objectContaining({
          id: "raw_entries/女user",
          enabled: false,
        }),
      ]),
    );
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

  it("restores training progress from an imported full save", async () => {
    const client = new DbWorkerClient(
      createInProcessDbWorkerEndpoint(createDbWorkerRuntime()),
    );
    await client.initialize();
    const payload = createImportPayload();
    const progress = {
      clearedChallengeIds: ["trial-1", "trial-2"],
      claimedRewardIds: ["trial-1"],
      hiddenChallengeDiscovered: false,
    };
    payload.data.variableValue!.root.training = progress;
    payload.data.checkpointSnapshots[0]!.variableValue!.root.training = progress;

    await importFullSaveToSlot({
      client,
      jsonText: JSON.stringify(payload),
      sourceFileName: "training-progress.json",
      idFactory: { slotId: () => "slot-training-progress" },
    });
    await restoreFullSaveSlot({ client, slotId: "slot-training-progress" });

    const restored = await new DbVariableRepository(client).getCurrent();
    expect(restored?.root.training).toEqual(progress);
  });

  it("loads a legacy full save without training progress using safe defaults", async () => {
    const client = new DbWorkerClient(
      createInProcessDbWorkerEndpoint(createDbWorkerRuntime()),
    );
    await client.initialize();
    const payload = createImportPayload();
    delete payload.data.variableValue!.root.training;
    delete payload.data.checkpointSnapshots[0]!.variableValue!.root.training;

    await importFullSaveToSlot({
      client,
      jsonText: JSON.stringify(payload),
      sourceFileName: "legacy-without-training.json",
      idFactory: { slotId: () => "slot-legacy-training" },
    });
    await restoreFullSaveSlot({ client, slotId: "slot-legacy-training" });

    const restored = await new DbVariableRepository(client).getCurrent();
    expect(restored).not.toBeNull();
    expect(getTrainingProgress(restored!.root)).toEqual({
      clearedChallengeIds: [],
      claimedRewardIds: [],
      hiddenChallengeDiscovered: false,
    });
  });

});
