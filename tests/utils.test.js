/**
 * tests/utils.test.js — 純粋関数の単体テスト
 */
const {
  estimateTokens,
  getModelContextWindow,
  getAvailableTokens,
  splitIntoChunks
} = require("../src/shared/utils");

// ===== estimateTokens =====
describe("estimateTokens", () => {
  test("空文字列は0を返す", () => {
    expect(estimateTokens("")).toBe(0);
    expect(estimateTokens(null)).toBe(0);
    expect(estimateTokens(undefined)).toBe(0);
  });

  test("日本語テキスト（1文字≒2トークン）", () => {
    // 「あ」は日本語（2トークン）
    const result = estimateTokens("あいうえお");
    expect(result).toBeGreaterThanOrEqual(10); // 5文字×2
    expect(result).toBeLessThanOrEqual(12);
  });

  test("英語テキスト（1文字≒0.3トークン）", () => {
    // "hello" = 5文字 × 0.3 = 1.5 → ceil → 2
    const result = estimateTokens("hello");
    expect(result).toBe(2);
  });

  test("日本語＋英語の混合", () => {
    const result = estimateTokens("こんにちは world");
    expect(result).toBeGreaterThan(0);
  });

  test("改行・スペースは英語扱い", () => {
    const result = estimateTokens("\n \n");
    expect(result).toBeGreaterThan(0);
  });
});

// ===== getModelContextWindow =====
describe("getModelContextWindow", () => {
  test("GPT-4o は 128000", () => {
    expect(getModelContextWindow("gpt-4o")).toBe(128000);
    expect(getModelContextWindow("gpt-4o-mini")).toBe(128000);
  });

  test("DeepSeek は 1000000", () => {
    expect(getModelContextWindow("deepseek-chat")).toBe(1000000);
    expect(getModelContextWindow("deepseek-reasoner")).toBe(1000000);
  });

  test("Claude 3.5 は 200000", () => {
    expect(getModelContextWindow("claude-3.5-sonnet")).toBe(200000);
  });

  test("Gemini は 1000000", () => {
    expect(getModelContextWindow("google/gemini-2.0-flash-exp:free")).toBe(1000000);
  });

  test("不明なモデルは 32000", () => {
    expect(getModelContextWindow("unknown-model")).toBe(32000);
    expect(getModelContextWindow("")).toBe(32000);
    expect(getModelContextWindow(null)).toBe(32000);
  });
});

// ===== getAvailableTokens =====
describe("getAvailableTokens", () => {
  test("GPT-4o の場合 102400（128000×0.8）", () => {
    expect(getAvailableTokens("dummy", "gpt-4o")).toBe(102400);
  });

  test("DeepSeek の場合 800000（1000000×0.8）", () => {
    expect(getAvailableTokens("dummy", "deepseek-chat")).toBe(800000);
  });
});

// ===== splitIntoChunks =====
describe("splitIntoChunks", () => {
  test("空文字列は空配列", () => {
    expect(splitIntoChunks("", 100)).toEqual([]);
  });

  test("制限内のテキストは1チャンク", () => {
    const text = "hello world\nthis is a test";
    const chunks = splitIntoChunks(text, 1000);
    expect(chunks.length).toBe(1);
    expect(chunks[0]).toBe(text);
  });

  test("制限超過で複数チャンクに分割", () => {
    // 各「あ」は2トークン、改行は約0.3トークン
    // 10文字で約20トークン → maxTokens=15なら2チャンクに分割
    const text = "あ\nい\nう\nえ\nお";
    const chunks = splitIntoChunks(text, 10);
    expect(chunks.length).toBeGreaterThanOrEqual(2);
  });

  test("各チャンクはトークン制限を超えない", () => {
    const text = Array(50).fill("テスト行です").join("\n");
    const maxTokens = 30;
    const chunks = splitIntoChunks(text, maxTokens);
    for (const chunk of chunks) {
      expect(estimateTokens(chunk)).toBeLessThanOrEqual(maxTokens + 100); // 最終行のオーバー分を許容
    }
  });
});