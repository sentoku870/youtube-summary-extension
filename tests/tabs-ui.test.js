// tests/tabs-ui.test.js — タブUI描画ロジックのテスト
const helpers = require("./__helpers__/index.cjs");
const { uiState: S } = require("../src/shared/state");

// panel.js と ui-* をモック（重い依存チェーンを回避）
jest.mock("../src/content/ui/panel.js", () => ({
  getEl: jest.fn()
}));
jest.mock("../src/content/ui/ui-progress.js", () => ({
  hideProgress: jest.fn()
}));
jest.mock("../src/content/ui/ui-summary.js", () => ({
  clearSummaryContent: jest.fn(),
  updateInfoLabel: jest.fn(),
  hideChatArea: jest.fn(),
  setSummaryContent: jest.fn(),
  showChatArea: jest.fn()
}));
jest.mock("../src/content/ui/ui-buttons.js", () => ({
  hideRegenButton: jest.fn(),
  hideCopyButton: jest.fn(),
  showRegenButton: jest.fn(),
  showCopyButton: jest.fn(),
  focusChatInput: jest.fn()
}));
jest.mock("../src/content/ui/ui-chat.js", () => ({
  appendChatMessage: jest.fn()
}));

const { updateTabUI, updateTabActive, renderTabContent } = require("../src/content/ui/tabs-ui");
const { getEl } = require("../src/content/ui/panel");
const uiSummary = require("../src/content/ui/ui-summary");
const uiProgress = require("../src/content/ui/ui-progress");
const uiButtons = require("../src/content/ui/ui-buttons");
const uiChat = require("../src/content/ui/ui-chat");
const ui = Object.assign({}, uiSummary, uiProgress, uiButtons, uiChat);

describe("tabs-ui", () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // 実DOMパネルを構築して getEl が querySelector で動くようにする
    const panel = document.createElement("div");
    panel.innerHTML =
      '<button id="ys-btn-summary">📝 A</button>' +
      '<button id="ys-btn-customA">📊 B</button>' +
      '<button id="ys-btn-customB">💡 C</button>' +
      '<div id="ys-chatHistory"></div>';
    S.panelEl = panel;
    getEl.mockImplementation(function (sel) {
      return panel.querySelector(sel);
    });

    // state をリセット
    S.tabIds = ["summary", "customA", "customB"];
    S.tabs = {
      summary: {
        generated: false,
        content: "",
        modelLabel: "",
        transcriptCount: 0,
        chatHistory: []
      },
      customA: {
        generated: false,
        content: "",
        modelLabel: "",
        transcriptCount: 0,
        chatHistory: []
      },
      customB: {
        generated: false,
        content: "",
        modelLabel: "",
        transcriptCount: 0,
        chatHistory: []
      }
    };
    S.activeTab = null;
  });

  // ===== updateTabUI =====
  describe("updateTabUI", () => {
    test("生成済みタブにドットを追加する", () => {
      S.tabs.summary.generated = true;
      updateTabUI();
      const dot = getEl("#ys-btn-summary").querySelector(".ys-dot");
      expect(dot).toBeTruthy();
      expect(dot.textContent).toBe(" ●");
    });

    test("未生成タブにはドットを追加しない", () => {
      updateTabUI();
      expect(getEl("#ys-btn-summary").querySelector(".ys-dot")).toBeNull();
      expect(getEl("#ys-btn-customA").querySelector(".ys-dot")).toBeNull();
    });

    test("既存ドットがある状態でgenerated=falseになるとドットを削除", () => {
      S.tabs.summary.generated = true;
      updateTabUI();
      expect(getEl("#ys-btn-summary").querySelector(".ys-dot")).toBeTruthy();

      S.tabs.summary.generated = false;
      updateTabUI();
      expect(getEl("#ys-btn-summary").querySelector(".ys-dot")).toBeNull();
    });

    test("複数タブが生成済みの場合はそれぞれにドットを追加", () => {
      S.tabs.summary.generated = true;
      S.tabs.customB.generated = true;
      updateTabUI();
      expect(getEl("#ys-btn-summary").querySelector(".ys-dot")).toBeTruthy();
      expect(getEl("#ys-btn-customA").querySelector(".ys-dot")).toBeNull();
      expect(getEl("#ys-btn-customB").querySelector(".ys-dot")).toBeTruthy();
    });

    test("getElがnullを返す場合はスキップ（エラーなし）", () => {
      getEl.mockReturnValue(null);
      expect(() => updateTabUI()).not.toThrow();
    });
  });

  // ===== updateTabActive =====
  describe("updateTabActive", () => {
    test("アクティブタブにys-activeクラスを付与", () => {
      S.activeTab = "customA";
      updateTabActive();
      expect(getEl("#ys-btn-customA").classList.contains("ys-active")).toBe(true);
      expect(getEl("#ys-btn-summary").classList.contains("ys-active")).toBe(false);
      expect(getEl("#ys-btn-customB").classList.contains("ys-active")).toBe(false);
    });

    test("activeTab=nullの場合は全ボタンからys-activeを外す", () => {
      // 事前に active クラスを付与
      getEl("#ys-btn-summary").classList.add("ys-active");
      getEl("#ys-btn-customA").classList.add("ys-active");

      S.activeTab = null;
      updateTabActive();

      S.tabIds.forEach(function (id) {
        expect(getEl("#ys-btn-" + id).classList.contains("ys-active")).toBe(false);
      });
    });

    test("タブ切替でys-activeが正しく遷移する", () => {
      S.activeTab = "summary";
      updateTabActive();
      expect(getEl("#ys-btn-summary").classList.contains("ys-active")).toBe(true);

      S.activeTab = "customA";
      updateTabActive();
      expect(getEl("#ys-btn-summary").classList.contains("ys-active")).toBe(false);
      expect(getEl("#ys-btn-customA").classList.contains("ys-active")).toBe(true);
    });
  });

  // ===== renderTabContent =====
  describe("renderTabContent", () => {
    test("存在しないタブの場合は何もしない", () => {
      renderTabContent("nonexistent");
      expect(ui.setSummaryContent).not.toHaveBeenCalled();
      expect(ui.clearSummaryContent).not.toHaveBeenCalled();
    });

    test("generated=falseの場合はクリア系関数を呼ぶ", () => {
      renderTabContent("summary");
      expect(ui.clearSummaryContent).toHaveBeenCalled();
      expect(ui.updateInfoLabel).toHaveBeenCalledWith("");
      expect(ui.hideChatArea).toHaveBeenCalled();
      expect(ui.hideRegenButton).toHaveBeenCalled();
      expect(ui.hideCopyButton).toHaveBeenCalled();
      expect(ui.hideProgress).toHaveBeenCalled();
      expect(ui.setSummaryContent).not.toHaveBeenCalled();
    });

    test("generated=trueの場合はコンテンツを描画", () => {
      S.tabs.summary.generated = true;
      S.tabs.summary.content = "要約テキスト";
      S.tabs.summary.modelLabel = "gpt-4o";
      S.tabs.summary.transcriptCount = 42;

      renderTabContent("summary");

      expect(ui.setSummaryContent).toHaveBeenCalledWith("要約テキスト");
      expect(ui.updateInfoLabel).toHaveBeenCalledWith("使用モデル: gpt-4o | 字幕 42 件");
      expect(ui.showRegenButton).toHaveBeenCalled();
      expect(ui.showCopyButton).toHaveBeenCalled();
      expect(ui.showChatArea).toHaveBeenCalled();
      expect(ui.focusChatInput).toHaveBeenCalled();
    });

    test("chatHistoryの先頭3件はスキップして[3..]を再描画", () => {
      S.tabs.summary.generated = true;
      S.tabs.summary.chatHistory = [
        { role: "system", content: "sys" }, // [0] skip
        { role: "user", content: "prompt" }, // [1] skip
        { role: "assistant", content: "answer" }, // [2] skip
        { role: "user", content: "質問1" }, // [3] render
        { role: "assistant", content: "回答1" } // [4] render
      ];

      renderTabContent("summary");

      expect(ui.appendChatMessage).toHaveBeenCalledTimes(2);
      expect(ui.appendChatMessage).toHaveBeenCalledWith("user", "質問1", { editIndex: 3 });
      expect(ui.appendChatMessage).toHaveBeenCalledWith("assistant", "回答1", { editIndex: 4 });
    });

    test("chatHistoryが3件以下の場合はappendChatMessageを呼ばない", () => {
      S.tabs.summary.generated = true;
      S.tabs.summary.chatHistory = [
        { role: "system", content: "sys" },
        { role: "user", content: "prompt" },
        { role: "assistant", content: "answer" }
      ];

      renderTabContent("summary");

      expect(ui.appendChatMessage).not.toHaveBeenCalled();
    });

    test("systemロールのメッセージは再描画されない", () => {
      S.tabs.summary.generated = true;
      S.tabs.summary.chatHistory = [
        {},
        {},
        {},
        { role: "system", content: "extra sys" },
        { role: "user", content: "質問" }
      ];

      renderTabContent("summary");

      expect(ui.appendChatMessage).toHaveBeenCalledTimes(1);
      expect(ui.appendChatMessage).toHaveBeenCalledWith("user", "質問", { editIndex: 4 });
    });
  });

  // ===== applyButtonTitles =====
  // applyButtonTitles の実体は tabs-ui.js 内にあるが、tabs-ui.js を
  // モジュールモックしているため、applyButtonTitles 単体の検証は
  // モジュールモックの対象外にしてこの describe ブロックでのみ実物を使う。
  describe("applyButtonTitles", () => {
    let savedEnableAllButtons;
    let realTabsUi;

    beforeAll(function () {
      // 実モジュールを取得（モックで上書きされた require を避ける）
      jest.isolateModules(function () {
        realTabsUi = require("../src/content/ui/tabs-ui");
      });
    });

    beforeEach(() => {
      helpers.clearBody();
      const root = document.createElement("div");
      root.id = "yt-summary-root";
      root.innerHTML =
        '<button id="ys-btn-summary">A</button>' +
        '<button id="ys-btn-customA">B</button>' +
        '<button id="ys-btn-customB">C</button>';
      document.body.appendChild(root);
      const panel = require("../src/content/ui/panel");
      savedEnableAllButtons = panel.enableAllButtons;
      panel.enableAllButtons = jest.fn();
      getEl.mockImplementation(function (id) {
        return document.querySelector(id);
      });
    });

    afterEach(() => {
      const panel = require("../src/content/ui/panel");
      panel.enableAllButtons = savedEnableAllButtons;
    });

    test("loadButtonTitle が null の場合は A/B/C フォールバック", async () => {
      const storageConfig = require("../src/infrastructure/storage-config");
      const spy = jest.spyOn(storageConfig, "loadButtonTitle").mockResolvedValue(null);

      await realTabsUi.applyButtonTitles();

      expect(getEl("#ys-btn-summary").textContent).toBe("📝 A");
      expect(getEl("#ys-btn-customA").textContent).toBe("📊 B");
      expect(getEl("#ys-btn-customB").textContent).toBe("💡 C");

      spy.mockRestore();
    });
  });
});
