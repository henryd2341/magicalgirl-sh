import MainGameView from "@/pages/MainGameView.vue";
import { router } from "@/router";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/vue";
import { createPinia, setActivePinia } from "pinia";
import { afterEach, describe, expect, it, vi } from "vitest";

function renderGame(mobile: boolean) {
  vi.stubGlobal("matchMedia", vi.fn((query: string) => ({
    matches: mobile,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })));
  const pinia = createPinia();
  setActivePinia(pinia);
  render(MainGameView, { global: { plugins: [pinia, router] } });
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("mobile floating panels", () => {
  it("keeps only Scene/Character toggles, mutual exclusion and the scene Formation entry", async () => {
    renderGame(true);
    const nav = await screen.findByRole("navigation", { name: "移动端面板" });
    const scene = within(nav).getByRole("button", { name: "场景", exact: true });
    const character = within(nav).getByRole("button", { name: "角色", exact: true });
    expect(within(nav).getAllByRole("button")).toHaveLength(2);
    expect(scene).toHaveAttribute("aria-expanded", "false");
    expect(character).toHaveAttribute("aria-expanded", "false");

    await fireEvent.click(scene);
    expect(scene).toHaveAttribute("aria-expanded", "true");
    expect(document.getElementById(scene.getAttribute("aria-controls")!))
      .not.toHaveClass("mg-game__left--closed");
    await fireEvent.click(scene);
    expect(scene).toHaveAttribute("aria-expanded", "false");

    await fireEvent.click(scene);
    await fireEvent.click(character);
    expect(scene).toHaveAttribute("aria-expanded", "false");
    expect(character).toHaveAttribute("aria-expanded", "true");
    await fireEvent.click(character);
    expect(character).toHaveAttribute("aria-expanded", "false");

    await fireEvent.click(character);
    await fireEvent.click(scene);
    expect(character).toHaveAttribute("aria-expanded", "false");
    await fireEvent.click(screen.getByRole("button", { name: "队伍编组" }));
    expect(await screen.findByRole("heading", { name: "队伍编组" })).toBeVisible();
  });

  it("does not render mobile controls on desktop", () => {
    renderGame(false);
    expect(screen.queryByRole("navigation", { name: "移动端面板" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "队伍编组" })).toBeVisible();
  });
});
