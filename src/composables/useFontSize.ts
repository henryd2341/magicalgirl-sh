import { ref } from "vue";

const STORAGE_KEY = "mg-font-size";
const DEFAULT_SIZE = 16;
const MIN_SIZE = 12;
const MAX_SIZE = 24;

function readInitialSize(): number {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored !== null) {
      const parsed = parseInt(stored, 10);
      if (!isNaN(parsed) && parsed >= MIN_SIZE && parsed <= MAX_SIZE) {
        return parsed;
      }
    }
  } catch {
    // localStorage not available
  }
  return DEFAULT_SIZE;
}

function applyToDocument(size: number): void {
  document.documentElement.style.setProperty(
    "--mg-font-size-base",
    `${size}px`,
  );
}

export const fontSize = ref<number>(readInitialSize());

// Apply initial value on module load
applyToDocument(fontSize.value);

export function applyFontSize(size: number): void {
  const clamped = Math.max(MIN_SIZE, Math.min(MAX_SIZE, Math.round(size)));
  fontSize.value = clamped;
  applyToDocument(clamped);
  try {
    localStorage.setItem(STORAGE_KEY, String(clamped));
  } catch {
    // localStorage not available
  }
}

export function reset(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // localStorage not available
  }
  fontSize.value = DEFAULT_SIZE;
  applyToDocument(DEFAULT_SIZE);
}
