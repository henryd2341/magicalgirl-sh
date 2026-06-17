import { ref, computed } from "vue";

// ─── Types ──────────────────────────────────────────────────────────────────────

export interface MetadataSnapshot {
  index: number;
  capturedAt: string;
  fields: Record<string, unknown>;
}

// ─── Module-level singleton ─────────────────────────────────────────────────────

const MAX_HISTORY = 50;

const snapshots = ref<MetadataSnapshot[]>([]);

let nextIndex = 1;

// ─── Composable ──────────────────────────────────────────────────────────────────

export function useProviderMetadataHistory() {
  function record(metadata: Record<string, unknown> | undefined): void {
    if (!metadata || Object.keys(metadata).length === 0) return;

    snapshots.value.push({
      index: nextIndex++,
      capturedAt: new Date().toISOString(),
      fields: { ...metadata },
    });

    if (snapshots.value.length > MAX_HISTORY) {
      snapshots.value.shift();
    }
  }

  function clear(): void {
    snapshots.value = [];
    nextIndex = 1;
  }

  const summary = computed<Record<string, unknown>>(() => {
    const result: Record<string, unknown> = {};
    for (const snapshot of snapshots.value) {
      for (const [key, value] of Object.entries(snapshot.fields)) {
        if (typeof value === "number") {
          result[key] = ((result[key] as number) ?? 0) + value;
        } else if (typeof value === "string" && !isNaN(Number(value))) {
          result[key] = ((result[key] as number) ?? 0) + Number(value);
        } else {
          if (!(key in result)) {
            result[key] = value;
          }
        }
      }
    }
    return result;
  });

  return {
    snapshots,
    summary,
    record,
    clear,
  };
}
