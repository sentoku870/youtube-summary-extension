// tests/options-shared.test.js — オプション画面共通 DOM ユーティリティ
const helpers = require("./__helpers__/index.cjs");
helpers.installChromeMock();

const { getVal, setVal, el } = require("../src/options/options-shared");

describe("options-shared", () => {
  beforeEach(() => {
    helpers.clearBody();
  });

  describe("getVal", () => {
    test("存在する要素の値を返す", () => {
      const input = document.createElement("input");
      input.id = "test-input";
      input.value = "hello";
      document.body.appendChild(input);
      expect(getVal("test-input")).toBe("hello");
    });

    test("存在しない要素の場合は空文字を返す", () => {
      expect(getVal("nonexistent")).toBe("");
    });

    test("value 属性がない要素でも空文字を返す", () => {
      const input = document.createElement("input");
      input.id = "empty";
      document.body.appendChild(input);
      expect(getVal("empty")).toBe("");
    });

    test("textarea 要素でも動作する", () => {
      const ta = document.createElement("textarea");
      ta.id = "ta";
      ta.value = "multi\nline\ntext";
      document.body.appendChild(ta);
      expect(getVal("ta")).toBe("multi\nline\ntext");
    });
  });

  describe("setVal", () => {
    test("値を設定する", () => {
      const input = document.createElement("input");
      input.id = "test-input";
      document.body.appendChild(input);
      setVal("test-input", "world");
      expect(input.value).toBe("world");
    });

    test("存在しない要素でもクラッシュしない", () => {
      expect(() => setVal("nonexistent", "x")).not.toThrow();
    });

    test("null を設定すると空文字になる", () => {
      const input = document.createElement("input");
      input.id = "test-input";
      input.value = "old";
      document.body.appendChild(input);
      setVal("test-input", null);
      expect(input.value).toBe("");
    });

    test("undefined を設定すると空文字になる", () => {
      const input = document.createElement("input");
      input.id = "test-input";
      input.value = "old";
      document.body.appendChild(input);
      setVal("test-input", undefined);
      expect(input.value).toBe("");
    });
  });

  describe("el — DOM 生成ヘルパ", () => {
    test("tag / className / text から要素を生成", () => {
      const e = el("div", "my-class", "hello");
      expect(e.tagName).toBe("DIV");
      expect(e.className).toBe("my-class");
      expect(e.textContent).toBe("hello");
    });

    test("className / text が null でも例外を投げない", () => {
      const e = el("span");
      expect(e.tagName).toBe("SPAN");
      expect(e.className).toBe("");
      expect(e.textContent).toBe("");
    });

    test("XSS 安全性: <script> 等のタグは textContent として扱う（実行されない）", () => {
      const e = el("p", null, "<script>alert('xss')</script>");
      // textContent は HTML として解釈されず、生の文字列として格納される
      expect(e.textContent).toBe("<script>alert('xss')</script>");
      expect(e.innerHTML).not.toContain("<script>");
      // 実際に <script> 子要素として解釈されないことを確認
      expect(e.querySelector("script")).toBeNull();
      expect(e.children.length).toBe(0);
    });

    test("XSS 安全性: クォートや属性インジェクションも無効化", () => {
      const e = el("a", null, '"><img src=x onerror=alert(1)>');
      expect(e.textContent).toBe('"><img src=x onerror=alert(1)>');
      expect(e.querySelector("img")).toBeNull();
    });
  });
});
