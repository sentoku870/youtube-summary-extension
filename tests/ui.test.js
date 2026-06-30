// tests/ui.test.js — UI操作関数のテスト（showError, appendChatMessage, updateChatMessageBody, scrollContentToElement）
const { uiState: S } = require("../src/shared/state");
const { on, clearAll, EVENTS } = require("../src/shared/event-bus");

// ui.js の依存をモック（重いチェーンと循環参照を回避）
jest.mock("../src/content/ui/panel.js", () => ({ getEl: jest.fn() }));
jest.mock("../src/domain/markdown.js", () => ({ setMarkdown: jest.fn() }));
jest.mock("../src/domain/ai-utils.js", () => ({ linkTimestamps: jest.fn() }));
// A-3: ui.js → tabs.js の直接依存は event-bus 経由になったため、tabs.js のモックは不要。

const {
  showError,
  hideError,
  appendChatMessage,
  appendAssistantPlaceholder,
  updateChatMessageBody,
  scrollContentToElement,
  showProgress,
  hideProgress,
  focusChatInput,
  clearChatHistory
} = require("../src/content/ui/ui");
const { getEl } = require("../src/content/ui/panel");
const { setMarkdown } = require("../src/domain/markdown");

describe("ui", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearAll(); // A-3: event-bus のリスナーをクリアしてテスト間の分離を保証
    S.activeTab = null;
    S.panelEl = null;
  });

  // ===== showError =====
  describe("showError", () => {
    test("オンライン時: メッセージと再試行ボタンを表示", () => {
      Object.defineProperty(navigator, "onLine", {
        value: true,
        configurable: true,
        writable: true
      });
      const errorEl = document.createElement("div");
      getEl.mockReturnValue(errorEl);

      showError("APIエラー発生");

      expect(errorEl.style.display).toBe("block");
      expect(errorEl.textContent).toContain("APIエラー発生");
      expect(errorEl.querySelector("#ys-errorRetryBtn")).toBeTruthy();
    });

    test("HTML タグを含むメッセージはエスケープされて textContent として挿入される (XSS 対策)", () => {
      Object.defineProperty(navigator, "onLine", {
        value: true,
        configurable: true,
        writable: true
      });
      const errorEl = document.createElement("div");
      getEl.mockReturnValue(errorEl);

      const evil = "<img src=x onerror=alert(1)><script>alert(1)</script>";
      showError(evil);

      expect(errorEl.textContent).toContain("<img src=x onerror=alert(1)>");
      expect(errorEl.querySelector("img")).toBeNull();
      expect(errorEl.querySelector("script")).toBeNull();
    });

    test("オフライン時: オフラインメッセージを表示（再試行ボタンなし）", () => {
      Object.defineProperty(navigator, "onLine", {
        value: false,
        configurable: true,
        writable: true
      });
      const errorEl = document.createElement("div");
      getEl.mockReturnValue(errorEl);

      showError("何かのエラー");

      expect(errorEl.style.display).toBe("block");
      expect(errorEl.textContent).toContain("オフライン");
      expect(errorEl.querySelector("#ys-errorRetryBtn")).toBeNull();
    });

    test("getElがnullの場合は何もしない", () => {
      getEl.mockReturnValue(null);
      expect(() => showError("err")).not.toThrow();
    });

    test("再試行ボタンクリックでSUMMARY_RETRY_CLICKEDイベントがactiveTab付きで発火する", () => {
      Object.defineProperty(navigator, "onLine", {
        value: true,
        configurable: true,
        writable: true
      });
      const errorEl = document.createElement("div");
      getEl.mockReturnValue(errorEl);
      S.activeTab = "summary";

      const listener = jest.fn();
      on(EVENTS.SUMMARY_RETRY_CLICKED, listener);

      showError("エラー");

      const retryBtn = errorEl.querySelector("#ys-errorRetryBtn");
      retryBtn.click();

      expect(errorEl.style.display).toBe("none");
      expect(listener).toHaveBeenCalledWith({ activeTab: "summary" });
    });

    test("再試行ボタンクリックでactiveTabがnullならSUMMARY_RETRY_CLICKEDは発火するがpayload.activeTabはnull", () => {
      Object.defineProperty(navigator, "onLine", {
        value: true,
        configurable: true,
        writable: true
      });
      const errorEl = document.createElement("div");
      getEl.mockReturnValue(errorEl);
      S.activeTab = null;

      const listener = jest.fn();
      on(EVENTS.SUMMARY_RETRY_CLICKED, listener);

      showError("エラー");

      const retryBtn = errorEl.querySelector("#ys-errorRetryBtn");
      retryBtn.click();

      // activeTab が null でもイベントは発火し、購読者側で判断する
      expect(listener).toHaveBeenCalledWith({ activeTab: null });
    });
  });

  // ===== hideError =====
  describe("hideError", () => {
    test("エラー要素のdisplayをnoneにする", () => {
      const errorEl = document.createElement("div");
      errorEl.style.display = "block";
      getEl.mockReturnValue(errorEl);

      hideError();
      expect(errorEl.style.display).toBe("none");
    });

    test("getElがnullの場合は何もしない", () => {
      getEl.mockReturnValue(null);
      expect(() => hideError()).not.toThrow();
    });
  });

  // ===== appendChatMessage =====
  describe("appendChatMessage", () => {
    test("チャット履歴要素がない場合はnullを返す", () => {
      getEl.mockReturnValue(null);
      const result = appendChatMessage("user", "text");
      expect(result).toBeNull();
    });

    test("user + editIndex指定で編集ボタンを付与", () => {
      const historyEl = document.createElement("div");
      getEl.mockReturnValue(historyEl);

      const result = appendChatMessage("user", "質問内容", { editIndex: 5 });

      expect(result).toBeTruthy();
      expect(result.div).toBeTruthy();
      expect(result.body).toBeTruthy();
      const editBtn = result.div.querySelector(".ys-chat-edit-btn");
      expect(editBtn).toBeTruthy();
      expect(editBtn.getAttribute("data-edit-index")).toBe("5");
      expect(editBtn.textContent).toContain("編集");
    });

    test("assistantロールには編集ボタンを付けない", () => {
      const historyEl = document.createElement("div");
      getEl.mockReturnValue(historyEl);

      const result = appendChatMessage("assistant", "回答内容", { editIndex: 3 });

      expect(result.div.querySelector(".ys-chat-edit-btn")).toBeNull();
    });

    test("userロールでもeditIndex未指定なら編集ボタンなし", () => {
      const historyEl = document.createElement("div");
      getEl.mockReturnValue(historyEl);

      const result = appendChatMessage("user", "質問");

      expect(result.div.querySelector(".ys-chat-edit-btn")).toBeNull();
    });

    test("メッセージ要素のクラス名がchat-msg + role", () => {
      const historyEl = document.createElement("div");
      getEl.mockReturnValue(historyEl);

      const result = appendChatMessage("assistant", "text");
      expect(result.div.className).toContain("chat-msg");
      expect(result.div.className).toContain("assistant");
    });

    test("本文要素にys-mdクラスが付与される", () => {
      const historyEl = document.createElement("div");
      getEl.mockReturnValue(historyEl);

      const result = appendChatMessage("user", "text");
      expect(result.body.className).toContain("ys-md");
    });

    test("setMarkdownが本文に呼ばれる", () => {
      const historyEl = document.createElement("div");
      getEl.mockReturnValue(historyEl);

      appendChatMessage("user", "マークダウン**太字**");
      expect(setMarkdown).toHaveBeenCalledWith(expect.any(HTMLElement), "マークダウン**太字**");
    });

    test("履歴にdivが追加される", () => {
      const historyEl = document.createElement("div");
      getEl.mockReturnValue(historyEl);

      appendChatMessage("user", "text");
      expect(historyEl.children.length).toBe(1);
    });
  });

  // ===== updateChatMessageBody =====
  describe("updateChatMessageBody", () => {
    test("bodyElがnullの場合は何もしない", () => {
      updateChatMessageBody(null, "text");
      expect(setMarkdown).not.toHaveBeenCalled();
    });

    test("bodyElがあればsetMarkdownで本文を更新", () => {
      const bodyEl = document.createElement("div");
      updateChatMessageBody(bodyEl, "新しいテキスト");
      expect(setMarkdown).toHaveBeenCalledWith(bodyEl, "新しいテキスト");
    });
  });

  // ===== scrollContentToElement =====
  describe("scrollContentToElement", () => {
    test("elがnullの場合は何もしない", () => {
      expect(() => scrollContentToElement(null)).not.toThrow();
    });

    test("コンテンツエリアがない場合は何もしない", () => {
      getEl.mockReturnValue(null);
      const el = document.createElement("div");
      expect(() => scrollContentToElement(el)).not.toThrow();
    });

    test("要素の上端が見えるようスクロール", () => {
      const areaEl = document.createElement("div");
      areaEl.scrollTop = 50;
      areaEl.getBoundingClientRect = jest.fn(() => ({ top: 0 }));
      getEl.mockReturnValue(areaEl);

      const targetEl = document.createElement("div");
      targetEl.getBoundingClientRect = jest.fn(() => ({ top: 100 }));

      scrollContentToElement(targetEl);

      // scrollTop + (elRect.top - areaRect.top) - 4 = 50 + 100 - 4 = 146
      expect(areaEl.scrollTop).toBe(146);
    });

    test("計算結果が負の場合は0にクランプ", () => {
      const areaEl = document.createElement("div");
      areaEl.scrollTop = 0;
      areaEl.getBoundingClientRect = jest.fn(() => ({ top: 100 }));
      getEl.mockReturnValue(areaEl);

      const targetEl = document.createElement("div");
      targetEl.getBoundingClientRect = jest.fn(() => ({ top: 50 }));

      scrollContentToElement(targetEl);

      // 0 + (50 - 100) - 4 = -54 → Math.max(0, -54) = 0
      expect(areaEl.scrollTop).toBe(0);
    });
  });

  // ===== appendAssistantPlaceholder =====
  describe("appendAssistantPlaceholder", () => {
    test("履歴要素がない場合はnullを返す", () => {
      getEl.mockReturnValue(null);
      expect(appendAssistantPlaceholder()).toBeNull();
    });

    test("ストリーミング用プレースホルダーを作成", () => {
      const historyEl = document.createElement("div");
      getEl.mockReturnValue(historyEl);

      const result = appendAssistantPlaceholder();

      expect(result).toBeTruthy();
      expect(result.div.className).toContain("assistant");
      expect(result.body.className).toContain("chat-msg-streaming");
      expect(result.body.textContent).toBe("…");
    });
  });

  // ===== 軽量なgetter/setter系 =====
  describe("showProgress / hideProgress", () => {
    test("showProgressが要素のdisplayとtextContentを設定", () => {
      const progressEl = document.createElement("div");
      getEl.mockReturnValue(progressEl);

      showProgress("処理中...");

      expect(progressEl.style.display).toBe("block");
      expect(progressEl.textContent).toBe("処理中...");
    });

    test("hideProgressがdisplayをnoneに", () => {
      const progressEl = document.createElement("div");
      getEl.mockReturnValue(progressEl);

      hideProgress();
      expect(progressEl.style.display).toBe("none");
    });
  });

  describe("focusChatInput", () => {
    test("入力欄をクリアしてフォーカス", () => {
      const inputEl = document.createElement("textarea");
      inputEl.value = "古いテキスト";
      inputEl.style.height = "100px";
      getEl.mockReturnValue(inputEl);

      focusChatInput();

      expect(inputEl.value).toBe("");
      expect(inputEl.style.height).toBe("auto");
    });
  });

  describe("clearChatHistory", () => {
    test("チャット履歴を空にする", () => {
      const historyEl = document.createElement("div");
      historyEl.innerHTML = "<div>msg1</div><div>msg2</div>";
      getEl.mockReturnValue(historyEl);

      clearChatHistory();

      expect(historyEl.innerHTML).toBe("");
    });
  });

  describe("setSummaryRaw", () => {
    const { setSummaryRaw } = require("../src/content/ui/ui");

    test("要素の textContent にプレーンテキストを設定する", () => {
      const summaryEl = document.createElement("div");
      summaryEl.innerHTML = "<p>古い内容</p>";
      getEl.mockReturnValue(summaryEl);

      setSummaryRaw("⏳ 再生成中...");

      expect(summaryEl.textContent).toBe("⏳ 再生成中...");
    });

    test("HTML タグを含む文字列もエスケープされず text として設定する（XSS 対策）", () => {
      const summaryEl = document.createElement("div");
      getEl.mockReturnValue(summaryEl);

      const evil = "<img src=x onerror=alert(1)><script>alert(1)</script>";
      setSummaryRaw(evil);

      expect(summaryEl.textContent).toBe(evil);
      expect(summaryEl.querySelector("img")).toBeNull();
      expect(summaryEl.querySelector("script")).toBeNull();
    });

    test("getEl が null の場合は何もしない", () => {
      getEl.mockReturnValue(null);
      expect(() => setSummaryRaw("text")).not.toThrow();
    });
  });
});
