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
  disableAllButtons,
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

  // ===== disableAllButtons / enableAllButtons =====
  describe("disableAllButtons", () => {
    test("ys-tab-row内のボタンをすべてdisabledにする", () => {
      const panel = document.createElement("div");
      const tabRow = document.createElement("div");
      tabRow.className = "ys-tab-row";
      const btn1 = document.createElement("button");
      const btn2 = document.createElement("button");
      const btn3 = document.createElement("button");
      tabRow.appendChild(btn1);
      tabRow.appendChild(btn2);
      tabRow.appendChild(btn3);
      panel.appendChild(tabRow);
      S.panelEl = panel;

      disableAllButtons();

      expect(btn1.disabled).toBe(true);
      expect(btn2.disabled).toBe(true);
      expect(btn3.disabled).toBe(true);
    });

    test("ys-tab-row外のボタンは対象外", () => {
      const panel = document.createElement("div");
      const copyBtn = document.createElement("button");
      copyBtn.id = "ys-copyBtn";
      panel.appendChild(copyBtn);
      S.panelEl = panel;

      disableAllButtons();

      expect(copyBtn.disabled).toBe(false);
    });

    test("panelEl未設定時はエラーなく処理をスキップ", () => {
      S.panelEl = null;
      expect(() => disableAllButtons()).not.toThrow();
    });
  });

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

      // disableAllButtons の後、btn-summary のテキストは上書きされる
      // placePanel のコールバックで applyTheme 等が呼ばれるが fakeTimers で抑制
      const btnSummary = getEl("#ys-btn-summary");
      expect(btnSummary.textContent).toContain("字幕取得中");
    });

    test("生成直後は全タブボタンが押せる（字幕取得中も block しない）", () => {
      createPanel();

      const btnSummary = getEl("#ys-btn-summary");
      const btnCustomA = getEl("#ys-btn-customA");
      const btnCustomB = getEl("#ys-btn-customB");

      // ★ 旧実装: 生成直後に disableAllButtons() で全ボタンを disabled に
      //   していたため、TRANSCRIPT_READY/FAILED が遅延・失敗すると
      //   永久に押せず A→B 切替もできない症状があった。
      //   新実装: 字幕プリロード中でもボタンは押せる。AI 実行時に
      //   callAI() 内部で transcript を改めて取得する。
      expect(btnSummary.disabled).toBe(false);
      expect(btnCustomA.disabled).toBe(false);
      expect(btnCustomB.disabled).toBe(false);
    });
  });
});
