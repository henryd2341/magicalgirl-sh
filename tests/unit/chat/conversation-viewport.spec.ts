import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h, nextTick, reactive, ref, shallowRef } from 'vue';
import { fireEvent, render } from '@testing-library/vue';
import { useConversationViewport } from '@/ui/chat/useConversationViewport';
import type { ChatMessage } from '@/types/chat';

const virtualizer = vi.hoisted(() => ({
  getVirtualItems: vi.fn(() => []),
  getTotalSize: vi.fn(() => 1000),
  cancelScroll: vi.fn(),
  scrollToEnd: vi.fn(),
  scrollToIndex: vi.fn(),
  scrollToOffset: vi.fn(),
  isAtEnd: vi.fn(() => true),
  measure: vi.fn(),
  measureElement: vi.fn(),
  itemSizeCache: new Map(),
  measurementsCache: [],
}));
vi.mock('@tanstack/vue-virtual', () => ({
  defaultRangeExtractor: () => [],
  useVirtualizer: () => shallowRef(virtualizer),
}));

function mountViewport(ready = true) {
  const scroller = document.createElement('div');
  document.body.append(scroller);
  const props = reactive({
    messages: [] as ChatMessage[],
    virtual: true,
    ready,
    historyEpoch: 0,
    scrollElement: scroller,
  });
  let viewport!: ReturnType<typeof useConversationViewport>;
  const view = render(
    defineComponent({
      setup() {
        const list = ref<HTMLElement | null>(null);
        viewport = useConversationViewport(props, list, ref(null), ref(null));
        return () => h('ol', { ref: list }, [h('button', '复制'), h('textarea'), h('select'), h('summary', '详情')]);
      },
    }),
    { container: scroller },
  );
  return { scroller, props, viewport, view };
}
async function paint() {
  await nextTick();
  await vi.advanceTimersByTimeAsync(20);
}
function pointerDown(scroller: HTMLElement) {
  scroller.dispatchEvent(
    Object.assign(new MouseEvent('pointerdown', { bubbles: true, button: 0 }), { pointerType: 'mouse' }),
  );
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
});
afterEach(() => vi.useRealTimers());

describe('conversation viewport policy without browser geometry', () => {
  it('waits for readiness and keeps streaming in reading mode until explicit latest', async () => {
    const { viewport, props, scroller } = mountViewport(false);
    await paint();
    expect(virtualizer.scrollToEnd).not.toHaveBeenCalled();
    props.ready = true;
    await paint();
    expect(virtualizer.scrollToEnd).toHaveBeenCalledTimes(1);
    await fireEvent.wheel(scroller, { deltaY: -100 });
    props.messages = [...props.messages];
    await paint();
    expect(viewport.following.value).toBe(false);
    expect(virtualizer.scrollToEnd).toHaveBeenCalledTimes(1);
    viewport.latest();
    await paint();
    expect(virtualizer.scrollToEnd).toHaveBeenCalledTimes(2);
    props.historyEpoch++;
    await paint();
    expect(virtualizer.measure).toHaveBeenCalledTimes(1);
  });

  it('recognizes scrolling keys from message buttons without consuming activation/editor keys', async () => {
    const { viewport, scroller, props } = mountViewport();
    await paint();
    const button = scroller.querySelector('button')!;
    const arrow = new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true });
    button.dispatchEvent(arrow);
    expect(arrow.defaultPrevented).toBe(false);
    expect(viewport.following.value).toBe(false);
    props.messages = [...props.messages];
    await paint();
    expect(virtualizer.scrollToEnd).toHaveBeenCalledTimes(1);
    viewport.latest();
    await paint();
    for (const element of [
      button,
      scroller.querySelector('textarea')!,
      scroller.querySelector('select')!,
      scroller.querySelector('summary')!,
    ]) {
      const key = new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true });
      element.dispatchEvent(key);
      expect(key.defaultPrevented).toBe(false);
      expect(viewport.following.value).toBe(true);
    }
    const editable = document.createElement('div');
    Object.defineProperty(editable, 'isContentEditable', { value: true });
    scroller.append(editable);
    await fireEvent.keyDown(editable, { key: 'ArrowUp' });
    expect(viewport.following.value).toBe(true);
  });

  it('uses actual scrollbar direction, including a tiny upward move near the end', async () => {
    const { viewport, scroller, props } = mountViewport();
    await paint();
    scroller.scrollTop = 1000;
    pointerDown(scroller);
    scroller.scrollTop = 999;
    await fireEvent.scroll(scroller);
    expect(viewport.following.value).toBe(false);
    scroller.scrollTop = 500;
    await fireEvent.scroll(scroller);
    window.dispatchEvent(new Event('pointerup'));
    props.messages = [...props.messages];
    await paint();
    expect(virtualizer.scrollToEnd).toHaveBeenCalledTimes(1);
    pointerDown(scroller);
    scroller.scrollTop = 1000;
    await fireEvent.scroll(scroller);
    window.dispatchEvent(new Event('pointerup'));
    expect(viewport.following.value).toBe(true);
  });
});
