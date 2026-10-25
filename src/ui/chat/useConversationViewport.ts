import { computed, nextTick, onActivated, onDeactivated, onUnmounted, ref, watch, type Ref } from 'vue';
import { defaultRangeExtractor, useVirtualizer } from '@tanstack/vue-virtual';
import type { ChatMessage } from '@/types/chat';

export function useConversationViewport(
  props: {
    messages: ChatMessage[];
    virtual?: boolean;
    scrollElement?: HTMLElement | null;
    ready?: boolean;
    historyEpoch?: number;
  },
  list: Ref<HTMLElement | null>,
  editingId: Ref<string | null>,
  focusedId: Ref<string | null>,
) {
  const active = ref(true);
  const following = ref(true);
  const margin = ref(0);
  let frame = 0;
  let clampFrame = 0;
  let readingAnchor: { id: string; index: number; offset: number; size: number } | null = null;
  let userUntil = 0;
  let returningToEnd = false;
  let scrollbarOffset: number | null = null;
  let touchY = 0;
  const virtualizer = useVirtualizer<HTMLElement, HTMLElement>(
    computed(() => {
      const rows = props.messages;
      const pins = [editingId.value, focusedId.value]
        .map(id => rows.findIndex(row => row.id === id))
        .filter(index => index >= 0);
      return {
        count: rows.length,
        enabled: !!props.virtual && active.value && !!props.scrollElement,
        getScrollElement: () => props.scrollElement ?? null,
        getItemKey: (index: number) => rows[index]!.id,
        estimateSize: () => 320,
        overscan: 6,
        gap: 16,
        scrollMargin: margin.value,
        anchorTo: 'start' as const,
        followOnAppend: false,
        onChange: () => {
          if (!clampFrame) clampFrame = requestAnimationFrame(clampReadingOffset);
        },
        rangeExtractor: range => [...new Set([...defaultRangeExtractor(range), ...pins])].sort((a, b) => a - b),
      };
    }),
  );
  // Live changes above a reader also need compensation during backward scrolling.
  virtualizer.value.shouldAdjustScrollPositionOnItemSizeChange = (item, _delta, instance) =>
    instance.itemSizeCache.has(item.key)
      ? item.end <= (instance.scrollOffset ?? 0)
      : item.start < (instance.scrollOffset ?? 0);
  const rows = computed(() =>
    props.virtual
      ? virtualizer.value
          .getVirtualItems()
          .map(item => ({ message: props.messages[item.index]!, index: item.index, start: item.start - margin.value }))
      : props.messages.map((message, index) => ({ message, index, start: 0 })),
  );
  const totalSize = computed(() => (props.virtual ? virtualizer.value.getTotalSize() : undefined));

  function captureReadingAnchor() {
    const offset = props.scrollElement?.scrollTop ?? 0;
    const item = virtualizer.value.getVirtualItems().find(row => row.start <= offset && row.end > offset);
    readingAnchor = item
      ? { id: String(item.key), index: item.index, offset: offset - item.start, size: item.size }
      : null;
  }
  function clampReadingOffset() {
    clampFrame = 0;
    if (following.value || !readingAnchor || !active.value) return;
    virtualizer.value.getVirtualItems();
    const item = virtualizer.value.measurementsCache[readingAnchor.index];
    if (item?.key !== readingAnchor.id) return;
    if (item.size >= readingAnchor.size || readingAnchor.offset < item.size) return;
    // Only clamp an offset made invalid by shrinking its own row; library anchoring owns all height deltas.
    readingAnchor.offset = Math.max(0, item.size - 80);
    readingAnchor.size = item.size;
    virtualizer.value.scrollToOffset(item.start + readingAnchor.offset, { behavior: 'auto' });
  }

  function read() {
    following.value = false;
    cancelAnimationFrame(frame);
    frame = 0;
    virtualizer.value.cancelScroll();
    captureReadingAnchor();
  }
  function layout() {
    if (!active.value || !props.virtual) return;
    const scroller = props.scrollElement;
    if (scroller && list.value) {
      margin.value =
        list.value.getBoundingClientRect().top -
        scroller.getBoundingClientRect().top -
        scroller.clientTop +
        scroller.scrollTop;
    }
    if (!frame && following.value && props.ready !== false) {
      frame = requestAnimationFrame(() => {
        frame = 0;
        if (following.value && active.value) virtualizer.value.scrollToEnd({ behavior: 'auto' });
      });
    }
  }
  function latest() {
    virtualizer.value.cancelScroll();
    following.value = true;
    readingAnchor = null;
    void nextTick(layout);
  }
  function userIntent(downward = false) {
    read();
    returningToEnd = downward;
    userUntil = performance.now() + 500;
  }
  function onWheel(event: WheelEvent) {
    userIntent(event.deltaY > 0);
  }
  function onTouchStart(event: TouchEvent) {
    touchY = event.touches[0]?.clientY ?? 0;
  }
  function onTouchMove(event: TouchEvent) {
    const nextY = event.touches[0]?.clientY ?? touchY;
    userIntent(nextY < touchY);
    touchY = nextY;
  }
  function onScroll() {
    const offset = props.scrollElement?.scrollTop ?? 0;
    if (scrollbarOffset !== null && offset !== scrollbarOffset) {
      const downward = offset > scrollbarOffset;
      scrollbarOffset = offset;
      userIntent(downward);
    }
    if (returningToEnd && performance.now() < userUntil && virtualizer.value.isAtEnd(48)) following.value = true;
    if (!following.value) {
      const size = readingAnchor ? virtualizer.value.itemSizeCache.get(readingAnchor.id) : undefined;
      if (!readingAnchor || size === undefined || readingAnchor.offset < size) captureReadingAnchor();
    }
  }
  function onPointerDown(event: PointerEvent) {
    const scroller = props.scrollElement;
    if (!scroller || event.target !== scroller || event.button !== 0 || event.pointerType !== 'mouse') return;
    userIntent();
    scrollbarOffset = scroller.scrollTop;
  }
  function onPointerUp() {
    if (scrollbarOffset === null) return;
    onScroll();
    scrollbarOffset = null;
  }
  function onKeydown(event: KeyboardEvent) {
    const target = event.target;
    if (
      !(target instanceof HTMLElement) ||
      event.defaultPrevented ||
      target.isContentEditable ||
      target.closest('input, textarea, select')
    )
      return;
    if (!['ArrowUp', 'ArrowDown', ' ', 'PageUp', 'PageDown', 'Home', 'End'].includes(event.key)) return;
    if (event.key === ' ' && target.closest("button, summary, [role='button']")) return;
    if (target !== props.scrollElement || ['ArrowUp', 'ArrowDown', ' '].includes(event.key)) {
      userIntent(['ArrowDown', 'PageDown', 'End'].includes(event.key) || (event.key === ' ' && !event.shiftKey));
      return;
    }
    event.preventDefault();
    if (event.key === 'End') return latest();
    userIntent(event.key === 'PageDown');
    if (event.key === 'Home') virtualizer.value.scrollToIndex(0, { align: 'start' });
    else
      props.scrollElement?.scrollBy({
        top: (event.key === 'PageUp' ? -1 : 1) * props.scrollElement.clientHeight * 0.85,
        behavior: 'auto',
      });
  }
  function measure(element: Element | null) {
    virtualizer.value.measureElement(element instanceof HTMLElement ? element : null);
  }
  watch(
    () => [props.scrollElement, list.value, active.value],
    ([scroller], _, cleanup) => {
      if (!(scroller instanceof HTMLElement) || !active.value || !props.virtual) return;
      const observer = new ResizeObserver(layout);
      [scroller, list.value, list.value?.parentElement?.parentElement].forEach(element => {
        if (element instanceof HTMLElement) observer.observe(element);
      });
      scroller.addEventListener('wheel', onWheel, { passive: true });
      scroller.addEventListener('touchstart', onTouchStart, { passive: true });
      scroller.addEventListener('touchmove', onTouchMove, { passive: true });
      scroller.addEventListener('pointerdown', onPointerDown, { passive: true });
      window.addEventListener('pointerup', onPointerUp, { passive: true });
      window.addEventListener('pointercancel', onPointerUp, { passive: true });
      window.addEventListener('blur', onPointerUp);
      scroller.addEventListener('scroll', onScroll, { passive: true });
      scroller.addEventListener('keydown', onKeydown);
      layout();
      cleanup(() => {
        observer.disconnect();
        scroller.removeEventListener('wheel', onWheel);
        scroller.removeEventListener('touchstart', onTouchStart);
        scroller.removeEventListener('touchmove', onTouchMove);
        scroller.removeEventListener('pointerdown', onPointerDown);
        window.removeEventListener('pointerup', onPointerUp);
        window.removeEventListener('pointercancel', onPointerUp);
        window.removeEventListener('blur', onPointerUp);
        scrollbarOffset = null;
        scroller.removeEventListener('scroll', onScroll);
        scroller.removeEventListener('keydown', onKeydown);
      });
    },
    { flush: 'post' },
  );
  watch(
    () => [props.messages, props.ready],
    () => void nextTick(layout),
    { deep: false, flush: 'post' },
  );
  watch(totalSize, () => void nextTick(layout));
  watch(
    () => props.historyEpoch,
    () => {
      virtualizer.value.measure();
      latest();
    },
  );
  onActivated(() => {
    active.value = true;
    latest();
  });
  onDeactivated(() => {
    active.value = false;
    read();
    cancelAnimationFrame(clampFrame);
    clampFrame = 0;
  });
  onUnmounted(() => {
    active.value = false;
    read();
    cancelAnimationFrame(clampFrame);
  });
  return { rows, totalSize, following, measure, read, latest };
}
