import AppShell from "@/app/AppShell.vue";
import { render, screen } from "@testing-library/vue";
import { describe, expect, it } from "vitest";

describe("AppShell", () => {
  it("renders the premium landing shell with semantic sections and internal notification center", () => {
    render(AppShell);

    const appShell = screen.getByRole("application", {
      name: "MagicalGirl Shell",
    });
    expect(appShell).toBeInTheDocument();

    expect(
      screen.getByRole("heading", { level: 1, name: /magicalgirl shell/i }),
    ).toBeInTheDocument();

    const main = screen.getByRole("main");
    expect(main).toHaveAttribute("id", "main-story-hub");

    const startButton = screen.getByRole("button", { name: /启动新月协议/i });
    expect(startButton).toHaveAttribute("id", "cta-start-protocol");

    const notificationRegion = screen.getByRole("region", {
      name: /系统通知中心/i,
    });
    expect(notificationRegion).toHaveAttribute(
      "id",
      "system-notification-center",
    );

    expect(screen.getByText(/原型验证阶段/)).toBeInTheDocument();
    expect(screen.getByText(/高规格视觉骨架已加载/)).toBeInTheDocument();
    expect(screen.getByText(/单请求状态机/)).toBeInTheDocument();
    expect(screen.getByText(/本地持久化/)).toBeInTheDocument();
    expect(screen.getByText(/可扩展战斗回路/)).toBeInTheDocument();
  });
});
