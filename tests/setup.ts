import "@testing-library/jest-dom/vitest";
import { beforeEach, vi } from "vitest";

Object.defineProperty(window, "scrollTo", {
  writable: true,
  value: vi.fn(),
});

// jsdom does not implement element layout observation; geometry is exercised in Playwright.
beforeEach(() => vi.stubGlobal("ResizeObserver", class {
  observe() {}
  unobserve() {}
  disconnect() {}
}));
