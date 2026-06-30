// tests/options-shared.test.js — オプション画面共通 DOM ユーティリティ
const helpers = require("./__helpers__/index.cjs");
helpers.installChromeMock();

const { getVal, setVal } = require("../src/options/options-shared");

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
});
