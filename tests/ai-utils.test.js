// tests/ai-utils.test.js — ai-utils.js 純粋関数の直接テスト
// Phase D-1 で ai.js から分離した純粋関数をテスト。
// ai.test.js の再エクスポート経由ではなく、ai-utils.js を直接 import してテストする。

import {
  formatTranscriptWithTimestamps,
  linkTimestamps,
  buildMetaContext,
  createTimeoutPromise
} from "../src/domain/ai-utils.js";
import { YsTimeoutError } from "../src/infrastructure/errors.js";

// ===== formatTranscriptWithTimestamps =====
describe("ai-utils / formatTranscriptWithTimestamps", () => {
  test("空配列・null・undefinedは空文字を返す", () => {
    expect(formatTranscriptWithTimestamps([])).toBe("");
    expect(formatTranscriptWithTimestamps(null)).toBe("");
    expect(formatTranscriptWithTimestamps(undefined)).toBe("");
  });

  test("タイムスタンプ付きフォーマットに変換する", () => {
    const items = [
      { text: "Hello", offset: 1000, duration: 2000 },
      { text: "World", offset: 5000, duration: 1500 }
    ];
    expect(formatTranscriptWithTimestamps(items)).toBe("[00:01] Hello\n[00:05] World");
  });

  test("offsetがない場合はタイムスタンプなし", () => {
    const items = [{ text: "Hello" }, { text: "World" }];
    expect(formatTranscriptWithTimestamps(items)).toBe("Hello\nWorld");
  });

  test("ミリ秒を分:秒に正しく変換する", () => {
    const items = [
      { text: "Start", offset: 0 },
      { text: "One minute", offset: 60000 },
      { text: "Ten minutes", offset: 600000 }
    ];
    expect(formatTranscriptWithTimestamps(items)).toBe(
      "[00:00] Start\n[01:00] One minute\n[10:00] Ten minutes"
    );
  });

  test("文字列要素の場合はそのまま出力", () => {
    expect(formatTranscriptWithTimestamps(["foo", "bar"])).toBe("foo\nbar");
  });
});

// ===== buildMetaContext =====
describe("ai-utils / buildMetaContext", () => {
  test("null/undefinedの場合は空文字を返す", () => {
    expect(buildMetaContext(null)).toBe("");
    expect(buildMetaContext(undefined)).toBe("");
  });

  test("全項目が揃っている場合", () => {
    const meta = {
      title: "テスト動画",
      author: "テストチャンネル",
      shortDescription: "説明文",
      viewCount: "1000000",
      lengthSeconds: "3661",
      keywords: "tag1, tag2"
    };
    const result = buildMetaContext(meta);
    expect(result).toContain("テスト動画");
    expect(result).toContain("テストチャンネル");
    expect(result).toContain("説明文");
    expect(result).toContain("1,000,000");
    expect(result).toContain("61分1秒");
    expect(result).toContain("tag1, tag2");
  });

  test("説明文が200文字を超える場合はtruncateされる", () => {
    const meta = { title: "test", shortDescription: "あ".repeat(300) };
    const result = buildMetaContext(meta);
    expect(result).toContain("...");
    expect(result.length).toBeLessThan(600);
  });

  test("数値のviewCountをロケール形式に変換", () => {
    const result = buildMetaContext({ title: "t", viewCount: "5000000" });
    expect(result).toContain("5,000,000");
  });

  test("再生時間の秒数がない場合は分のみ表示", () => {
    const result = buildMetaContext({ title: "t", lengthSeconds: "120" });
    expect(result).toContain("2分");
  });
});

// ===== createTimeoutPromise =====
describe("ai-utils / createTimeoutPromise", () => {
  test("180秒後にYsTimeoutErrorでrejectする", async () => {
    jest.useFakeTimers();
    const promise = createTimeoutPromise();
    jest.advanceTimersByTime(180000);
    await expect(promise).rejects.toThrow(YsTimeoutError);
    jest.useRealTimers();
  }, 1000);
});

// ===== linkTimestamps =====
describe("ai-utils / linkTimestamps", () => {
  test("null/undefinedの場合は何もしない", () => {
    expect(() => linkTimestamps(null)).not.toThrow();
    expect(() => linkTimestamps(undefined)).not.toThrow();
  });

  test("[MM:SS]形式をアンカー要素に変換する", () => {
    document.body.innerHTML = '<div id="test">[01:30] テスト</div>';
    const el = document.getElementById("test");
    linkTimestamps(el);
    const anchor = el.querySelector("a.ys-timestamp-link");
    expect(anchor).not.toBeNull();
    expect(anchor.textContent).toBe("[01:30]");
    expect(anchor.getAttribute("data-seek")).toBe("90");
  });

  test("タイムスタンプがない場合は変換しない", () => {
    document.body.innerHTML = '<div id="test">タイムスタンプなし</div>';
    const el = document.getElementById("test");
    linkTimestamps(el);
    expect(el.querySelector("a")).toBeNull();
    expect(el.textContent).toBe("タイムスタンプなし");
  });

  test("複数のタイムスタンプを変換する", () => {
    document.body.innerHTML = '<div id="test">[00:10] A [02:00] B</div>';
    const el = document.getElementById("test");
    linkTimestamps(el);
    const anchors = el.querySelectorAll("a.ys-timestamp-link");
    expect(anchors.length).toBe(2);
    expect(anchors[0].getAttribute("data-seek")).toBe("10");
    expect(anchors[1].getAttribute("data-seek")).toBe("120");
  });
});