# Battle Broadcast Minimized Drag Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the minimized BattleBroadcastWindow icon draggable while preserving click-to-restore behavior.

**Architecture:** Reuse the component's pointer-capture drag state and persisted `x/y` preferences. Add a 5px activation threshold only for the minimized icon and suppress the restore click produced at the end of an actual drag.

**Tech Stack:** Vue 3 Composition API, TypeScript, Testing Library Vue, Vitest.

---

### Task 1: Minimized icon pointer interaction

**Files:**
- Modify: `src/ui/battle/BattleBroadcastWindow.vue`
- Test: `tests/unit/app/battle-broadcast-window.spec.ts`

- [ ] **Step 1: Write the failing test**

Add a component test that minimizes the window, drags the minimized button beyond 5px, verifies persisted `left/top`, verifies it remains minimized after the drag click, then performs a stationary click and verifies restoration.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test tests/unit/app/battle-broadcast-window.spec.ts -t "drags the minimized icon" -- --reporter=dot`
Expected: FAIL because the minimized button has no pointer drag handlers.

- [ ] **Step 3: Write minimal implementation**

Add minimized-drag state, start/move/click handlers, bind pointerdown to the minimized button, and retain the existing persisted viewport clamping.

- [ ] **Step 4: Run tests and build**

Run: `pnpm test tests/unit/app/battle-broadcast-window.spec.ts -- --reporter=dot`
Expected: all component tests pass.

Run: `pnpm build`
Expected: TypeScript and Vite build pass.
