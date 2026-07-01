// tests/panel.test.js — パネルDOM生成・ボタン制御のテスト
const { uiState: S } = require("../src/shared/state");

// appearance.js をモック（副作用を回避）
jest.mock("../src/content/ui/appearance.js", () => ({
  applyTheme: jest.fn(),
  applyFontSize: jest.fn(),
  applyPanelHeight: jest.fn()
}));

const {
  getEl,
  enableAllButtons,
  createPanel
} = require("../src/content/ui/panel");

describe("panel", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    // state をリセット
    S.panelEl = null;
    S.tabIds = ["summary", "customA", "customB"];
    S.tabs = {};
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // ===== getEl =====
  describe("getEl", () => {
    test("panelEl未設定時はnullを返す（nullセーフ）", () => {
      S.panelEl = null;
      expect(getEl("#anything")).toBeNull();
    });

    test("panelEl設定時はquerySelectorの結果を返す", () => {
      const panel = document.createElement("div");
      const btn = document.createElement("button");
      btn.id = "ys-btn-summary";
      panel.appendChild(btn);
      S.panelEl = panel;

      const result = getEl("#ys-btn-summary");
      expect(result).toBe(btn);
    });

    test("存在しないセレクタはnullを返す", () => {
      const panel = document.createElement("div");
      S.panelEl = panel;
      expect(getEl("#nonexistent")).toBeNull();
    });
  });

  // ===== enableAllButtons =====
  describe("enableAllButtons", () => {
    test("ys-tab-row内のボタンをすべて有効化", () => {
      const panel = document.createElement("div");
      const tabRow = document.createElement("div");
      tabRow.className = "ys-tab-row";
      const btn1 = document.createElement("button");
      btn1.disabled = true;
      tabRow.appendChild(btn1);
      panel.appendChild(tabRow);
      S.panelEl = panel;

      enableAllButtons();

      expect(btn1.disabled).toBe(false);
    });
  });

  // ===== createPanel =====
  describe("createPanel", () => {
    test("パネル要素を生成してstateに設定する", () => {
      const panel = createPanel();

      expect(panel).toBeTruthy();
      expect(S.panelEl).toBe(panel);
      expect(panel.id).toBe("yt-summary-root");
    });

    test("2回目の呼び出しでは既存パネルを返す（キャッシュ）", () => {
      const first = createPanel();
      const second = createPanel();

      expect(second).toBe(first);
    });

    test("タブIDと初期タブ状態が設定される", () => {
      createPanel();

      expect(S.tabIds).toEqual(["summary", "customA", "customB"]);
      expect(S.tabs.summary).toBeDefined();
      expect(S.tabs.customA).toBeDefined();
      expect(S.tabs.customB).toBeDefined();
      expect(S.tabs.summary.generated).toBe(false);
      expect(S.tabs.summary.content).toBe("");
      expect(S.tabs.summary.chatHistory).toEqual([]);
    });

    test("全固定IDがgetElで取得可能（契約テスト）", () => {
      createPanel();

      const expectedIds = [
        "#ys-btn-summary",
        "#ys-btn-customA",
        "#ys-btn-customB",
        "#ys-panel",
        "#ys-error",
        "#ys-content-area",
        "#ys-summaryText",
        "#ys-progress",
        "#ys-infoRow",
        "#ys-infoLabel",
        "#ys-copyBtn",
        "#ys-regenBtn",
        "#ys-chatHistory",
        "#ys-chatArea",
        "#ys-chatInput"
      ];

      expectedIds.forEach(function (id) {
        const el = getEl(id);
        expect(el).not.toBeNull();
      });
    });

    test("タブボタンの初期ラベルが正しい", () => {
      createPanel();

      // placePanel のコールバックで applyTheme 等が呼ばれるが fakeTimers で抑制
      const btnSummary = getEl("#ys-btn-summary");
      expect(btnSummary.textContent).toContain("字幕取得中");
    });

    test("生成直後は全タブボタンが押せる（字幕取得中も block しない）", () => {
      createPanel();

      const btnSummary = getEl("#ys-btn-summary");
      const btnCustomA = getEl("#ys-btn-customA");
      const btnCustomB = getEl("#ys-btn-customB");

      // ★ 旧実装: 生成直後に全ボタンを disabled にしていたため、
      //   TRANSCRIPT_READY/FAILED が遅延・失敗すると永久に押せず
      //   A→B 切替もできない症状があった。
      //   新実装: 字幕プリロード中でもボタンは押せる。AI 実行時に
      //   callAI() 内部で transcript を改めて取得する。
      expect(btnSummary.disabled).toBe(false);
      expect(btnCustomA.disabled).toBe(false);
      expect(btnCustomB.disabled).toBe(false);
    });

    // ===== T3-S1: スタイル適用が placePanel 完了前に走る =====
    describe("T3-S1: スタイル即時適用", () => {
      const {
        applyTheme,
        applyFontSize,
        applyPanelHeight
      } = require("../src/content/ui/appearance");

      test("createPanel 呼び出し時点で applyTheme/Font/PanelHeight が同期的に発火する", () => {
        // createPanel は placePanel の解決を待たず、appearance 関数を即座に呼ぶ
        createPanel();

        expect(applyTheme).toHaveBeenCalledTimes(1);
        expect(applyFontSize).toHaveBeenCalledTimes(1);
        expect(applyPanelHeight).toHaveBeenCalledTimes(1);
      });

      test("placePanel が解決する前のタイマー段階でも apply* は呼ばれている", () => {
        // fakeTimers で placePanel の polling を進めていない状態を作る
        createPanel();

        // placePanel は async (waitForSecondary の setTimeout で待機中) のはず
        // その前段で appearance は完了している
        expect(applyTheme).toHaveBeenCalled();
        expect(applyFontSize).toHaveBeenCalled();
        expect(applyPanelHeight).toHaveBeenCalled();
      });
    });
  });
});
