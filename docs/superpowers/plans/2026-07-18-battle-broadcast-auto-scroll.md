# Battle Broadcast Auto-Scroll Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Force the expanded battle broadcast log to its bottom whenever a newly visible record is rendered, including after restoring from minimized state.

**Architecture:** Keep scrolling local to `BattleBroadcastWindow.vue`. Reuse `jumpToLatest()`, schedule it after Vue DOM updates, and test the rendered scroll container through Testing Library.

**Tech Stack:** Vue 3 Composition API, TypeScript, Vitest, Testing Library Vue.

---

### Task 1: Auto-scroll newly rendered records

**Files:**
- Modify: `tests/unit/app/battle-broadcast-window.spec.ts`
- Modify: `src/ui/battle/BattleBroadcastWindow.vue`

- [ ] **Step 1: Replace the old unread-only test with a failing forced-scroll test**

Render the component, define `scrollHeight` as `1000`, set `scrollTop` to `0`, rerender with one additional visible entry, await `nextTick`, and assert `scrollTop === 1000` with no unread button.

- [ ] **Step 2: Run the focused test and verify RED**

Run `pnpm exec vitest run tests/unit/app/battle-broadcast-window.spec.ts -t "automatically scrolls" --reporter=dot`.
Expected: scroll position remains `0`.

- [ ] **Step 3: Implement unconditional post-render scrolling**

Import `nextTick`. Watch `visibleEntries.value.length`; when it grows, await `nextTick()` and call `jumpToLatest()`.

- [ ] **Step 4: Add restore coverage**

Minimize, rerender with a new entry, restore, await `nextTick`, then assert the recreated log element is at its `scrollHeight`. Implement a post-restore `nextTick(jumpToLatest)` call.

- [ ] **Step 5: Run focused and full component tests**

Run `pnpm test tests/unit/app/battle-broadcast-window.spec.ts -- --reporter=dot`.
Expected: all component tests pass.

- [ ] **Step 6: Verify types and diff**

Run `pnpm exec vue-tsc --noEmit` and `git diff --check`.
Expected: both succeed.
