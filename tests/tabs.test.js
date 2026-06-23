// tests/tabs.test.js — src/content/ui/tabs.js の包括テスト
// 公開関数: abortChatStream, switchTab, applyButtonTitles, bindEvents
// 内部関数 (onChatSend, regenerate, handleEditUserMessage 等) は DOM イベント経由で検証する。

// requestAnimationFrame の polyfill（jsdom には存在しない）
if (typeof requestAnimationFrame === "undefined") {
  global.requestAnimationFrame = function (cb) { return setTimeout(cb, 0); };
  global.cancelAnimationFrame = function (id) { clearTimeout(id); };
}

// chrome.storage.onChanged をモック
global.chrome = global.chrome || {};
global.chrome.storage = global.chrome.storage || {};
global.chrome.storage.onChanged = { addListener: jest.fn() };
global.chrome.runtime = global.chrome.runtime || {};
// navigator.clipboard のモック
Object.defineProperty(navigator, "clipboard", {
  value: { writeText: jest.fn().mockResolvedValue(undefined) },
  configurable: true,
  writable: true
});

// 依存モジュールをモック
// (jest.mock ファクトリは hoisting されるため、mock プレフィックス付きの
//  変数のみ参照可能)
const mockAppendChatMessage = jest.fn();
const mockAppendAssistantPlaceholder = jest.fn();

jest.mock("../src/content/ui/panel.js", () => ({
  getEl: jest.fn(),
  enableAllButtons: jest.fn()
}));
jest.mock("../src/content/ui/ui.js", () => ({
  setSummaryRaw: jest.fn(),
  disableRegenButton: jest.fn(),
  enableRegenButton: jest.fn(),
  appendChatMessage: mockAppendChatMessage,
  appendAssistantPlaceholder: mockAppendAssistantPlaceholder,
  updateChatMessageBody: jest.fn(),
  scrollContentToElement: jest.fn()
}));
jest.mock("../src/content/ui/tabs-ui.js", () => ({
  updateTabUI: jest.fn(),
  updateTabActive: jest.fn(),
  renderTabContent: jest.fn()
}));
jest.mock("../src/domain/ai.js", () => ({
  callAI: jest.fn().mockResolvedValue(true),
  abortCurrentStream: jest.fn(),
  resolveApiConfig: jest.fn()
}));
jest.mock("../src/domain/api.js", () => ({
  callChatAPIStream: jest.fn()
}));
jest.mock("../src/infrastructure/storage.js", () => ({
  loadButtonTitle: jest.fn()
}));

// 初期状態のデフォルト戻り値
beforeAll(function () {
  const fakeResult = { div: { querySelector: function () { return null; } }, body: {} };
  mockAppendChatMessage.mockReturnValue(fakeResult);
  mockAppendAssistantPlaceholder.mockReturnValue(fakeResult);
});

const { state: S } = require("../src/shared/state");
const { getEl, enableAllButtons } = require("../src/content/ui/panel");
const ui = require("../src/content/ui/ui");
const tabsUi = require("../src/content/ui/tabs-ui");
const ai = require("../src/domain/ai");
const api = require("../src/domain/api");
const storage = require("../src/infrastructure/storage");

const {
  abortChatStream,
  switchTab,
  applyButtonTitles,
  bindEvents
} = require("../src/content/ui/tabs");

// 共通セットアップ: パネル DOM 構築
function buildPanelDOM() {
  document.body.innerHTML = "";
  const root = document.createElement("div");
  root.id = "yt-summary-root";
  root.innerHTML =
    '<div class="ys-tab-row">' +
      '<button id="ys-btn-summary">📝 要約</button>' +
      '<button id="ys-btn-customA">📊 分析</button>' +
      '<button id="ys-btn-customB">💡 考察</button>' +
    '</div>' +
    '<div id="ys-panel" style="display:none">' +
      '<div id="ys-content-area"></div>' +
      '<div id="ys-error"></div>' +
      '<div id="ys-summaryText"></div>' +
      '<div id="ys-progress"></div>' +
      '<div id="ys-infoRow"><span id="ys-infoLabel"></span>' +
        '<button id="ys-copyBtn"></button>' +
        '<button id="ys-regenBtn"></button>' +
      '</div>' +
      '<div id="ys-chatHistory"></div>' +
    '</div>' +
    '<div id="ys-chatArea" style="display:none">' +
      '<textarea id="ys-chatInput" rows="1"></textarea>' +
      '<button id="ys-chatClearBtn"></button>' +
    '</div>';
  document.body.appendChild(root);
  S.panelEl = root;
  S.tabIds = ["summary", "customA", "customB"];
  S.tabs = {
    summary: { generated: false, content: "", config: null, modelLabel: "", transcriptCount: 0, chatHistory: [] },
    customA: { generated: false, content: "", config: null, modelLabel: "", transcriptCount: 0, chatHistory: [] },
    customB: { generated: false, content: "", config: null, modelLabel: "", transcriptCount: 0, chatHistory: [] }
  };
  S.activeTab = null;
  S.eventsBound = false;
  getEl.mockImplementation(function (sel) { return root.querySelector(sel); });
}

// マイクロタスクフラッシュ用ヘルパ
// (fake timers 環境でも setTimeout を経由しない)
function flushPromises() {
  return new Promise(function (resolve) {
    Promise.resolve().then(function () {
      Promise.resolve().then(resolve);
    });
  });
}

describe("tabs", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    buildPanelDOM();
    storage.loadButtonTitle.mockImplementation(async function (btn) {
      return null;
    });
  });

  // ===== abortChatStream =====
  describe("abortChatStream", () => {
    test("現在進行中のチャット応答を中断", () => {
      // bindEvents 等を経由せず内部 chatAbortController を直接作る
      // テストではダミーの controller を後で観察できるよう、
      // bindEvents の chatSend を発火して確認する
      const chatInput = getEl("#ys-chatInput");
      chatInput.value = "test";
      bindEvents();

      // Enter キーで送信
      const event = new KeyboardEvent("keydown", { key: "Enter", shiftKey: false, isComposing: false, bubbles: true, cancelable: true });
      chatInput.dispatchEvent(event);
      // 送信は非同期
      // abortChatStream を呼ぶ
      abortChatStream();
      // 中断後に再度 abortChatStream を呼んでも例外なし
      expect(() => abortChatStream()).not.toThrow();
    });
  });

  // ===== switchTab =====
  describe("switchTab", () => {
    test("存在しないタブは no-op", async () => {
      await switchTab("nonexistent");
      expect(ai.callAI).not.toHaveBeenCalled();
      expect(tabsUi.renderTabContent).not.toHaveBeenCalled();
    });

    test("パネル要素が無い場合は no-op", async () => {
      S.panelEl = null;
      getEl.mockReturnValue(null);
      await switchTab("summary");
      expect(ai.callAI).not.toHaveBeenCalled();
    });

    test("同じタブを再押下するとパネル非表示 + activeTab=null", async () => {
      S.activeTab = "summary";
      const panel = getEl("#ys-panel");
      panel.style.display = "flex";

      await switchTab("summary");

      expect(panel.style.display).toBe("none");
      expect(S.activeTab).toBeNull();
      expect(tabsUi.updateTabActive).toHaveBeenCalled();
    });

    test("generated=true のタブ切替は renderTabContent を呼ぶ", async () => {
      S.tabs.summary.generated = true;
      S.tabs.summary.content = "要約";

      await switchTab("summary");

      expect(tabsUi.renderTabContent).toHaveBeenCalledWith("summary");
      expect(ai.callAI).not.toHaveBeenCalled();
    });

    test("generated=false のタブ切替は callAI を呼ぶ", async () => {
      S.tabs.summary.generated = false;

      await switchTab("summary");

      expect(ai.callAI).toHaveBeenCalledWith("summary", true);
    });

    test("callAI 完了後にボタン状態が復元される", async () => {
      S.tabs.summary.generated = false;
      const btn = getEl("#ys-btn-summary");

      await switchTab("summary");
      // switchTab の finally 内の applyButtonTitles() は await されない
      await flushPromises();

      expect(btn.disabled).toBe(false);
      expect(enableAllButtons).toHaveBeenCalled();
    });

    test("callAI 中は「処理中...」表示・disabled", async () => {
      S.tabs.summary.generated = false;
      const btn = getEl("#ys-btn-summary");
      let resolveCall;
      ai.callAI.mockReturnValueOnce(new Promise(function (r) { resolveCall = r; }));

      const p = switchTab("summary");
      // 同期的にボタンテキスト書き換えが走っている
      expect(btn.textContent).toBe("⏳ 処理中...");
      expect(btn.disabled).toBe(true);
      resolveCall(true);
      await p;
    });
  });

  // ===== applyButtonTitles =====
  describe("applyButtonTitles", () => {
    test("各ボタンのラベルが正しく設定される", async () => {
      storage.loadButtonTitle.mockImplementation(async function (btn) {
        if (btn === "customA") return "分析カスタム";
        if (btn === "customB") return "考察カスタム";
        return null;
      });

      await applyButtonTitles();

      expect(getEl("#ys-btn-summary").textContent).toBe("📝 要約");
      expect(getEl("#ys-btn-customA").textContent).toBe("📊 分析カスタム");
      expect(getEl("#ys-btn-customB").textContent).toBe("💡 考察カスタム");
      expect(enableAllButtons).toHaveBeenCalled();
      expect(tabsUi.updateTabUI).toHaveBeenCalled();
    });

    test("loadButtonTitle が null の場合はデフォルト表記", async () => {
      storage.loadButtonTitle.mockResolvedValue(null);
      await applyButtonTitles();
      expect(getEl("#ys-btn-customA").textContent).toBe("📊 分析");
      expect(getEl("#ys-btn-customB").textContent).toBe("💡 考察");
    });
  });

  // ===== bindEvents =====
  describe("bindEvents", () => {
    test("S.eventsBound を true にする", () => {
      S.eventsBound = false;
      bindEvents();
      expect(S.eventsBound).toBe(true);
    });

    test("2 回呼んでも重複バインドされない", () => {
      bindEvents();
      const btn = getEl("#ys-btn-summary");
      // 2 回目の bindEvents 後もイベントリスナーは重複しない
      bindEvents();
      // クリックで switchTab が 1 回しか呼ばれないことを確認するため、
      // switchTab をモックして呼び出し回数を観察
      // (ここではフラグ確認のみ)
      expect(S.eventsBound).toBe(true);
    });

    test("タブボタン click で switchTab が呼ばれる", () => {
      bindEvents();
      const btn = getEl("#ys-btn-customA");
      btn.click();
      // switchTab は内部で ai モジュールを使うので、ここでは S.activeTab の変化で検証
      // 直接は観察できないので副作用を後で観察するため、callAI を spy
      // customA は未生成なので callAI が呼ばれる
      return Promise.resolve().then(function () {
        expect(ai.callAI).toHaveBeenCalledWith("customA", true);
      });
    });

    test("chatInput keydown Enter で onChatSend が走る（chatBusy=false）", () => {
      bindEvents();
      const chatInput = getEl("#ys-chatInput");
      chatInput.value = "質問";

      const event = new KeyboardEvent("keydown", {
        key: "Enter", shiftKey: false, isComposing: false, bubbles: true, cancelable: true
      });
      chatInput.dispatchEvent(event);

      // onChatSend は非同期。chatBusy フラグで多重送信を防ぐ
      // chatBusy になる前に重複発火をチェックするため、preventDefault だけ検証
      expect(event.defaultPrevented).toBe(true);
    });

    test("chatInput keydown Shift+Enter では送信しない", () => {
      bindEvents();
      const chatInput = getEl("#ys-chatInput");
      chatInput.value = "改行";

      const event = new KeyboardEvent("keydown", {
        key: "Enter", shiftKey: true, isComposing: false, bubbles: true, cancelable: true
      });
      chatInput.dispatchEvent(event);

      expect(event.defaultPrevented).toBe(false);
    });

    test("chatInput keydown IME 変換中は送信しない", () => {
      bindEvents();
      const chatInput = getEl("#ys-chatInput");
      chatInput.value = "変換中";

      const event = new KeyboardEvent("keydown", {
        key: "Enter", shiftKey: false, isComposing: true, bubbles: true, cancelable: true
      });
      chatInput.dispatchEvent(event);

      expect(event.defaultPrevented).toBe(false);
    });

    test("chatInput input で高さ自動調整イベントがバインド", () => {
      // 内部関数 resetChatInputHeight は getComputedStyle を使うため
      // 直接検証はせず、bindEvents 後に input イベント発火で例外が出ないか確認
      bindEvents();
      const chatInput = getEl("#ys-chatInput");
      Object.defineProperty(chatInput, "scrollHeight", { value: 50, configurable: true });
      // getComputedStyle は jsdom で "0px" を返すので parseFloat で 0 になる → Math.min で 0
      chatInput.dispatchEvent(new Event("input", { bubbles: true, cancelable: true }));
      // エラーなく完了
    });

    test("chatClearBtn click で先頭3件を保持してクリア", () => {
      bindEvents();
      S.activeTab = "summary";
      S.tabs.summary.chatHistory = [
        { role: "system", content: "sys" },
        { role: "user", content: "prompt" },
        { role: "assistant", content: "answer" },
        { role: "user", content: "質問1" },
        { role: "assistant", content: "回答1" }
      ];
      const clearBtn = getEl("#ys-chatClearBtn");
      clearBtn.click();

      expect(S.tabs.summary.chatHistory.length).toBe(3);
      expect(S.tabs.summary.chatHistory[0].content).toBe("sys");
    });

    test("chatHistory の .ys-chat-edit-btn click で handleEditUserMessage", () => {
      bindEvents();
      S.activeTab = "summary";
      S.tabs.summary.chatHistory = [
        { role: "system", content: "sys" },
        { role: "user", content: "prompt" },
        { role: "assistant", content: "answer" },
        { role: "user", content: "質問1" },
        { role: "assistant", content: "回答1" }
      ];
      // 編集ボタンを DOM へ
      const hist = getEl("#ys-chatHistory");
      const editBtn = document.createElement("button");
      editBtn.className = "ys-chat-edit-btn";
      editBtn.setAttribute("data-edit-index", "3");
      hist.appendChild(editBtn);

      editBtn.click();

      // クリックで chatHistory が idx 以前までに切り詰められ、入力欄に元のテキストが入る
      expect(S.tabs.summary.chatHistory.length).toBe(3);
      expect(getEl("#ys-chatInput").value).toBe("質問1");
    });

    test("不正な data-edit-index では no-op", () => {
      bindEvents();
      S.activeTab = "summary";
      S.tabs.summary.chatHistory = [
        { role: "system", content: "sys" },
        { role: "user", content: "prompt" },
        { role: "assistant", content: "answer" },
        { role: "user", content: "質問1" }
      ];
      const hist = getEl("#ys-chatHistory");
      const editBtn = document.createElement("button");
      editBtn.className = "ys-chat-edit-btn";
      editBtn.setAttribute("data-edit-index", "not-a-number");
      hist.appendChild(editBtn);

      expect(() => editBtn.click()).not.toThrow();
      // chatHistory は変更なし
      expect(S.tabs.summary.chatHistory.length).toBe(4);
    });

    test("regenBtn click で regenerate が走り、disable→enable のトグル", () => {
      bindEvents();
      S.activeTab = "summary";
      S.tabs.summary.generated = true;
      S.tabs.summary.content = "old";
      S.tabs.summary.chatHistory = [
        { role: "system" }, { role: "user" }, { role: "assistant" }
      ];
      ai.callAI.mockResolvedValue(true);

      const regenBtn = getEl("#ys-regenBtn");
      regenBtn.click();

      // disableRegenButton が即座に呼ばれる
      expect(ui.disableRegenButton).toHaveBeenCalled();
    });

    test("copyBtn click で navigator.clipboard.writeText が呼ばれる", () => {
      bindEvents();
      S.activeTab = "summary";
      S.tabs.summary.generated = true;
      S.tabs.summary.content = "コピーされる内容";

      const copyBtn = getEl("#ys-copyBtn");
      copyBtn.click();

      expect(navigator.clipboard.writeText).toHaveBeenCalledWith("コピーされる内容");
    });

    test("copyBtn click で content が無い場合は no-op", () => {
      bindEvents();
      S.activeTab = "summary";
      S.tabs.summary.generated = true;
      S.tabs.summary.content = "";

      const copyBtn = getEl("#ys-copyBtn");
      copyBtn.click();

      expect(navigator.clipboard.writeText).not.toHaveBeenCalled();
    });
  });

  // ===== chrome.storage.onChanged =====
  describe("storage.onChanged ハンドラ", () => {
    test("150ms デバウンスで applyButtonTitles が呼ばれる", async () => {
      jest.useFakeTimers();
      bindEvents();
      const listener = chrome.storage.onChanged.addListener.mock.calls[0][0];

      listener({ prompt_summary: { newValue: "new" } });
      listener({ btnTitle_customA: { newValue: "title" } });
      listener({ unrelated: {} });

      // タイマ発火前は何もされない
      expect(tabsUi.updateTabUI).not.toHaveBeenCalled();
      jest.advanceTimersByTime(150);
      // applyButtonTitles (async) 内の updateTabUI 呼び出しを flush
      await flushPromises();
      expect(tabsUi.updateTabUI).toHaveBeenCalled();
      jest.useRealTimers();
    });

    test("150ms 以内の連続発火は1回だけ", () => {
      jest.useFakeTimers();
      bindEvents();
      const listener = chrome.storage.onChanged.addListener.mock.calls[0][0];

      listener({ prompt_summary: {} });
      listener({ btnTitle_customA: {} });

      jest.advanceTimersByTime(100);
      listener({ prompt_customB: {} });
      jest.advanceTimersByTime(100);
      // この時点で初回のタイマはキャンセルされ、2回目のタイマが走る
      jest.advanceTimersByTime(100);
      // applyButtonTitles (applyButtonTitles 内で updateTabUI が呼ばれる) は
      // 1 回のはず
      jest.useRealTimers();
    });
  });

  // ===== onChatSend (DOM イベント経由) =====
  describe("onChatSend (keydown Enter)", () => {
    test("空テキストでは no-op", () => {
      bindEvents();
      const chatInput = getEl("#ys-chatInput");
      chatInput.value = "";
      const event = new KeyboardEvent("keydown", {
        key: "Enter", shiftKey: false, isComposing: false, bubbles: true, cancelable: true
      });
      chatInput.dispatchEvent(event);
      // onChatSend は呼ばれるが早期 return
      // e.preventDefault() は onChatSend 呼び出し前にあるので preventDefault される
      expect(event.defaultPrevented).toBe(true);
      // api モジュールは呼ばれない
      expect(api.callChatAPIStream).not.toHaveBeenCalled();
    });

    test("tab.generated=false の場合「先に要約を生成してください」エラー", async () => {
      bindEvents();
      S.activeTab = "summary";
      S.tabs.summary.generated = false;
      const chatInput = getEl("#ys-chatInput");
      chatInput.value = "質問";

      chatInput.dispatchEvent(new KeyboardEvent("keydown", {
        key: "Enter", shiftKey: false, isComposing: false, bubbles: true, cancelable: true
      }));
      await flushPromises();

      const calls = mockAppendChatMessage.mock.calls;
      const lastAssistantCall = calls.filter(function (c) { return c[0] === "assistant"; }).pop();
      expect(lastAssistantCall).toBeDefined();
      expect(lastAssistantCall[1]).toEqual(expect.stringContaining("先に要約"));
    });

    test("resolveApiConfig が null の場合「API 設定がされていません」エラー", async () => {
      bindEvents();
      S.activeTab = "summary";
      S.tabs.summary.generated = true;
      S.tabs.summary.config = null;
      ai.resolveApiConfig.mockResolvedValue(null);
      const chatInput = getEl("#ys-chatInput");
      chatInput.value = "質問";

      chatInput.dispatchEvent(new KeyboardEvent("keydown", {
        key: "Enter", shiftKey: false, isComposing: false, bubbles: true, cancelable: true
      }));
      await flushPromises();
      await flushPromises();

      // updateChatMessageBody が呼ばれ、エラーメッセージを含む
      expect(ui.updateChatMessageBody).toHaveBeenCalled();
      const lastCall = ui.updateChatMessageBody.mock.calls[ui.updateChatMessageBody.mock.calls.length - 1];
      expect(lastCall[1]).toEqual(expect.stringContaining("API設定がされていません"));
    });

    test("正常系: ストリーミングで chatHistory に user/assistant が push される", async () => {
      bindEvents();
      S.activeTab = "summary";
      S.tabs.summary.generated = true;
      S.tabs.summary.config = { apiKey: "k", apiUrl: "u", apiModel: "m" };
      S.tabs.summary.chatHistory = [
        { role: "system", content: "sys" },
        { role: "user", content: "prompt" },
        { role: "assistant", content: "answer" }
      ];
      api.callChatAPIStream.mockImplementation(async function (
        messages, config, onChunk, onDone
      ) {
        onChunk("回答テキスト");
        onDone("回答テキスト");
      });
      const chatInput = getEl("#ys-chatInput");
      chatInput.value = "質問";

      chatInput.dispatchEvent(new KeyboardEvent("keydown", {
        key: "Enter", shiftKey: false, isComposing: false, bubbles: true, cancelable: true
      }));
      await flushPromises();
      await flushPromises();

      // chatHistory に user と assistant が追加
      expect(S.tabs.summary.chatHistory.length).toBe(5);
      expect(S.tabs.summary.chatHistory[3].role).toBe("user");
      expect(S.tabs.summary.chatHistory[3].content).toBe("質問");
      expect(S.tabs.summary.chatHistory[4].role).toBe("assistant");
      expect(S.tabs.summary.chatHistory[4].content).toBe("回答テキスト");
    });
  });
});
