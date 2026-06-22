// tests/markdown.test.js — Markdown→HTML変換の単体テスト（ESM版）
import { sanitizeHTML, ALLOWED_TAGS } from "../src/domain/markdown.js";

describe("sanitizeHTML", () => {
  test("許可タグはそのまま残る", () => {
    const result = sanitizeHTML("<b>bold</b><i>italic</i>");
    expect(result instanceof DocumentFragment).toBe(true);
    expect(result.textContent).toBe("bolditalic");
    expect(result.querySelector("b")).toBeTruthy();
    expect(result.querySelector("i")).toBeTruthy();
  });

  test("許可されていないタグは除去される（子テキストは残らない）", () => {
    const result = sanitizeHTML("<script>alert(1)</script><p>safe</p>");
    expect(result.querySelector("script")).toBeNull();
    expect(result.textContent).toBe("safe");
    expect(result.querySelector("p")).toBeTruthy();
  });

  test("許可タグの許可属性は維持され、危険属性は除去される", () => {
    const result = sanitizeHTML('<a href="https://safe.com" onclick="evil()">link</a>');
    const a = result.querySelector("a");
    expect(a).toBeTruthy();
    expect(a.getAttribute("href")).toBe("https://safe.com");
    expect(a.getAttribute("onclick")).toBeNull();
  });

  test("空文字列は空のフラグメントを返す", () => {
    const result = sanitizeHTML("");
    expect(result instanceof DocumentFragment).toBe(true);
    expect(result.childNodes.length).toBe(0);
  });

  test("インジェクション試行を含むHTMLを安全に処理", () => {
    const html = '<img src=x onerror=alert(1)><b onmouseover=alert(1)>hello</b>';
    const result = sanitizeHTML(html);
    const img = result.querySelector("img");
    if (img) {
      expect(img.getAttribute("src")).toBe("x");
      expect(img.getAttribute("onerror")).toBeNull();
    }
    const b = result.querySelector("b");
    expect(b).toBeTruthy();
    expect(b.getAttribute("onmouseover")).toBeNull();
    expect(result.textContent).toContain("hello");
  });
});

describe("ALLOWED_TAGS", () => {
  test("許可タグリストに重要なタグが含まれている", () => {
    expect(ALLOWED_TAGS).toContain("b");
    expect(ALLOWED_TAGS).toContain("a");
    expect(ALLOWED_TAGS).toContain("pre");
    expect(ALLOWED_TAGS).toContain("code");
    expect(ALLOWED_TAGS).toContain("table");
  });

  test("許可タグリストに危険なタグは含まれていない", () => {
    expect(ALLOWED_TAGS).not.toContain("script");
    expect(ALLOWED_TAGS).not.toContain("iframe");
    expect(ALLOWED_TAGS).not.toContain("object");
    expect(ALLOWED_TAGS).not.toContain("embed");
  });
});