import AppShell from "@/app/AppShell.vue";
import { router } from "@/router";
import { fireEvent, render, screen, waitFor } from "@testing-library/vue";
import { beforeEach, describe, expect, it } from "vitest";

async function renderApplicationAt(path: string) {
  await router.push(path);
  await router.isReady();

  return render(AppShell, {
    global: {
      plugins: [router],
    },
  });
}

describe("application navigation flow", () => {
  beforeEach(async () => {
    await router.push("/");
    await router.isReady();
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

    await fireEvent.click(screen.getByRole("button", { name: "存档导出" }));
    await waitFor(() => {
      expect(router.currentRoute.value.name).toBe("save-export");
    });
  });
});
