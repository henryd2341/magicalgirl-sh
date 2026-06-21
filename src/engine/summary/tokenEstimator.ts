import { getTokenizer } from "@/engine/summary/tokenizerRegistry";

const ASCII_WEIGHT = 0.25;
const CJK_WEIGHT = 1.5;
const OTHER_WEIGHT = 1.0;

function isCjkCodePoint(cp: number): boolean {
  return (
    (cp >= 0x4e00 && cp <= 0x9fff) ||
    (cp >= 0x3040 && cp <= 0x30ff) ||
    (cp >= 0xac00 && cp <= 0xd7af) ||
    (cp >= 0x3400 && cp <= 0x4dbf) ||
    (cp >= 0xf900 && cp <= 0xfaff) ||
    (cp >= 0x3000 && cp <= 0x303f)
  );
}

export function heuristicEstimateTokens(content: string): number {
  if (!content) {
    return 1;
  }

  const codePoints = Array.from(content);
  let weight = 0;
  for (const char of codePoints) {
    const cp = char.codePointAt(0);
    if (cp === undefined) {
      continue;
    }
    if (cp < 0x80) {
      weight += ASCII_WEIGHT;
    } else if (isCjkCodePoint(cp)) {
      weight += CJK_WEIGHT;
    } else {
      weight += OTHER_WEIGHT;
    }
  }

  return Math.max(1, Math.ceil(weight));
}

export function estimateTokens(
  content: string,
  tokenizerId?: string | null,
): number {
  if (tokenizerId) {
    const tokenizer = getTokenizer(tokenizerId);
    if (tokenizer) {
      try {
        const tokens = tokenizer.encode(content, true);
        return Math.max(1, tokens.length);
      } catch {
        // fall back to heuristic on encoding error
      }
    }
  }
  return heuristicEstimateTokens(content);
}
