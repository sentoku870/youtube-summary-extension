// tests/timestamp-link.test.js — src/content/ui/timestamp-link.js の単体テスト
// Phase 2-A: linkTimestamps を domain/ai-utils.js から src/content/ui/timestamp-link.js
// へ移動したため、テストも追従して新規ファイルとする。

const { linkTimestamps } = require("../src/content/ui/timestamp-link.js");

describe("linkTimestamps", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  test("null/undefined の場合は何もしない", () => {
    expect(() => linkTimestamps(null)).not.toThrow();
    expect(() => linkTimestamps(undefined)).not.toThrow();
  });

  test("[MM:SS] 形式をアンカー要素に変換する", () => {
    const el = document.createElement("div");
    el.textContent = "[01:30] テスト";
    document.body.appendChild(el);
    linkTimestamps(el);
    const anchor = el.querySelector("a.ys-timestamp-link");
    expect(anchor).not.toBeNull();
    expect(anchor.textContent).toBe("[01:30]");
    expect(anchor.getAttribute("data-seek")).toBe("90");
  });

  test("タイムスタンプがない場合は変換しない", () => {
    const el = document.createElement("div");
    el.textContent = "タイムスタンプなし";
    document.body.appendChild(el);
    linkTimestamps(el);
    expect(el.querySelector("a")).toBeNull();
    expect(el.textContent).toBe("タイムスタンプなし");
  });

  test("複数のタイムスタンプを変換する", () => {
    const el = document.createElement("div");
    el.textContent = "[00:10] A [02:00] B";
    document.body.appendChild(el);
    linkTimestamps(el);
    const anchors = el.querySelectorAll("a.ys-timestamp-link");
    expect(anchors.length).toBe(2);
    expect(anchors[0].getAttribute("data-seek")).toBe("10");
    expect(anchors[1].getAttribute("data-seek")).toBe("120");
  });

  test("委譲リスナーは 1 度だけ登録される（重複登録防止フラグ）", () => {
    const el = document.createElement("div");
    el.textContent = "[00:00] test";
    document.body.appendChild(el);
    const addSpy = jest.spyOn(el, "addEventListener");
    linkTimestamps(el);
    linkTimestamps(el);
    // 1 回目のみ委譲リスナーが追加される（2 回目は dataset フラグでスキップ）
    const clickCalls = addSpy.mock.calls.filter(function (c) {
      return c[0] === "click";
    });
    expect(clickCalls.length).toBe(1);
    addSpy.mockRestore();
  });
});
