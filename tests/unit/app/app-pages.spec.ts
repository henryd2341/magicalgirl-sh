import MainGameView from "@/pages/MainGameView.vue";
import NewGameSetupView from "@/pages/NewGameSetupView.vue";
import SplashScreenView from "@/pages/SplashScreenView.vue";
import StartScreenView from "@/pages/StartScreenView.vue";
import { router } from "@/router";
import { render, screen } from "@testing-library/vue";
import { createPinia } from "pinia";
import { describe, expect, it } from "vitest";

describe("application page layering", () => {
  it("registers dedicated routes for start, title, new game, main game, settings, and save export", () => {
    const routeSummary = router
      .getRoutes()
      .filter((route) => typeof route.name === "string")
      .map((route) => ({ name: route.name, path: route.path }))
      .sort((left, right) => left.path.localeCompare(right.path));

    expect(routeSummary).toEqual([
      { name: "start", path: "/" },
      { name: "game", path: "/game" },
      { name: "new-game", path: "/new-game" },
      { name: "save-export", path: "/save-export" },
      { name: "settings", path: "/settings" },
      { name: "title", path: "/title" },
    ]);
  });

  it("renders the start screen as a minimal entry surface with explicit begin instructions", () => {
    render(StartScreenView);

    expect(
      screen.getByRole("button", { name: /按下 enter 或点击任意位置开始/i }),
    ).toHaveAttribute("id", "start-screen-enter-button");
    expect(screen.getByRole("main")).toHaveAttribute("id", "start-screen");
  });

  it("renders the title page as the branded main menu instead of the in-game chat screen", () => {
    render(SplashScreenView);

    expect(
      screen.getByRole("heading", { level: 1, name: /magicalgirl shell/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "开始新游戏" })).toHaveAttribute(
      "id",
      "splash-start-new-game",
    );
    expect(screen.getByRole("button", { name: "继续游戏" })).toHaveAttribute(
      "id",
      "splash-continue-game",
    );
    expect(
      screen.queryByRole("textbox", { name: "故事输入框" }),
    ).not.toBeInTheDocument();
  });

  it("renders the new game setup page as a separate initialization form before entering the game", () => {
    render(NewGameSetupView);

    expect(
      screen.getByRole("heading", { level: 1, name: "新游戏初始化" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("角色姓名")).toHaveAttribute(
      "id",
      "new-game-player-name",
    );
    expect(
      screen.getByRole("button", { name: "确认并进入主游戏" }),
    ).toHaveAttribute("id", "new-game-confirm-start");
  });

  it("renders the main game page and mounts chat components as child modules of the game view", () => {
    render(MainGameView, {
      global: {
        plugins: [createPinia(), router],
      },
    });

    expect(screen.getByRole("main")).toHaveAttribute("id", "main-game-view");
    expect(
      screen.getByRole("region", { name: "游戏状态提示" }),
    ).toHaveAttribute("id", "game-status-banner");
    expect(screen.getByRole("region", { name: "消息列表" })).toHaveAttribute(
      "id",
      "chat-message-list",
    );
    expect(screen.getByRole("region", { name: "输入框区域" })).toHaveAttribute(
      "id",
      "chat-input-box",
    );
  });
});
