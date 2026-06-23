// tests/sidebar.test.js — content/ui/sidebar.js の状態管理テスト
// resetTranscript / resetState / getPanelEl を検証。
//
// sidebar.js は import 時に ./event-bridge.js / ./message-handler.js も
// 副作用 import するため、chrome.* などをモックで吸収する。

// chrome.runtime.onMessage.addListener をモック（message-handler.js 用）
global.chrome = {
  runtime: {
    onMessage: { addListener: jest.fn() }
  }
};

const { uiState: U, sessionState: S } = require("../src/shared/state");
const { clearAll } = require("../src/shared/event-bus");

// 依存モジュールをモック
jest.mock("../src/domain/ai.js", () => ({
  abortCurrentStream: jest.fn()
}));
jest.mock("../src/content/ui/ui.js", () => ({
  clearSummaryContent: jest.fn(),
  hideProgress: jest.fn()
}));
jest.mock("../src/content/ui/tabs.js", () => ({
  updateTabActive: jest.fn(),
  bindEvents: jest.fn(),
  applyButtonTitles: jest.fn(),
  switchTab: jest.fn()
}));

const { abortCurrentStream } = require("../src/domain/ai");
const ui = require("../src/content/ui/ui");
const tabs = require("../src/content/ui/tabs");

// テスト対象
const { getPanelEl, resetTranscript, resetState } = require("../src/content/ui/sidebar");

describe("sidebar", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearAll();
    U.panelEl = null;
    S.preloadedTranscript = null;
    S.transcriptReady = false;
    U.activeTab = null;
    S.videoMeta = null;
    U.tabIds = ["summary", "customA", "customB"];
    U.tabs = {
      summary: { generated: true, content: "old", config: { x: 1 }, chatHistory: [{ a: 1 }] },
      customA: { generated: true, content: "oldA", config: null, chatHistory: [{ a: 2 }] },
      customB: { generated: true, content: "oldB", config: null, chatHistory: [{ a: 3 }] }
    };
  });

  // ===== getPanelEl =====
  describe("getPanelEl", () => {
    test("state.panelEl をそのまま返す", () => {
      const el = document.createElement("div");
      U.panelEl = el;
      expect(getPanelEl()).toBe(el);
    });

    test("state.panelEl が null の場合は null", () => {
      U.panelEl = null;
      expect(getPanelEl()).toBeNull();
    });
  });

  // ===== resetTranscript =====
  describe("resetTranscript", () => {
    test("preloadedTranscript を null にして transcriptReady=false にする", () => {
      S.preloadedTranscript = { all: ["x"] };
      S.transcriptReady = true;

      resetTranscript();

      expect(S.preloadedTranscript).toBeNull();
      expect(S.transcriptReady).toBe(false);
    });
  });

  // ===== resetState =====
  describe("resetState", () => {
    test("state.panelEl が null の場合は abort 以外 no-op", () => {
      U.panelEl = null;
      resetState();
      // abortCurrentStream は条件チェック前に呼ばれる（仕様）
      expect(abortCurrentStream).toHaveBeenCalledTimes(1);
      // パネル非表示や UI クリアはスキップ
      expect(ui.clearSummaryContent).not.toHaveBeenCalled();
      expect(ui.hideProgress).not.toHaveBeenCalled();
      expect(tabs.updateTabActive).not.toHaveBeenCalled();
    });

    test("パネル内の #ys-panel を非表示にする", () => {
      const root = document.createElement("div");
      root.id = "yt-summary-root";
      const panel = document.createElement("div");
      panel.id = "ys-panel";
      panel.style.display = "flex";
      root.appendChild(panel);
      document.body.appendChild(root);
      U.panelEl = root;

      resetState();

      expect(panel.style.display).toBe("none");
    });

    test("全タブの generated / content / chatHistory を初期化", () => {
      const root = document.createElement("div");
      const panel = document.createElement("div");
      panel.id = "ys-panel";
      root.appendChild(panel);
      U.panelEl = root;

      resetState();

      for (const id of ["summary", "customA", "customB"]) {
        expect(U.tabs[id].generated).toBe(false);
        expect(U.tabs[id].content).toBe("");
        expect(U.tabs[id].chatHistory).toEqual([]);
      }
    });

    test("abortCurrentStream と UI クリア・非表示関数が呼ばれる", () => {
      const root = document.createElement("div");
      const panel = document.createElement("div");
      panel.id = "ys-panel";
      root.appendChild(panel);
      U.panelEl = root;

      resetState();

      expect(abortCurrentStream).toHaveBeenCalledTimes(1);
      expect(ui.clearSummaryContent).toHaveBeenCalledTimes(1);
      expect(ui.hideProgress).toHaveBeenCalledTimes(1);
      expect(tabs.updateTabActive).toHaveBeenCalledTimes(1);
    });

    test("activeTab と videoMeta をリセット", () => {
      const root = document.createElement("div");
      const panel = document.createElement("div");
      panel.id = "ys-panel";
      root.appendChild(panel);
      U.panelEl = root;
      U.activeTab = "summary";
      S.videoMeta = { title: "x" };

      resetState();

      expect(U.activeTab).toBeNull();
      expect(S.videoMeta).toBeNull();
    });

    test("U.tabIds が未設定でもデフォルト 3 タブ全てで動作", () => {
      const root = document.createElement("div");
      const panel = document.createElement("div");
      panel.id = "ys-panel";
      root.appendChild(panel);
      U.panelEl = root;
      U.tabIds = null;
      // tabs にデフォルト ID だけ用意
      U.tabs = {
        summary: { generated: true, content: "x", chatHistory: [] },
        customA: { generated: true, content: "x", chatHistory: [] },
        customB: { generated: true, content: "x", chatHistory: [] }
      };

      resetState();

      for (const id of ["summary", "customA", "customB"]) {
        expect(U.tabs[id].generated).toBe(false);
      }
    });
  });
});
