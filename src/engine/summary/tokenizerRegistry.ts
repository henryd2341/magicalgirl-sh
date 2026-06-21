import { Kitoken } from "kitoken";

const cache = new Map<string, Kitoken>();
const loadingPromises = new Map<string, Promise<void>>();

export const AVAILABLE_TOKENIZERS = [
  { id: "deepseek", label: "DeepSeek" },
] as const;

export async function loadTokenizer(tokenizerId: string): Promise<void> {
  if (cache.has(tokenizerId)) {
    return;
  }

  const existing = loadingPromises.get(tokenizerId);
  if (existing) {
    return existing;
  }

  const promise = (async () => {
    const response = await fetch(`/tokenizers/${tokenizerId}.json`);
    if (!response.ok) {
      throw new Error(
        `[TOKENIZER_LOAD_FAILED] Failed to load tokenizer "${tokenizerId}": ${response.status} ${response.statusText}`,
      );
    }
    const buffer = await response.arrayBuffer();
    const data = new Uint8Array(buffer);
    const tokenizer = Kitoken.from_tokenizers(data);
    cache.set(tokenizerId, tokenizer);
  })();

  loadingPromises.set(tokenizerId, promise);
  try {
    await promise;
  } finally {
    loadingPromises.delete(tokenizerId);
  }
}

export function getTokenizer(tokenizerId: string): Kitoken | null {
  return cache.get(tokenizerId) ?? null;
}

export function isTokenizerLoaded(tokenizerId: string): boolean {
  return cache.has(tokenizerId);
}

export function unloadTokenizer(tokenizerId: string): void {
  const tokenizer = cache.get(tokenizerId);
  if (tokenizer) {
    tokenizer.free();
    cache.delete(tokenizerId);
  }
}

export function unloadAllTokenizers(): void {
  for (const tokenizer of cache.values()) {
    tokenizer.free();
  }
  cache.clear();
}
