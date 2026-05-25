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
import { router } from "@/router";
import { createDbWorkerRuntime } from "@/workers/db.worker";
import { fireEvent, render, screen, waitFor } from "@testing-library/vue";
import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VariableEngine } from "@/engine/variableEngine";

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
    const variableRepository = new DbVariableRepository(client);
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
    await variableRepository.saveCurrent({
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
});
