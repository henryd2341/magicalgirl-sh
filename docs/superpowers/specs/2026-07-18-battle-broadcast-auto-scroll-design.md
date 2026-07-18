# Battle Broadcast Auto-Scroll Design

## Goal

Whenever a newly visible battle broadcast record is rendered, move the expanded broadcast log to its latest position even if the player previously scrolled upward.

## Behavior

- Watch `visibleEntries.length`, so density filtering and the rendered list stay aligned.
- After the list changes, wait for Vue's next DOM update and set the log element's `scrollTop` to its `scrollHeight`.
- Auto-scroll is unconditional while the expanded log element exists.
- Scrolling to the latest record sets `isAtLatest` to `true` and clears `unreadCount`.
- While minimized, no DOM scroll is attempted. Restoring the window places the expanded log at the latest record.
- Existing drag, resize, density, accessibility announcement, and manual “jump to latest” behavior remain unchanged.

## Implementation Boundary

- Modify `src/ui/battle/BattleBroadcastWindow.vue` only for runtime behavior.
- Update `tests/unit/app/battle-broadcast-window.spec.ts` with DOM-update tests.
- No preference schema or battle-log data changes.

## Testing

- A new visible entry forces `scrollTop` to `scrollHeight` after `nextTick`, even when the log was positioned above the bottom.
- Restoring after records arrived while minimized positions the expanded log at the bottom.
- Existing window interaction tests remain green.
