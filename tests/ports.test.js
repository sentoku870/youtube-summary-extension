// tests/ports.test.js — Port/Adapter パターンの挙動テスト
// ドメイン層が依存する UI 表示 IF (no-op アダプタ + setUiAdapter) を検証。
//
// 注意: ports.js はモジュール内で `adapter` 変数を保持するため、
//       グローバル状態のリセットには `jest.resetModules()` を使う。
const path = require("path");

function freshPortsModule() {
  jest.resetModules();
  return require(path.resolve(__dirname, "../src/domain/ports.js"));
}

describe("ports (Port/Adapter パターン)", () => {
  describe("デフォルト no-op アダプタ", () => {
    let getUiAdapter;
    beforeEach(() => {
      ({ getUiAdapter } = freshPortsModule());
    });

    test("getUiAdapter は呼び出し可能なオブジェクトを返す", () => {
      const a = getUiAdapter();
      expect(a).toBeDefined();
      expect(typeof a).toBe("object");
    });

    test("no-op アダプタは showError を呼んでも例外を投げない（console.error のみ）", () => {
      const a = getUiAdapter();
      // showError はデフォルトで console.error を呼ぶ
      const errSpy = jest.spyOn(console, "error").mockImplementation(() => {});
      expect(() => a.showError("x")).not.toThrow();
      // [YouTube 要約] プレフィックス付きでログ出力
      expect(errSpy).toHaveBeenCalledWith("[YouTube 要約] ports noop adapter:", "x");
      errSpy.mockRestore();
    });

    test("no-op アダプタ: hideError / hideProgress / showProgress などは副作用なし", () => {
      const a = getUiAdapter();
      [
        "hideError",
        "hideProgress",
        "showProgress",
        "setSummaryContent",
        "clearSummaryContent",
        "updateInfoLabel",
        "showChatArea",
        "focusChatInput",
        "showCopyButton",
        "showRegenButton",
        "updateTabUI"
      ].forEach(function (m) {
        expect(typeof a[m]).toBe("function");
        expect(() => a[m]("anything", 1, { x: 1 })).not.toThrow();
      });
    });

    test("no-op アダプタ: getSummaryTextEl は null を返す", () => {
      const a = getUiAdapter();
      expect(a.getSummaryTextEl()).toBeNull();
    });
  });

  describe("setUiAdapter", () => {
    test("注入した実装が getUiAdapter で取得できる", () => {
      const { setUiAdapter, getUiAdapter } = freshPortsModule();
      const impl = {
        showError: jest.fn(),
        hideError: jest.fn(),
        hideProgress: jest.fn(),
        showProgress: jest.fn(),
        setSummaryContent: jest.fn(),
        clearSummaryContent: jest.fn(),
        updateInfoLabel: jest.fn(),
        showChatArea: jest.fn(),
        focusChatInput: jest.fn(),
        showCopyButton: jest.fn(),
        showRegenButton: jest.fn(),
        getSummaryTextEl: jest.fn(() => ({ id: "el" })),
        updateTabUI: jest.fn()
      };
      setUiAdapter(impl);
      const a = getUiAdapter();
      expect(a.showError).toBe(impl.showError);
      expect(a.hideError).toBe(impl.hideError);
      expect(a.getSummaryTextEl()).toEqual({ id: "el" });
    });

    test("部分注入: showError だけ渡した場合、他メソッドは no-op のまま", () => {
      const { setUiAdapter, getUiAdapter } = freshPortsModule();
      const showError = jest.fn();
      setUiAdapter({ showError: showError });
      const a = getUiAdapter();
      a.showError("only-this");
      expect(showError).toHaveBeenCalledWith("only-this");
      // 他のメソッドは no-op のまま
      expect(() => a.hideError()).not.toThrow();
      expect(() => a.setSummaryContent("x")).not.toThrow();
      expect(a.getSummaryTextEl()).toBeNull();
    });

    test("setUiAdapter を 2 回呼ぶと、後勝ちで完全に置き換わる", () => {
      const { setUiAdapter, getUiAdapter } = freshPortsModule();
      const a1 = { showError: jest.fn() };
      const a2 = { showError: jest.fn() };
      setUiAdapter(a1);
      setUiAdapter(a2);
      expect(getUiAdapter().showError).toBe(a2.showError);
    });

    test("getSummaryTextEl を含む全メソッドが no-op に存在", () => {
      const { getUiAdapter } = freshPortsModule();
      const a = getUiAdapter();
      const expected = [
        "showError",
        "hideError",
        "hideProgress",
        "showProgress",
        "setSummaryContent",
        "clearSummaryContent",
        "updateInfoLabel",
        "showChatArea",
        "focusChatInput",
        "showCopyButton",
        "showRegenButton",
        "getSummaryTextEl",
        "updateTabUI"
      ];
      for (const key of expected) {
        expect(typeof a[key]).toBe("function");
      }
    });
  });
});
