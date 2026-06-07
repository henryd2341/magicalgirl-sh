import { watch, ref } from "vue";
import { useSessionStore } from "@/stores/sessionStore";
import { storeToRefs } from "pinia";

// ─── Module-level singleton ────────────────────────────────────────────────────

const MAX_HISTORY = 50;

const stateTransitionHistory = ref<Array<{
  from: string;
  to: string;
  timestamp: number;
}>>([]);

// ─── Watch for sessionState transitions ────────────────────────────────────────

let watchInitialized = false;

function ensureWatch(): void {
  if (watchInitialized) return;
  watchInitialized = true;

  const store = useSessionStore();
  const { snapshot } = storeToRefs(store);

  watch(
    () => snapshot.value?.sessionState,
    (newState, oldState) => {
      if (oldState && newState && oldState !== newState) {
        stateTransitionHistory.value.push({
          from: oldState,
          to: newState,
          timestamp: Date.now(),
        });
        if (stateTransitionHistory.value.length > MAX_HISTORY) {
          stateTransitionHistory.value.shift();
        }
      }
    },
  );
}

// ─── Exports ───────────────────────────────────────────────────────────────────

export function startTracking(): void {
  ensureWatch();
}

export function resetHistory(): void {
  stateTransitionHistory.value = [];
}

export { stateTransitionHistory };
