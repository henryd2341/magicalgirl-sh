import { describe, it, expect } from "vitest";
import { estimateTokens, heuristicEstimateTokens } from "@/engine/summary/tokenEstimator";

describe("estimateTokens", () => {
  it("returns at least 1 for empty string", () => {
    expect(estimateTokens("")).toBe(1);
  });

  it("returns ceil(length/4) for pure ASCII (AC2)", () => {
    expect(estimateTokens("hello world")).toBe(3);
  });

  it("returns ceil(length/4) for pure ASCII with exact multiple of 4", () => {
    expect(estimateTokens("abcd")).toBe(1);
    expect(estimateTokens("abcdefgh")).toBe(2);
  });

  it("weights CJK characters at ~1.5 tokens each (AC1)", () => {
    const cjk = "中文测试";
    const result = estimateTokens(cjk);
    expect(result).toBeGreaterThanOrEqual(4);
    expect(result).toBeLessThanOrEqual(8);
  });

  it("weights hiragana/katakana at ~1.5 tokens each", () => {
    const kana = "ひらがな";
    const result = estimateTokens(kana);
    expect(result).toBeGreaterThanOrEqual(4);
    expect(result).toBeLessThanOrEqual(8);
  });

  it("weights hangul at ~1.5 tokens each", () => {
    const hangul = "한글";
    const result = estimateTokens(hangul);
    expect(result).toBeGreaterThanOrEqual(2);
    expect(result).toBeLessThanOrEqual(4);
  });

  it("weights extended Latin / other BMP at ~1.0 token each", () => {
    const extended = "café";
    const result = estimateTokens(extended);
    expect(result).toBeGreaterThanOrEqual(2);
    expect(result).toBeLessThanOrEqual(5);
  });

  it("handles mixed CJK + ASCII correctly", () => {
    const mixed = "Hello 世界 world";
    const result = estimateTokens(mixed);
    expect(result).toBeGreaterThanOrEqual(6);
    expect(result).toBeLessThanOrEqual(14);
  });

  it("handles surrogate pairs (emoji) as single code points", () => {
    const withEmoji = "test 🎉 emoji";
    const result = estimateTokens(withEmoji);
    expect(result).toBeGreaterThan(0);
  });

  it("CJK weight is strictly greater than ASCII weight for same-length string", () => {
    const ascii = "abcd";
    const cjk = "中文测试";
    expect(estimateTokens(cjk)).toBeGreaterThan(estimateTokens(ascii));
  });

  it("falls back to heuristic when tokenizerId is null or undefined", () => {
    expect(estimateTokens("hello", null)).toBe(heuristicEstimateTokens("hello"));
    expect(estimateTokens("hello", undefined)).toBe(heuristicEstimateTokens("hello"));
    expect(estimateTokens("hello")).toBe(heuristicEstimateTokens("hello"));
  });

  it("falls back to heuristic when tokenizerId is not loaded", () => {
    expect(estimateTokens("hello", "nonexistent-tokenizer")).toBe(
      heuristicEstimateTokens("hello"),
    );
  });
});

describe("heuristicEstimateTokens", () => {
  it("produces same results as estimateTokens without tokenizerId", () => {
    expect(heuristicEstimateTokens("hello world")).toBe(estimateTokens("hello world"));
    expect(heuristicEstimateTokens("中文测试")).toBe(estimateTokens("中文测试"));
  });
});
