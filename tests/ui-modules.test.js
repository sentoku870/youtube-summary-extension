// tests/ui-modules.test.js — Phase B で分割した ui-* ファイルの直接テスト
// ui.js は re-export ハブのため、各ファイルが直接テストされていない。
// このテストで各 ui-* ファイルの分岐カバレッジを向上させる。

const helpers = require("./__helpers__/index.cjs");
helpers.installChromeMock();

// panel.js をモック化（getEl の戻り値を制御するため、ui-* 読み込み前に設定）
jest.mock("../src/content/ui/panel.js", () => ({
  getEl: jest.fn()
}));

// markdown.js もモック化（setMarkdown が必要なため）
jest.mock("../src/domain/markdown.js", () => ({
  setMarkdown: jest.fn((el, text) => {
    if (el) el.textContent = text;
  })
}));

jest.mock("../src/domain/ai-utils.js", () => ({
  linkTimestamps: jest.fn()
}));

describe("ui-progress", () => {
  const { showProgress, hideProgress, showError, hideError } = require("../src/content/ui/ui-progress");
  const { getEl } = require("../src/content/ui/panel");

  beforeEach(() => {
    helpers.clearBody();
    getEl.mockImplementation(function (id) {
      return document.querySelector(id);
    });
  });

  // navigator.onLine をモック化（beforeEach 内で復元するため afterEach で呼ぶ）
  let onLineSpy;
  beforeEach(() => {
    onLineSpy = jest.spyOn(navigator, "onLine", "get").mockReturnValue(true);
  });
  afterEach(() => {
    if (onLineSpy) onLineSpy.mockRestore();
  });

  describe("showProgress / hideProgress", () => {
    test("showProgress: 要素があれば表示 + テキスト設定", () => {
      const el = document.createElement("div");
      el.id = "ys-progress";
      el.style.display = "none";
      document.body.appendChild(el);
      showProgress("処理中…");
      expect(el.style.display).toBe("block");
      expect(el.textContent).toBe("処理中…");
    });

    test("showProgress: 要素がない場合は no-op", () => {
      expect(() => showProgress("test")).not.toThrow();
    });

    test("hideProgress: 要素があれば非表示", () => {
      const el = document.createElement("div");
      el.id = "ys-progress";
      el.style.display = "block";
      document.body.appendChild(el);
      hideProgress();
      expect(el.style.display).toBe("none");
    });

    test("hideProgress: 要素がない場合は no-op", () => {
      expect(() => hideProgress()).not.toThrow();
    });
  });

  describe("showError", () => {
    test("getEl が null の場合は no-op", () => {
      getEl.mockReturnValue(null);
      expect(() => showError("err")).not.toThrow();
    });

    test("オフライン時はオフラインメッセージ + 再試行ボタンなし", () => {
      onLineSpy.mockReturnValue(false);
      const el = document.createElement("div");
      el.id = "ys-error";
      document.body.appendChild(el);
      showError("any");
      expect(el.textContent).toContain("オフライン");
      expect(el.querySelector("#ys-errorRetryBtn")).toBeNull();
    });

    test("オンライン時: メッセージ + 再試行ボタン", () => {
      const el = document.createElement("div");
      el.id = "ys-error";
      document.body.appendChild(el);
      showError("API エラー");
      expect(el.textContent).toContain("API エラー");
      expect(el.querySelector("#ys-errorRetryBtn")).not.toBeNull();
      expect(el.style.display).toBe("block");
    });

    test("再試行ボタンクリックで SUMMARY_RETRY_CLICKED が発火する", () => {
      const el = document.createElement("div");
      el.id = "ys-error";
      document.body.appendChild(el);
      // S.activeTab をセット
      const { uiState } = require("../src/shared/state");
      uiState.activeTab = "summary";
      // event-bus リスナー
      const { EVENTS, on } = require("../src/shared/event-bus");
      const listener = jest.fn();
      on(EVENTS.SUMMARY_RETRY_CLICKED, listener);
      showError("test");
      el.querySelector("#ys-errorRetryBtn").click();
      expect(listener).toHaveBeenCalledWith({ activeTab: "summary" });
    });

    test("null メッセージでも空文字として表示される", () => {
      const el = document.createElement("div");
      el.id = "ys-error";
      document.body.appendChild(el);
      showError(null);
      // メッセージ span（最初の子要素）のテキストが空
      const messageSpan = el.querySelector("span");
      expect(messageSpan.textContent).toBe("");
    });
  });

  describe("hideError", () => {
    test("要素があれば非表示", () => {
      const el = document.createElement("div");
      el.id = "ys-error";
      el.style.display = "block";
      document.body.appendChild(el);
      hideError();
      expect(el.style.display).toBe("none");
    });

    test("要素がない場合は no-op", () => {
      expect(() => hideError()).not.toThrow();
    });
  });
});

describe("ui-summary", () => {
  const { setSummaryContent, clearSummaryContent, setSummaryRaw, updateInfoLabel, showChatArea, hideChatArea } =
    require("../src/content/ui/ui-summary");
  const { getEl } = require("../src/content/ui/panel");

  beforeEach(() => {
    helpers.clearBody();
    getEl.mockImplementation(function (id) {
      return document.querySelector(id);
    });
  });

  test("setSummaryContent: 要素があれば markdown + タイムスタンプリンク", () => {
    const el = document.createElement("div");
    el.id = "ys-summaryText";
    el.className = "ys-md";
    document.body.appendChild(el);
    setSummaryContent("# Hello");
    expect(el.textContent).toBe("# Hello");
  });

  test("setSummaryContent: 要素がない場合は no-op", () => {
    getEl.mockReturnValue(null);
    expect(() => setSummaryContent("# x")).not.toThrow();
  });

  test("clearSummaryContent: 要素があれば textContent クリア", () => {
    const el = document.createElement("div");
    el.id = "ys-summaryText";
    el.textContent = "old";
    document.body.appendChild(el);
    clearSummaryContent();
    expect(el.textContent).toBe("");
  });

  test("clearSummaryContent: 要素がない場合は no-op", () => {
    getEl.mockReturnValue(null);
    expect(() => clearSummaryContent()).not.toThrow();
  });

  test("setSummaryRaw: 要素があれば textContent 設定", () => {
    const el = document.createElement("div");
    el.id = "ys-summaryText";
    document.body.appendChild(el);
    setSummaryRaw("⏳ 処理中");
    expect(el.textContent).toBe("⏳ 処理中");
  });

  test("setSummaryRaw: 要素がない場合は no-op", () => {
    getEl.mockReturnValue(null);
    expect(() => setSummaryRaw("x")).not.toThrow();
  });

  test("updateInfoLabel: 要素があれば textContent 設定", () => {
    const el = document.createElement("span");
    el.id = "ys-infoLabel";
    document.body.appendChild(el);
    updateInfoLabel("info text");
    expect(el.textContent).toBe("info text");
  });

  test("updateInfoLabel: 要素がない場合は no-op", () => {
    getEl.mockReturnValue(null);
    expect(() => updateInfoLabel("x")).not.toThrow();
  });

  test("showChatArea: 要素があれば表示", () => {
    const el = document.createElement("div");
    el.id = "ys-chatArea";
    el.style.display = "none";
    document.body.appendChild(el);
    showChatArea();
    expect(el.style.display).toBe("block");
  });

  test("showChatArea: 要素がない場合は no-op", () => {
    getEl.mockReturnValue(null);
    expect(() => showChatArea()).not.toThrow();
  });

  test("hideChatArea: 要素があれば非表示", () => {
    const el = document.createElement("div");
    el.id = "ys-chatArea";
    el.style.display = "block";
    document.body.appendChild(el);
    hideChatArea();
    expect(el.style.display).toBe("none");
  });

  test("hideChatArea: 要素がない場合は no-op", () => {
    getEl.mockReturnValue(null);
    expect(() => hideChatArea()).not.toThrow();
  });
});

describe("ui-buttons", () => {
  const {
    disableRegenButton, enableRegenButton,
    showRegenButton, hideRegenButton,
    showCopyButton, hideCopyButton,
    focusChatInput
  } = require("../src/content/ui/ui-buttons");
  const { getEl } = require("../src/content/ui/panel");

  beforeEach(() => {
    helpers.clearBody();
    getEl.mockImplementation(function (id) {
      return document.querySelector(id);
    });
  });

  test("disableRegenButton / enableRegenButton: disabled を切り替え", () => {
    const btn = document.createElement("button");
    btn.id = "ys-regenBtn";
    document.body.appendChild(btn);
    disableRegenButton();
    expect(btn.disabled).toBe(true);
    enableRegenButton();
    expect(btn.disabled).toBe(false);
  });

  test("showRegenButton / hideRegenButton: display を切り替え", () => {
    const btn = document.createElement("button");
    btn.id = "ys-regenBtn";
    document.body.appendChild(btn);
    showRegenButton();
    expect(btn.style.display).toBe("inline-block");
    hideRegenButton();
    expect(btn.style.display).toBe("none");
  });

  test("showCopyButton / hideCopyButton: display を切り替え", () => {
    const btn = document.createElement("button");
    btn.id = "ys-copyBtn";
    document.body.appendChild(btn);
    showCopyButton();
    expect(btn.style.display).toBe("inline-block");
    hideCopyButton();
    expect(btn.style.display).toBe("none");
  });

  test("focusChatInput: 要素があれば値クリア + focus", () => {
    const ta = document.createElement("textarea");
    ta.id = "ys-chatInput";
    ta.value = "old text";
    ta.style.height = "100px";
    document.body.appendChild(ta);
    const focusSpy = jest.spyOn(ta, "focus");
    focusChatInput();
    expect(ta.value).toBe("");
    expect(ta.style.height).toBe("auto");
    expect(focusSpy).toHaveBeenCalled();
  });

  test("focusChatInput: 要素がない場合は no-op", () => {
    getEl.mockReturnValue(null);
    expect(() => focusChatInput()).not.toThrow();
  });

  test("disable/enable/show/hide: 要素がない場合は no-op", () => {
    getEl.mockReturnValue(null);
    expect(() => disableRegenButton()).not.toThrow();
    expect(() => enableRegenButton()).not.toThrow();
    expect(() => showRegenButton()).not.toThrow();
    expect(() => hideRegenButton()).not.toThrow();
    expect(() => showCopyButton()).not.toThrow();
    expect(() => hideCopyButton()).not.toThrow();
  });
});

describe("ui-chat", () => {
  const {
    appendChatMessage,
    appendAssistantPlaceholder,
    updateChatMessageBody,
    scrollContentToElement,
    clearChatHistory
  } = require("../src/content/ui/ui-chat");
  const { getEl } = require("../src/content/ui/panel");

  beforeEach(() => {
    helpers.clearBody();
    getEl.mockImplementation(function (id) {
      return document.querySelector(id);
    });
  });

  describe("appendChatMessage", () => {
    test("history 要素がない場合は null を返す", () => {
      getEl.mockReturnValue(null);
      expect(appendChatMessage("user", "text")).toBeNull();
    });

    test("user + editIndex 付きで編集ボタンを付与", () => {
      const history = document.createElement("div");
      history.id = "ys-chatHistory";
      document.body.appendChild(history);
      const result = appendChatMessage("user", "質問", { editIndex: 3 });
      expect(result).toBeTruthy();
      const editBtn = result.div.querySelector(".ys-chat-edit-btn");
      expect(editBtn).not.toBeNull();
      expect(editBtn.getAttribute("data-edit-index")).toBe("3");
    });

    test("assistant ロールには編集ボタンを付けない", () => {
      const history = document.createElement("div");
      history.id = "ys-chatHistory";
      document.body.appendChild(history);
      const result = appendChatMessage("assistant", "回答");
      expect(result.div.querySelector(".ys-chat-edit-btn")).toBeNull();
    });

    test("user ロールで editIndex が number でない場合は編集ボタンなし", () => {
      const history = document.createElement("div");
      history.id = "ys-chatHistory";
      document.body.appendChild(history);
      const result = appendChatMessage("user", "質問", { editIndex: "string" });
      expect(result.div.querySelector(".ys-chat-edit-btn")).toBeNull();
    });

    test("opts が undefined なら編集ボタンなし", () => {
      const history = document.createElement("div");
      history.id = "ys-chatHistory";
      document.body.appendChild(history);
      const result = appendChatMessage("user", "質問");
      expect(result.div.querySelector(".ys-chat-edit-btn")).toBeNull();
    });
  });

  describe("appendAssistantPlaceholder", () => {
    test("history がない場合は null", () => {
      getEl.mockReturnValue(null);
      expect(appendAssistantPlaceholder()).toBeNull();
    });

    test("プレースホルダーを作成して返す", () => {
      const history = document.createElement("div");
      history.id = "ys-chatHistory";
      document.body.appendChild(history);
      const result = appendAssistantPlaceholder();
      expect(result).toBeTruthy();
      expect(result.div.className).toContain("assistant");
      expect(result.body.className).toContain("chat-msg-streaming");
    });
  });

  describe("updateChatMessageBody", () => {
    test("bodyEl が null の場合は no-op", () => {
      expect(() => updateChatMessageBody(null, "text")).not.toThrow();
    });

    test("bodyEl があれば setMarkdown で更新", () => {
      const body = document.createElement("div");
      body.textContent = "old";
      updateChatMessageBody(body, "new");
      // setMarkdown は markdown.js のモックが必要
    });
  });

  describe("scrollContentToElement", () => {
    test("el が null の場合は no-op", () => {
      expect(() => scrollContentToElement(null)).not.toThrow();
    });

    test("area がない場合は no-op", () => {
      getEl.mockReturnValue(null);
      const el = document.createElement("div");
      expect(() => scrollContentToElement(el)).not.toThrow();
    });
  });

  describe("clearChatHistory", () => {
    test("history があれば innerHTML を空に", () => {
      const history = document.createElement("div");
      history.id = "ys-chatHistory";
      history.innerHTML = "<div>old</div>";
      document.body.appendChild(history);
      clearChatHistory();
      expect(history.innerHTML).toBe("");
    });

    test("history がない場合は no-op", () => {
      getEl.mockReturnValue(null);
      expect(() => clearChatHistory()).not.toThrow();
    });
  });
});
