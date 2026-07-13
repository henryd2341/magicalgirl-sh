import MainGameView from "@/pages/MainGameView.vue";
import { router } from "@/router";
import { useSessionStore } from "@/stores/sessionStore";
import GameTopBar from "@/ui/game/GameTopBar.vue";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/vue";
import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function setViewport(mobile: boolean) {
  vi.stubGlobal("matchMedia", vi.fn((query: string) => ({
    matches: mobile && query.includes("767px"),
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(() => false),
  })));
}

describe("training ground entry", () => {
  beforeEach(() => {
    setViewport(false);
    setActivePinia(createPinia());
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("emits the desktop entry and exposes a disabled reason", async () => {
    const view = render(GameTopBar, { global: { plugins: [router] } });
    await fireEvent.click(screen.getByRole("button", { name: "训练场" }));
    expect(view.emitted().openTrainingGround).toHaveLength(1);

    await view.rerender({ trainingDisabled: true, trainingDisabledReason: "战斗进行中" });
    const entry = screen.getByRole("button", { name: "训练场" });
    expect(entry).toBeDisabled();
    expect(entry).toHaveAttribute("title", "战斗进行中");
  });

  it("emits the mobile entry from the dropdown", async () => {
    setViewport(true);
    const view = render(GameTopBar, { global: { plugins: [router] } });
    const menu = await screen.findByRole("button", { name: "打开菜单" });
    await fireEvent.click(menu);
    await fireEvent.click(screen.getByRole("button", { name: "训练场" }));
    expect(view.emitted().openTrainingGround).toHaveLength(1);
  });

  it("opens only from stable idle and restores focus after close", async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    render(MainGameView, { global: { plugins: [pinia, router] } });
    const entry = screen.getByRole("button", { name: "训练场" });
    await fireEvent.click(entry);
    expect(await screen.findByRole("dialog", { name: "训练场" })).toBeInTheDocument();
    await fireEvent.click(screen.getByRole("button", { name: "关闭训练场" }));
    expect(screen.queryByRole("dialog", { name: "训练场" })).not.toBeInTheDocument();
    expect(entry).toHaveFocus();

    useSessionStore(pinia).enterCombatPending();
    const guarded = screen.getByRole("button", { name: "训练场" });
    await waitFor(() => expect(guarded).toBeDisabled());
    expect(guarded).toHaveAttribute("title", "存在待处理战斗");
  });
});
