/* eslint-disable no-undef */

import SaveExportView from "@/pages/SaveExportView.vue";
import {
  configureChatPersistenceClient,
  resetChatPersistenceClient,
} from "@/persistence/chatRuntime";
import {
  DbWorkerClient,
  createInProcessDbWorkerEndpoint,
} from "@/persistence/dbClient";
import { DbChatHistoryRepository } from "@/persistence/repositories/chatHistoryRepository";
import { DbVariableRepository } from "@/persistence/repositories/variableRepository";
import { DbWorldInfoRepository } from "@/persistence/repositories/worldInfoRepository";
import { router } from "@/router";
import { createDbWorkerRuntime } from "@/workers/db.worker";
import { fireEvent, render, screen, waitFor } from "@testing-library/vue";
import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VariableEngine } from "@/engine/variableEngine";
import type { FullSaveExportV1 } from "@/persistence/exportSave";
import { importFullSaveToSlot } from "@/persistence/importSave";

describe("SaveExportView", () => {
  beforeEach(() => {
    resetChatPersistenceClient();
    setActivePinia(createPinia());
  });

  afterEach(() => {
    resetChatPersistenceClient();
    vi.restoreAllMocks();
  });

  it("shows that full export is unavailable without DB-backed persistence", () => {
    render(SaveExportView, {
      global: {
        plugins: [createPinia(), router],
      },
    });

    expect(
      screen.getByText("当前没有可导出的数据库会话。"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "导出完整备份" }),
    ).toBeDisabled();
  });

  it("creates a full save export and triggers a JSON file download", async () => {
    const client = new DbWorkerClient(
      createInProcessDbWorkerEndpoint(createDbWorkerRuntime()),
    );
    await client.initialize();
    configureChatPersistenceClient(client);
    const pinia = createPinia();
    setActivePinia(pinia);
    const chatRepository = new DbChatHistoryRepository(client);
    const clickSpy = vi
      .spyOn(window.HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => undefined);
    Object.defineProperty(window.URL, "createObjectURL", {
      configurable: true,
      value: () => "blob:unmocked",
    });
    Object.defineProperty(window.URL, "revokeObjectURL", {
      configurable: true,
      value: () => undefined,
    });
    const createObjectUrlSpy = vi
      .spyOn(window.URL, "createObjectURL")
      .mockReturnValue("blob:full-save-export");
    const revokeObjectUrlSpy = vi
      .spyOn(window.URL, "revokeObjectURL")
      .mockImplementation(() => undefined);

    await chatRepository.save({
      id: "msg-ui-export",
      role: "user",
      kind: "normal",
      content: "准备导出。",
      user_visible: true,
      ai_visible: true,
      provisional: false,
      finalized: true,
      failed: false,
      created_at: "2026-05-25T02:00:00.000Z",
    });
    await new DbVariableRepository(client).saveCurrent({
      ...new VariableEngine().createInitialState(),
      rootId: "root-ui-export",
      stateHash: "hash-ui-export",
      updatedAt: "2026-05-25T02:00:00.000Z",
    });

    render(SaveExportView, {
      global: {
        plugins: [pinia, router],
      },
    });

    await fireEvent.click(
      screen.getByRole("button", { name: "导出完整备份" }),
    );

    await waitFor(() => {
      expect(clickSpy).toHaveBeenCalledTimes(1);
      expect(createObjectUrlSpy).toHaveBeenCalledTimes(1);
      expect(revokeObjectUrlSpy).toHaveBeenCalledWith("blob:full-save-export");
      expect(
        screen.getByText(/已导出 magicalgirl-sh-save-/),
      ).toBeInTheDocument();
      expect(
        screen.getByText(/checkpoint-save-/),
      ).toBeInTheDocument();
    });
  });

  it("imports a full save JSON into a save slot without activating it", async () => {
    const client = new DbWorkerClient(
      createInProcessDbWorkerEndpoint(createDbWorkerRuntime()),
    );
    await client.initialize();
    configureChatPersistenceClient(client);
    const pinia = createPinia();
    setActivePinia(pinia);
    const chatRepository = new DbChatHistoryRepository(client);
    const variableValue = {
      ...new VariableEngine().createInitialState(),
      rootId: "root-ui-imported",
      stateHash: "hash-ui-imported",
      updatedAt: "2026-05-25T10:01:00.000Z",
    };
    const payload: FullSaveExportV1 = {
      format: "magicalgirl-sh.full-save-export",
      version: 1,
      exportedAt: "2026-05-25T10:02:00.000Z",
      exportId: "export-ui-imported",
      createdCheckpointId: "checkpoint-ui-imported",
      saveMetaId: "save-meta-ui-imported",
      data: {
        checkpointSnapshots: [
          {
            id: "checkpoint-ui-imported",
            kind: "save_checkpoint",
            snapshotVersion: 1,
            createdAt: "2026-05-25T10:02:00.000Z",
            reason: "manual_save_export",
            sessionSnapshot: {
              sessionState: "IDLE",
              pipelineState: null,
              activeRequestId: null,
            },
            variableValue,
            chatMessages: [
              {
                id: "msg-ui-imported",
                role: "user",
                kind: "normal",
                content: "导入 UI 存档。",
                user_visible: true,
                ai_visible: true,
                provisional: false,
                finalized: true,
                failed: false,
                created_at: "2026-05-25T10:00:00.000Z",
              },
            ],
          },
        ],
        saveMeta: [
          {
            id: "save-meta-ui-imported",
            label: "UI 导入存档",
            createdAt: "2026-05-25T10:02:00.000Z",
            updatedAt: "2026-05-25T10:02:00.000Z",
            checkpointId: "checkpoint-ui-imported",
          },
        ],
        eventLog: [],
        chatMessages: [
          {
            id: "msg-ui-imported",
            role: "user",
            kind: "normal",
            content: "导入 UI 存档。",
            user_visible: true,
            ai_visible: true,
            provisional: false,
            finalized: true,
            failed: false,
            created_at: "2026-05-25T10:00:00.000Z",
          },
        ],
        variableValue,
        variableChangeLog: [],
        worldInfo: [],
      },
    };

    await chatRepository.save({
      id: "msg-ui-current",
      role: "user",
      kind: "normal",
      content: "当前 UI 进度。",
      user_visible: true,
      ai_visible: true,
      provisional: false,
      finalized: true,
      failed: false,
      created_at: "2026-05-25T09:00:00.000Z",
    });

    render(SaveExportView, {
      global: {
        plugins: [pinia, router],
      },
    });

    const file = new File([JSON.stringify(payload)], "ui-import.json", {
      type: "application/json",
    });
    const fileInput = screen.getByLabelText("导入完整备份 JSON");
    Object.defineProperty(fileInput, "files", {
      configurable: true,
      value: [file],
    });
    fileInput.dispatchEvent(new Event("change", { bubbles: true }));
    await fireEvent.click(screen.getByRole("button", { name: "导入到槽位" }));

    await waitFor(async () => {
      expect(screen.getByText(/已导入槽位/)).toBeInTheDocument();
      expect(screen.getByText("ui-import.json")).toBeInTheDocument();
      expect(screen.getByText("checkpoint-ui-imported")).toBeInTheDocument();
      expect(await chatRepository.list()).toEqual([
        expect.objectContaining({
          id: "msg-ui-current",
        }),
      ]);
    });
  });

  it("restores the current runtime from an imported save slot after confirmation", async () => {
    const client = new DbWorkerClient(
      createInProcessDbWorkerEndpoint(createDbWorkerRuntime()),
    );
    await client.initialize();
    configureChatPersistenceClient(client);
    const pinia = createPinia();
    setActivePinia(pinia);
    const chatRepository = new DbChatHistoryRepository(client);
    const worldInfoRepository = new DbWorldInfoRepository(client);
    const variableValue = {
      ...new VariableEngine().createInitialState(),
      rootId: "root-ui-restored",
      stateHash: "hash-ui-restored",
      updatedAt: "2026-05-25T11:01:00.000Z",
    };
    variableValue.root.player.profile.gender = "男";
    const payload: FullSaveExportV1 = {
      format: "magicalgirl-sh.full-save-export",
      version: 1,
      exportedAt: "2026-05-25T11:02:00.000Z",
      exportId: "export-ui-restored",
      createdCheckpointId: "checkpoint-ui-restored",
      saveMetaId: "save-meta-ui-restored",
      data: {
        checkpointSnapshots: [
          {
            id: "checkpoint-ui-restored",
            kind: "save_checkpoint",
            snapshotVersion: 1,
            createdAt: "2026-05-25T11:02:00.000Z",
            reason: "manual_save_export",
            sessionSnapshot: {
              sessionState: "IDLE",
              pipelineState: null,
              activeRequestId: null,
            },
            variableValue,
            chatMessages: [
              {
                id: "msg-ui-restored",
                role: "user",
                kind: "normal",
                content: "恢复后的 UI 存档。",
                user_visible: true,
                ai_visible: true,
                provisional: false,
                finalized: true,
                failed: false,
                created_at: "2026-05-25T11:00:00.000Z",
              },
            ],
          },
        ],
        saveMeta: [
          {
            id: "save-meta-ui-restored",
            label: "UI 恢复存档",
            createdAt: "2026-05-25T11:02:00.000Z",
            updatedAt: "2026-05-25T11:02:00.000Z",
            checkpointId: "checkpoint-ui-restored",
          },
        ],
        eventLog: [],
        chatMessages: [
          {
            id: "msg-ui-restored",
            role: "user",
            kind: "normal",
            content: "恢复后的 UI 存档。",
            user_visible: true,
            ai_visible: true,
            provisional: false,
            finalized: true,
            failed: false,
            created_at: "2026-05-25T11:00:00.000Z",
          },
        ],
        variableValue,
        variableChangeLog: [],
        worldInfo: [
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
        ],
      },
    };

    await chatRepository.save({
      id: "msg-ui-before-restore",
      role: "user",
      kind: "normal",
      content: "恢复前进度。",
      user_visible: true,
      ai_visible: true,
      provisional: false,
      finalized: true,
      failed: false,
      created_at: "2026-05-25T10:30:00.000Z",
    });
    await importFullSaveToSlot({
      client,
      jsonText: JSON.stringify(payload),
      sourceFileName: "restore-slot.json",
      idFactory: {
        slotId: () => "slot-ui-restored",
      },
      now: () => "2026-05-25T11:03:00.000Z",
    });
    vi.spyOn(window, "confirm").mockReturnValue(true);

    render(SaveExportView, {
      global: {
        plugins: [pinia, router],
      },
    });

    await screen.findByText("restore-slot.json");
    await fireEvent.click(screen.getByRole("button", { name: "恢复此槽位" }));

    await waitFor(async () => {
      expect(await chatRepository.list()).toEqual(payload.data.chatMessages);
      expect(
        screen.getByText(/已从槽位 slot-ui-restored 恢复到/),
      ).toBeInTheDocument();
      expect(screen.getAllByText(/checkpoint-ui-restored/).length).toBeGreaterThan(
        0,
      );
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
  });

  it("deletes an imported save slot after confirmation", async () => {
    const client = new DbWorkerClient(
      createInProcessDbWorkerEndpoint(createDbWorkerRuntime()),
    );
    await client.initialize();
    configureChatPersistenceClient(client);
    const pinia = createPinia();
    setActivePinia(pinia);
    const variableValue = {
      ...new VariableEngine().createInitialState(),
      rootId: "root-ui-delete-slot",
      stateHash: "hash-ui-delete-slot",
      updatedAt: "2026-05-25T12:01:00.000Z",
    };
    const payload: FullSaveExportV1 = {
      format: "magicalgirl-sh.full-save-export",
      version: 1,
      exportedAt: "2026-05-25T12:02:00.000Z",
      exportId: "export-ui-delete-slot",
      createdCheckpointId: "checkpoint-ui-delete-slot",
      saveMetaId: "save-meta-ui-delete-slot",
      data: {
        checkpointSnapshots: [
          {
            id: "checkpoint-ui-delete-slot",
            kind: "save_checkpoint",
            snapshotVersion: 1,
            createdAt: "2026-05-25T12:02:00.000Z",
            reason: "manual_save_export",
            sessionSnapshot: {
              sessionState: "IDLE",
              pipelineState: null,
              activeRequestId: null,
            },
            variableValue,
            chatMessages: [],
          },
        ],
        saveMeta: [
          {
            id: "save-meta-ui-delete-slot",
            label: "UI 删除槽位",
            createdAt: "2026-05-25T12:02:00.000Z",
            updatedAt: "2026-05-25T12:02:00.000Z",
            checkpointId: "checkpoint-ui-delete-slot",
          },
        ],
        eventLog: [],
        chatMessages: [],
        variableValue,
        variableChangeLog: [],
        worldInfo: [],
      },
    };

    await importFullSaveToSlot({
      client,
      jsonText: JSON.stringify(payload),
      sourceFileName: "delete-slot.json",
      idFactory: {
        slotId: () => "slot-ui-delete",
      },
      now: () => "2026-05-25T12:03:00.000Z",
    });
    vi.spyOn(window, "confirm").mockReturnValue(true);

    render(SaveExportView, {
      global: {
        plugins: [pinia, router],
      },
    });

    await screen.findByText("delete-slot.json");
    await fireEvent.click(screen.getByRole("button", { name: "删除槽位" }));

    await waitFor(async () => {
      expect(screen.getByText(/已删除槽位 slot-ui-delete/)).toBeInTheDocument();
      expect(screen.queryByText("delete-slot.json")).not.toBeInTheDocument();
      expect(await client.listSaveSlots()).toEqual([]);
    });
  });
});
