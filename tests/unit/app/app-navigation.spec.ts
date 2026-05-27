import AppShell from "@/app/AppShell.vue";
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
import { createDbWorkerRuntime } from "@/workers/db.worker";
import { router } from "@/router";
import { fireEvent, render, screen, waitFor } from "@testing-library/vue";
import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

async function renderApplicationAt(path: string) {
  const pinia = createPinia();
  setActivePinia(pinia);

  await router.push(path);
  await router.isReady();

  return render(AppShell, {
    global: {
      plugins: [pinia, router],
    },
  });
}

describe("application navigation flow", () => {
  beforeEach(async () => {
    resetChatPersistenceClient();
    await router.push("/");
    await router.isReady();
  });

  afterEach(() => {
    resetChatPersistenceClient();
  });

  it("navigates from the start screen to the title page when the player begins the session", async () => {
    await renderApplicationAt("/");

    await fireEvent.click(
      screen.getByRole("button", { name: /按下 enter 或点击任意位置开始/i }),
    );

    await waitFor(() => {
      expect(router.currentRoute.value.name).toBe("title");
    });
    expect(
      screen.getByRole("button", { name: "开始新游戏" }),
    ).toBeInTheDocument();
  });

  it("routes each title menu action to its dedicated destination", async () => {
    await renderApplicationAt("/title");

    await fireEvent.click(screen.getByRole("button", { name: "开始新游戏" }));
    await waitFor(() => {
      expect(router.currentRoute.value.name).toBe("new-game");
    });

    await fireEvent.click(screen.getByRole("button", { name: "取消" }));
    await waitFor(() => {
      expect(router.currentRoute.value.name).toBe("title");
    });

    await fireEvent.click(screen.getByRole("button", { name: "继续游戏" }));
    await waitFor(() => {
      expect(router.currentRoute.value.name).toBe("game");
    });

    await fireEvent.click(screen.getByRole("button", { name: "设置" }));
    await waitFor(() => {
      expect(router.currentRoute.value.name).toBe("settings");
    });

    await fireEvent.click(screen.getByRole("button", { name: "返回主游戏" }));
    await waitFor(() => {
      expect(router.currentRoute.value.name).toBe("game");
    });

    await fireEvent.click(screen.getByRole("button", { name: "API 设置" }));
    await waitFor(() => {
      expect(router.currentRoute.value.name).toBe("api-settings");
    });

    await fireEvent.click(screen.getByRole("button", { name: "返回主游戏" }));
    await waitFor(() => {
      expect(router.currentRoute.value.name).toBe("game");
    });

    await fireEvent.click(screen.getByRole("button", { name: "存档导出" }));
    await waitFor(() => {
      expect(router.currentRoute.value.name).toBe("save-export");
    });

    await fireEvent.click(screen.getByRole("button", { name: "返回主游戏" }));
    await waitFor(() => {
      expect(router.currentRoute.value.name).toBe("game");
    });

    await fireEvent.click(screen.getByRole("button", { name: "返回标题页" }));
    await waitFor(() => {
      expect(router.currentRoute.value.name).toBe("title");
    });

    await fireEvent.click(screen.getByRole("button", { name: "返回开始页" }));
    await waitFor(() => {
      expect(router.currentRoute.value.name).toBe("start");
    });
  });

  it("lets the player confirm a new game into the main game page or cancel back to title", async () => {
    await renderApplicationAt("/new-game");

    await fireEvent.click(screen.getByRole("button", { name: "取消" }));
    await waitFor(() => {
      expect(router.currentRoute.value.name).toBe("title");
    });

    await fireEvent.click(screen.getByRole("button", { name: "开始新游戏" }));
    await waitFor(() => {
      expect(router.currentRoute.value.name).toBe("new-game");
    });

    await fireEvent.click(
      screen.getByRole("button", { name: "确认并进入主游戏" }),
    );
    await waitFor(() => {
      expect(router.currentRoute.value.name).toBe("game");
    });
  });

  it("starts a clean persistent game instead of inheriting old current progress", async () => {
    const client = new DbWorkerClient(
      createInProcessDbWorkerEndpoint(createDbWorkerRuntime()),
    );
    await client.initialize();
    configureChatPersistenceClient(client);
    await new DbChatHistoryRepository(client).save({
      id: "msg-old-current-progress",
      role: "user",
      kind: "normal",
      content: "旧存档不应出现在新游戏里。",
      user_visible: true,
      ai_visible: true,
      provisional: false,
      finalized: true,
      failed: false,
      created_at: "2026-05-26T02:00:00.000Z",
    });

    await renderApplicationAt("/new-game");

    await fireEvent.update(
      screen.getByLabelText("角色姓名"),
      "弓川悠真",
    );
    await fireEvent.click(screen.getByLabelText("男"));
    await fireEvent.click(
      screen.getByRole("button", { name: "确认并进入主游戏" }),
    );

    await waitFor(() => {
      expect(router.currentRoute.value.name).toBe("game");
      expect(
        screen.queryByText("旧存档不应出现在新游戏里。"),
      ).not.toBeInTheDocument();
    });
    await expect(client.listChatMessages()).resolves.toEqual([
      expect.objectContaining({
        id: "msg-opening-ceremony",
        role: "assistant",
        finalized: true,
        content: expect.stringContaining("弓川悠真"),
      }),
    ]);
    await expect(new DbVariableRepository(client).getCurrent()).resolves
      .toMatchObject({
        root: {
          player: {
            profile: {
              name: "弓川悠真",
              gender: "男",
            },
          },
        },
      });
  });

  it("opens settings and save export from the main game top bar", async () => {
    await renderApplicationAt("/game");

    await fireEvent.click(screen.getByRole("button", { name: "设置" }));
    await waitFor(() => {
      expect(router.currentRoute.value.name).toBe("settings");
    });

    await fireEvent.click(screen.getByRole("button", { name: "返回主游戏" }));
    await waitFor(() => {
      expect(router.currentRoute.value.name).toBe("game");
    });

    await fireEvent.click(screen.getByRole("button", { name: "API 设置" }));
    await waitFor(() => {
      expect(router.currentRoute.value.name).toBe("api-settings");
    });

    await fireEvent.click(screen.getByRole("button", { name: "返回主游戏" }));
    await waitFor(() => {
      expect(router.currentRoute.value.name).toBe("game");
    });

    await fireEvent.click(screen.getByRole("button", { name: "存档导出" }));
    await waitFor(() => {
      expect(router.currentRoute.value.name).toBe("save-export");
    });
  });
});
