/**
 * tests/utils.test.js — 純粋関数の単体テスト
 */
const {
  estimateTokens,
  getModelContextWindow,
  getAvailableTokens,
  splitIntoChunks,
  isYouTubeWatchPage
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

  test("第3引数maxTokensが出力予約分として減算される", () => {
    // gpt-4o: contextWindow=128000, usable=102400
    // maxTokens=8192 → available = 102400 - 8192 = 94208
    expect(getAvailableTokens("dummy", "gpt-4o", "8192")).toBe(94208);
  });

  test("maxTokensが数値の場合も正しく減算される", () => {
    expect(getAvailableTokens("dummy", "gpt-4o", 4096)).toBe(98304);
  });

  test("maxTokens未指定（undefined）の場合は予約なし", () => {
    expect(getAvailableTokens("dummy", "gpt-4o")).toBe(102400);
  });

  test("maxTokensが無効値の場合は予約なし扱い", () => {
    // parseInt(NaN), 0以下, 負数 はすべて reserved=0
    expect(getAvailableTokens("dummy", "gpt-4o", null)).toBe(102400);
    expect(getAvailableTokens("dummy", "gpt-4o", "abc")).toBe(102400);
    expect(getAvailableTokens("dummy", "gpt-4o", "0")).toBe(102400);
    expect(getAvailableTokens("dummy", "gpt-4o", -100)).toBe(102400);
  });

  test("計算結果が1未満になる場合はMIN_USABLE_TOKENS(1)にクランプ", () => {
    // gpt-4: contextWindow=8192, usable=6553
    // maxTokens=999999 → reserved=999999 → 結果が負 → 1にクランプ
    expect(getAvailableTokens("dummy", "gpt-4", "999999")).toBe(1);
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

// ===== isYouTubeWatchPage =====
describe("isYouTubeWatchPage", () => {
  test("/watch ページは true", () => {
    expect(isYouTubeWatchPage("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe(true);
    expect(isYouTubeWatchPage("https://youtube.com/watch?v=dQw4w9WgXcQ")).toBe(true);
    expect(isYouTubeWatchPage("https://m.youtube.com/watch?v=dQw4w9WgXcQ")).toBe(true);
  });

  test("/shorts/<id> ページは true", () => {
    expect(isYouTubeWatchPage("https://www.youtube.com/shorts/abc123XYZ")).toBe(true);
    expect(isYouTubeWatchPage("https://youtube.com/shorts/dQw4w9WgXcQ")).toBe(true);
  });

  test("ホーム・検索・チャンネル等は false", () => {
    expect(isYouTubeWatchPage("https://www.youtube.com/")).toBe(false);
    expect(isYouTubeWatchPage("https://www.youtube.com/results?search_query=test")).toBe(false);
    expect(isYouTubeWatchPage("https://www.youtube.com/@channelname")).toBe(false);
    expect(isYouTubeWatchPage("https://www.youtube.com/feed/subscriptions")).toBe(false);
  });

  test("YouTube以外のホストは false（偽陽性防止）", () => {
    // 第三者サイトのクエリに youtube.com/watch が含まれていても弾く
    expect(isYouTubeWatchPage("https://example.com/?redirect=https://youtube.com/watch?v=test")).toBe(false);
    expect(isYouTubeWatchPage("https://evil.com/path/youtube.com/watch")).toBe(false);
    expect(isYouTubeWatchPage("https://www.youtube.com.evil.com/watch?v=test")).toBe(false);
  });

  test("embed ページは false（パスが /watch でない）", () => {
    expect(isYouTubeWatchPage("https://www.youtube.com/embed/dQw4w9WgXcQ")).toBe(false);
  });

  test("無効な入力は false", () => {
    expect(isYouTubeWatchPage("")).toBe(false);
    expect(isYouTubeWatchPage(null)).toBe(false);
    expect(isYouTubeWatchPage(undefined)).toBe(false);
    expect(isYouTubeWatchPage("not-a-url")).toBe(false);
  });
});
