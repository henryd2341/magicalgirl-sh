import { handleHiddenChallengeDownload } from "@/app/hiddenChallengeDownload";
import { afterEach, describe, expect, it, vi } from "vitest";

describe("handleHiddenChallengeDownload", () => {
  afterEach(() => {
    window.history.replaceState(null, "", "/");
    vi.restoreAllMocks();
  });

  it("leaves ordinary paths untouched", () => {
    window.history.replaceState(null, "", "/game?slot=1#party");
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click");
    const replaceState = vi.spyOn(window.history, "replaceState");

    expect(handleHiddenChallengeDownload()).toBe(false);
    expect(click).not.toHaveBeenCalled();
    expect(replaceState).not.toHaveBeenCalled();
  });

  it("downloads the root puzzle and restores the root URL", () => {
    window.history.replaceState(null, "", "/hiddenchallenge");
    let clickedAnchor: HTMLAnchorElement | undefined;
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function () {
      clickedAnchor = this;
    });

    expect(handleHiddenChallengeDownload()).toBe(true);
    expect(clickedAnchor?.getAttribute("href")).toBe("/puzzle.png");
    expect(clickedAnchor?.getAttribute("download")).toBe("puzzle.png");
    expect(document.body.contains(clickedAnchor ?? null)).toBe(false);
    expect(`${window.location.pathname}${window.location.search}${window.location.hash}`).toBe("/");
  });

  it("preserves a base path, query, and hash while removing the entry suffix", () => {
    window.history.replaceState(
      null,
      "",
      "/game/hiddenchallenge?source=devtools#clue",
    );
    let clickedAnchor: HTMLAnchorElement | undefined;
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function () {
      clickedAnchor = this;
    });

    expect(handleHiddenChallengeDownload()).toBe(true);
    expect(clickedAnchor?.getAttribute("href")).toBe("/game/puzzle.png");
    expect(`${window.location.pathname}${window.location.search}${window.location.hash}`).toBe(
      "/game?source=devtools#clue",
    );
  });
});
