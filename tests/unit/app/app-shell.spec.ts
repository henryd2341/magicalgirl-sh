import AppShell from "@/app/AppShell.vue";
import { render, screen } from "@testing-library/vue";
import { describe, expect, it } from "vitest";

describe("AppShell", () => {
  it("renders the application router shell without owning page-specific content", () => {
    render(AppShell, {
      slots: {
        default: '<main id="router-slot-probe">router content</main>',
      },
    });

    const appShell = screen.getByRole("application", {
      name: "MagicalGirl Application Shell",
    });
    expect(appShell).toBeInTheDocument();
    expect(appShell).toHaveAttribute("id", "application-shell");
    expect(screen.getByText("router content")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /开始新游戏/i }),
    ).not.toBeInTheDocument();
  });
});
