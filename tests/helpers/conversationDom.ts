import { beforeEach, vi } from "vitest";
import { computed, unref } from "vue";

vi.mock("@tanstack/vue-virtual", async importOriginal => {
  const original = await importOriginal<typeof import("@tanstack/vue-virtual")>();
  return {
    ...original,
    useVirtualizer: (options: Parameters<typeof original.useVirtualizer>[0]) =>
      original.useVirtualizer(
        computed(() => ({
          ...unref(options),
          measureElement: () => 200,
          // eslint-disable-next-line no-unused-vars
          observeElementRect: (_instance: unknown, callback: (rect: { width: number; height: number }) => void) => {
            callback({ width: 800, height: 600 });
            return () => {};
          },
          scrollToFn: () => {},
        })),
      ),
  };
});

// jsdom has no layout; browser acceptance owns real virtual-range geometry.
beforeEach(() => {
  vi.stubGlobal(
    "matchMedia",
    vi.fn((media: string) => ({ matches: false, media, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
  );
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(600);
  vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(800);
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(600);
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(800);
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
  HTMLElement.prototype.scrollTo = vi.fn();
});
