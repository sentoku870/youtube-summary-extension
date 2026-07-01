// tests/chat.test.js — chat.js の単体テスト
const helpers = require("./__helpers__/index.cjs");

helpers.installChromeMock();

const api = require("../src/domain/api");

// UIモジュールをモック化
jest.mock("../src/content/ui/ui.js", () => ({
  appendChatMessage: jest.fn(() => ({ div: null, body: null })),
  appendAssistantPlaceholder: jest.fn(() => ({ div: { dataset: {} }, body: {} })),
  updateChatMessageBody: jest.fn(),
  scrollContentToElement: jest.fn(),
  clearChatHistory: jest.fn(),
  hideProgress: jest.fn()
}));

jest.mock("../src/content/ui/panel.js", () => ({
  getEl: jest.fn()
}));

// state は実物を使う（リセット可能）
const { uiState, sessionState } = require("../src/shared/state");
const panel = require("../src/content/ui/panel");
const ui = require("../src/content/ui/ui");

const {
  abortChatStream,
  onChatSend,
  handleEditUserMessage,
  clearChatHistory,
  handleChatInputResize,
  shouldSubmitOnKey,
  handleChatHistoryClick
} = require("../src/content/ui/chat");

describe("chat", () => {
  beforeEach(() => {
    helpers.resetStates();
    jest.clearAllMocks();
    sessionState.chatBusy = false;
    sessionState.chatAbortController = null;
    sessionState.chatAbortChain = null;
    sessionState.abortController = null;

    // デフォルトでタブをアクティブ化（config 付き）
    uiState.tabs = {
      summary: {
        generated: true,
        content: "old summary",
        config: { apiKey: "k", apiUrl: "u", apiModel: "m" },
        chatHistory: [
          { role: "system", content: "system prompt" },
          { role: "user", content: "Q1" },
          { role: "assistant", content: "A1" }
        ]
      }
    };
    uiState.activeTab = "summary";
  });

  afterAll(() => {
    helpers.uninstallChromeMock();
  });

  describe("abortChatStream", () => {
    test("chatAbortController.abort() を呼ぶ", () => {
      const abort = jest.fn();
      const disconnect = jest.fn();
      sessionState.chatAbortController = { abort };
      sessionState.chatAbortChain = { disconnect };
      abortChatStream();
      expect(abort).toHaveBeenCalled();
      expect(sessionState.chatAbortController).toBe(null);
    });

    test("chatAbortChain.disconnect() を呼ぶ", () => {
      const abort = jest.fn();
      const disconnect = jest.fn();
      sessionState.chatAbortController = { abort };
      sessionState.chatAbortChain = { disconnect };
      abortChatStream();
      expect(disconnect).toHaveBeenCalled();
      expect(sessionState.chatAbortChain).toBe(null);
    });

    test("コントローラが null なら何もしない", () => {
      expect(() => abortChatStream()).not.toThrow();
      expect(sessionState.chatAbortController).toBe(null);
    });
  });

  describe("onChatSend", () => {
    let inputEl;

    beforeEach(() => {
      inputEl = document.createElement("textarea");
      inputEl.id = "ys-chatInput";
      inputEl.value = "テスト質問";
      document.body.appendChild(inputEl);
      panel.getEl.mockImplementation(function (sel) {
        if (sel === "#ys-chatInput") return inputEl;
        return null;
      });
      api.callChatAPIStream = jest.fn();
    });

    test("chatBusy 中は早期 return", async () => {
      sessionState.chatBusy = true;
      await onChatSend();
      expect(api.callChatAPIStream).not.toHaveBeenCalled();
    });

    test("空テキストでは送信しない", async () => {
      inputEl.value = "   ";
      await onChatSend();
      expect(api.callChatAPIStream).not.toHaveBeenCalled();
    });

    test("getEl が null の場合は早期 return", async () => {
      panel.getEl.mockReturnValue(null);
      await onChatSend();
      expect(api.callChatAPIStream).not.toHaveBeenCalled();
    });

    test("タブが未生成の場合はエラー表示して return", async () => {
      uiState.tabs.summary.generated = false;
      ui.appendChatMessage.mockReturnValue(null);
      await onChatSend();
      expect(ui.appendChatMessage).toHaveBeenCalledWith(
        "assistant",
        expect.stringContaining("先に要約・分析を生成してください")
      );
      expect(api.callChatAPIStream).not.toHaveBeenCalled();
    });

    test("正常系: 質問が chatHistory に push されて API 呼び出し", async () => {
      api.callChatAPIStream.mockReset();
      api.callChatAPIStream.mockImplementation(async function (msgs, _cfg, onChunk, onDone) {
        if (onChunk) onChunk("AI回答");
        if (onDone) onDone("AI回答");
      });
      await onChatSend();
      // chatHistory に user が追加される
      const hist = uiState.tabs.summary.chatHistory;
      const lastUser = hist.filter((m) => m.role === "user").pop();
      expect(lastUser.content).toBe("テスト質問");
      // assistant も追加される
      const lastAssistant = hist.filter((m) => m.role === "assistant").pop();
      expect(lastAssistant.content).toBe("AI回答");
    });

    test("tab.config があり apiKey があるならそのまま使用", async () => {
      uiState.tabs.summary.config = { apiKey: "k", apiUrl: "u", apiModel: "m" };
      api.callChatAPIStream.mockResolvedValue(undefined);
      await onChatSend();
      // resolveApiConfig は呼ばれない
      expect(api.callChatAPIStream).toHaveBeenCalledWith(
        expect.any(Array),
        expect.objectContaining({ apiKey: "k" }),
        expect.any(Function),
        expect.any(Function),
        expect.any(Object)
      );
    });

    test("tab.config がない場合は resolveApiConfig を呼ぶ", async () => {
      // resolveApiConfig をモジュールキャッシュから差し替え
      const ai = require("../src/domain/ai");
      const original = ai.resolveApiConfig;
      ai.resolveApiConfig = jest
        .fn()
        .mockResolvedValue({ apiKey: "new", apiUrl: "u", apiModel: "m" });
      uiState.tabs.summary.config = null;
      api.callChatAPIStream.mockReset();
      api.callChatAPIStream.mockImplementation(async function (_m, _c, onChunk, onDone) {
        if (onChunk) onChunk("OK");
        if (onDone) onDone("OK");
      });
      try {
        await onChatSend();
        expect(api.callChatAPIStream).toHaveBeenCalledWith(
          expect.any(Array),
          expect.objectContaining({ apiKey: "new" }),
          expect.any(Function),
          expect.any(Function),
          expect.any(Object)
        );
      } finally {
        ai.resolveApiConfig = original;
      }
    });

    test("resolveApiConfig が null の場合はプレースホルダーにエラー表示", async () => {
      const ai = require("../src/domain/ai");
      const original = ai.resolveApiConfig;
      ai.resolveApiConfig = jest.fn().mockResolvedValue(null);
      uiState.tabs.summary.config = null;
      api.callChatAPIStream.mockReset();
      try {
        await onChatSend();
        expect(ui.updateChatMessageBody).toHaveBeenCalledWith(
          expect.anything(),
          expect.stringMatching(/API設定がされていません/)
        );
      } finally {
        ai.resolveApiConfig = original;
      }
    });

    test("DOMException AbortError は catch して無視", async () => {
      api.callChatAPIStream.mockRejectedValue(
        Object.assign(new Error("aborted"), { name: "AbortError" })
      );
      await expect(onChatSend()).resolves.not.toThrow();
    });

    // ★ B-2: 文字列に「中断」が含まれていても、YsAbortError / DOMException
    // AbortError のいずれの型でもないなら通常エラーとして表示する
    // （旧実装の文字列マッチ判定を廃止）。
    test("エラーメッセージに「中断」が含まれていても、型不一致ならエラー表示する", async () => {
      uiState.tabs.summary.config = { apiKey: "k", apiUrl: "u", apiModel: "m" };
      api.callChatAPIStream.mockRejectedValue(new Error("ユーザーによって中断されました"));
      await onChatSend();
      expect(ui.updateChatMessageBody).toHaveBeenCalledWith(
        expect.anything(),
        expect.stringMatching(/\[エラー\].*中断/)
      );
    });

    test("その他のエラーはプレースホルダーにエラー表示", async () => {
      uiState.tabs.summary.config = { apiKey: "k", apiUrl: "u", apiModel: "m" };
      api.callChatAPIStream.mockRejectedValue(new Error("API error"));
      await onChatSend();
      expect(ui.updateChatMessageBody).toHaveBeenCalledWith(
        expect.anything(),
        expect.stringMatching(/\[エラー\].*API error/)
      );
    });

    test("finally で chatBusy が false に戻る", async () => {
      uiState.tabs.summary.config = { apiKey: "k", apiUrl: "u", apiModel: "m" };
      api.callChatAPIStream.mockImplementation(async function (_m, _c, onChunk, onDone) {
        if (onChunk) onChunk("OK");
        if (onDone) onDone("OK");
      });
      await onChatSend();
      expect(sessionState.chatBusy).toBe(false);
    });

    test("finally で input.readOnly が false に戻り focus される", async () => {
      uiState.tabs.summary.config = { apiKey: "k", apiUrl: "u", apiModel: "m" };
      api.callChatAPIStream.mockResolvedValue(undefined);
      await onChatSend();
      expect(inputEl.readOnly).toBe(false);
    });
  });

  describe("handleEditUserMessage", () => {
    test("chatBusy 中は早期 return", () => {
      sessionState.chatBusy = true;
      const idx = 1;
      handleEditUserMessage(idx);
      // chatHistory は変更されない
      expect(uiState.tabs.summary.chatHistory.length).toBe(3);
    });

    test("存在しないタブの場合は早期 return", () => {
      uiState.activeTab = "nonexistent";
      expect(() => handleEditUserMessage(0)).not.toThrow();
    });

    test("該当 idx 以降の chatHistory を削除し、入力欄に元のテキストをセット", () => {
      const inputEl = document.createElement("textarea");
      inputEl.id = "ys-chatInput";
      document.body.appendChild(inputEl);
      panel.getEl.mockReturnValue(inputEl);
      const initialLen = uiState.tabs.summary.chatHistory.length; // 3
      handleEditUserMessage(1);
      // インデックス 1 (Q1) 以降が削除され、Q1のテキストが入力欄に
      expect(uiState.tabs.summary.chatHistory.length).toBeLessThan(initialLen);
      expect(inputEl.value).toBe("Q1");
    });

    test("originalMsg が undefined でもクラッシュしない", () => {
      const inputEl = document.createElement("textarea");
      inputEl.id = "ys-chatInput";
      document.body.appendChild(inputEl);
      panel.getEl.mockReturnValue(inputEl);
      handleEditUserMessage(99); // 存在しない index
      expect(inputEl.value).toBe("");
    });

    test("abortChatStream を呼ぶ", () => {
      const inputEl = document.createElement("textarea");
      document.body.appendChild(inputEl);
      panel.getEl.mockReturnValue(inputEl);
      const abort = jest.fn();
      sessionState.chatAbortController = { abort };
      handleEditUserMessage(1);
      expect(abort).toHaveBeenCalled();
    });
  });

  describe("clearChatHistory", () => {
    let inputEl;

    beforeEach(() => {
      inputEl = document.createElement("textarea");
      inputEl.id = "ys-chatInput";
      document.body.appendChild(inputEl);
      const historyEl = document.createElement("div");
      historyEl.id = "ys-chatHistory";
      document.body.appendChild(historyEl);
      panel.getEl.mockImplementation(function (sel) {
        if (sel === "#ys-chatHistory") return historyEl;
        if (sel === "#ys-chatInput") return inputEl;
        return null;
      });
    });

    test("chatBusy 中は早期 return", () => {
      sessionState.chatBusy = true;
      const initialLen = uiState.tabs.summary.chatHistory.length;
      clearChatHistory();
      expect(uiState.tabs.summary.chatHistory.length).toBe(initialLen);
    });

    test("CHAT_HISTORY_SEED_LENGTH (3) 件を残して残りを削除", () => {
      // chatHistory: [system, user, assistant] → そのまま残る
      clearChatHistory();
      expect(uiState.tabs.summary.chatHistory.length).toBe(3);
    });

    test("4件以上の場合は最初の3件のみ残す", () => {
      uiState.tabs.summary.chatHistory.push({ role: "user", content: "Q2" });
      clearChatHistory();
      expect(uiState.tabs.summary.chatHistory.length).toBe(3);
    });

    test("入力欄をクリアして focus", () => {
      inputEl.value = "some text";
      clearChatHistory();
      expect(inputEl.value).toBe("");
    });

    test("getEl が null の場合はクラッシュしない", () => {
      panel.getEl.mockReturnValue(null);
      expect(() => clearChatHistory()).not.toThrow();
    });
  });

  describe("handleChatInputResize", () => {
    test("getEl(null) でも例外を投げない", () => {
      expect(() => handleChatInputResize(null)).not.toThrow();
    });

    test("高さをリセット（auto → scrollHeight または max-height）", () => {
      const el = document.createElement("textarea");
      el.style.height = "100px";
      handleChatInputResize(el);
      // jsdom では getComputedStyle().maxHeight が "" のため scrollHeight が使われる。
      // scrollHeight は 0 を返すので、結果は "0px"。
      // ここでは "100px" ではないこと（= 高さが再計算された）だけを確認。
      expect(el.style.height).not.toBe("100px");
    });
  });

  describe("shouldSubmitOnKey", () => {
    test("Enter キー (Shiftなし、IMEなし、readOnlyなし) → true", () => {
      const e = { key: "Enter", shiftKey: false, isComposing: false };
      const el = { readOnly: false };
      expect(shouldSubmitOnKey(e, el)).toBe(true);
    });

    test("Shift+Enter → false (改行)", () => {
      const e = { key: "Enter", shiftKey: true, isComposing: false };
      const el = { readOnly: false };
      expect(shouldSubmitOnKey(e, el)).toBe(false);
    });

    test("IME 変換中 (isComposing=true) → false", () => {
      const e = { key: "Enter", shiftKey: false, isComposing: true };
      const el = { readOnly: false };
      expect(shouldSubmitOnKey(e, el)).toBe(false);
    });

    test("readOnly=true (送信中) → false", () => {
      const e = { key: "Enter", shiftKey: false, isComposing: false };
      const el = { readOnly: true };
      expect(shouldSubmitOnKey(e, el)).toBe(false);
    });

    test("Enter 以外のキー → false", () => {
      const e = { key: "a", shiftKey: false, isComposing: false };
      const el = { readOnly: false };
      expect(shouldSubmitOnKey(e, el)).toBe(false);
    });
  });

  describe("handleChatHistoryClick", () => {
    test("編集ボタン以外をクリック → false", () => {
      const e = { target: document.createElement("div") };
      expect(handleChatHistoryClick(e)).toBe(false);
    });

    test("data-edit-index がない編集ボタン → false", () => {
      const btn = document.createElement("button");
      btn.className = "ys-chat-edit-btn";
      btn.setAttribute("data-edit-index", "abc");
      const e = { target: btn };
      expect(handleChatHistoryClick(e)).toBe(false);
    });

    test("data-edit-index 付きの編集ボタン → handleEditUserMessage が呼ばれる", () => {
      const inputEl = document.createElement("textarea");
      inputEl.id = "ys-chatInput";
      document.body.appendChild(inputEl);
      panel.getEl.mockReturnValue(inputEl);

      const btn = document.createElement("button");
      btn.className = "ys-chat-edit-btn";
      btn.setAttribute("data-edit-index", "1");
      const e = { target: btn };

      const result = handleChatHistoryClick(e);
      expect(result).toBe(true);
      expect(inputEl.value).toBe("Q1");
    });
  });
});
