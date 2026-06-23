// tests/message-handler.test.js — content/ui/message-handler.js
// chrome.runtime.onMessage リスナーの 4 つの action 分岐を検証。

// 依存モジュールをモック
jest.mock("../src/content/ui/panel.js", () => ({
  createPanel: jest.fn()
}));
jest.mock("../src/content/ui/tabs.js", () => ({
  bindEvents: jest.fn(),
  applyButtonTitles: jest.fn().mockResolvedValue(undefined),
  switchTab: jest.fn().mockResolvedValue(true)
}));
jest.mock("../src/content/ui/appearance.js", () => ({
  applyFontSize: jest.fn().mockResolvedValue(undefined),
  applyTheme: jest.fn().mockResolvedValue(undefined)
}));
jest.mock("../src/domain/transcript.js", () => ({
  preloadTranscript: jest.fn().mockResolvedValue({ all: ["x"] }),
  fetchTranscript: jest
    .fn()
    .mockResolvedValue({ all: ["a", "b"], player: [], meta: { title: "t" } })
}));

const { uiState: S } = require("../src/shared/state");
const panel = require("../src/content/ui/panel");
const tabs = require("../src/content/ui/tabs");
const appearance = require("../src/content/ui/appearance");
const transcript = require("../src/domain/transcript");

// chrome.runtime.onMessage.addListener をモックして登録された listener を保持
const mockAddListener = jest.fn();
global.chrome = {
  runtime: { onMessage: { addListener: mockAddListener } }
};

// モジュール読み込み（リスナー登録が走る）
require("../src/content/ui/message-handler");

// 登録された listener をモジュールロード時に保持
// （clearAllMocks で消えないよう、別変数に保存）
const registeredListener = mockAddListener.mock.calls[0][0];

function getRegisteredListener() {
  return registeredListener;
}

describe("message-handler", () => {
  beforeEach(() => {
    // clearAllMocks は registeredListener には影響しない（別変数に保存済み）
    jest.clearAllMocks();
    S.panelEl = null;
  });

  describe("ysPing", () => {
    test("{ alive: true } を返す", () => {
      const listener = getRegisteredListener();
      const sendResponse = jest.fn();
      listener({ action: "ysPing" }, {}, sendResponse);
      expect(sendResponse).toHaveBeenCalledWith({ alive: true });
    });
  });

  describe("ysGetTranscript", () => {
    test("パネル未生成 → createPanel / bindEvents / applyFontSize / applyTheme 呼ばれる", async () => {
      S.panelEl = null;
      // createPanel のモックが S.panelEl を設定するよう拡張
      panel.createPanel.mockImplementationOnce(function () {
        S.panelEl = document.createElement("div");
        return S.panelEl;
      });
      const listener = getRegisteredListener();
      const sendResponse = jest.fn();

      listener({ action: "ysGetTranscript" }, {}, sendResponse);

      // 非同期応答なので待つ
      await new Promise(function (r) {
        setTimeout(r, 0);
      });

      expect(panel.createPanel).toHaveBeenCalled();
      expect(tabs.bindEvents).toHaveBeenCalled();
      expect(appearance.applyFontSize).toHaveBeenCalled();
      expect(appearance.applyTheme).toHaveBeenCalled();
      expect(transcript.fetchTranscript).toHaveBeenCalled();
      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          transcript: ["a", "b"],
          player: [],
          meta: { title: "t" }
        })
      );
    });

    test("パネル生成済 → createPanel は呼ばれない、表示は維持", async () => {
      const root = document.createElement("div");
      root.id = "yt-summary-root";
      root.style.display = "none";
      S.panelEl = root;

      const listener = getRegisteredListener();
      const sendResponse = jest.fn();
      listener({ action: "ysGetTranscript" }, {}, sendResponse);

      await new Promise(function (r) {
        setTimeout(r, 0);
      });

      expect(panel.createPanel).not.toHaveBeenCalled();
      expect(root.style.display).toBe("");
    });

    test("字幕が空配列 → エラーレスポンスを返す", async () => {
      transcript.fetchTranscript.mockResolvedValueOnce({ all: [], player: [] });
      S.panelEl = document.createElement("div");

      const listener = getRegisteredListener();
      const sendResponse = jest.fn();
      listener({ action: "ysGetTranscript" }, {}, sendResponse);

      await new Promise(function (r) {
        setTimeout(r, 0);
      });

      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.stringContaining("字幕が見つかりません"),
          transcript: [],
          player: []
        })
      );
    });

    test("fetchTranscript が例外を投げた場合はエラーメッセージを返す", async () => {
      transcript.fetchTranscript.mockRejectedValueOnce(new Error("transcript error"));
      S.panelEl = document.createElement("div");

      const listener = getRegisteredListener();
      const sendResponse = jest.fn();
      listener({ action: "ysGetTranscript" }, {}, sendResponse);

      await new Promise(function (r) {
        setTimeout(r, 0);
      });

      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          error: "transcript error",
          transcript: [],
          player: []
        })
      );
    });

    test("return true（非同期応答フラグ）を返す", () => {
      S.panelEl = document.createElement("div");
      const listener = getRegisteredListener();
      const result = listener({ action: "ysGetTranscript" }, {}, jest.fn());
      expect(result).toBe(true);
    });
  });

  describe("ysForcePanel", () => {
    test("パネル未生成 → createPanel / bindEvents / applyFontSize / applyTheme 呼ばれる", async () => {
      S.panelEl = null;
      // createPanel のモックが S.panelEl を設定するよう拡張
      panel.createPanel.mockImplementationOnce(function () {
        S.panelEl = document.createElement("div");
        return S.panelEl;
      });
      const listener = getRegisteredListener();
      const sendResponse = jest.fn();

      listener({ action: "ysForcePanel" }, {}, sendResponse);

      await new Promise(function (r) {
        setTimeout(r, 0);
      });

      expect(panel.createPanel).toHaveBeenCalled();
      expect(tabs.bindEvents).toHaveBeenCalled();
      expect(appearance.applyFontSize).toHaveBeenCalled();
      expect(appearance.applyTheme).toHaveBeenCalled();
      expect(transcript.preloadTranscript).toHaveBeenCalled();
      expect(sendResponse).toHaveBeenCalledWith({ done: true });
    });

    test("パネル生成済 → createPanel 等は呼ばれないが、preloadTranscript は呼ぶ", async () => {
      const root = document.createElement("div");
      root.style.display = "none";
      S.panelEl = root;

      const listener = getRegisteredListener();
      const sendResponse = jest.fn();
      listener({ action: "ysForcePanel" }, {}, sendResponse);

      await new Promise(function (r) {
        setTimeout(r, 0);
      });

      expect(panel.createPanel).not.toHaveBeenCalled();
      expect(transcript.preloadTranscript).toHaveBeenCalled();
      expect(sendResponse).toHaveBeenCalledWith({ done: true });
    });

    test("return true", () => {
      S.panelEl = document.createElement("div");
      const listener = getRegisteredListener();
      const result = listener({ action: "ysForcePanel" }, {}, jest.fn());
      expect(result).toBe(true);
    });
  });

  describe("ysTriggerAi", () => {
    test("preloadTranscript 後に switchTab(mode) を呼ぶ", async () => {
      S.panelEl = document.createElement("div");
      const listener = getRegisteredListener();
      const sendResponse = jest.fn();

      listener({ action: "ysTriggerAi", mode: "customA" }, {}, sendResponse);

      await new Promise(function (r) {
        setTimeout(r, 0);
      });

      expect(transcript.preloadTranscript).toHaveBeenCalled();
      expect(tabs.switchTab).toHaveBeenCalledWith("customA");
      expect(sendResponse).toHaveBeenCalledWith({ success: true });
    });

    test("switchTab 失敗時も sendResponse は { success: true } を返す（エラーを握り潰す）", async () => {
      S.panelEl = document.createElement("div");
      tabs.switchTab.mockRejectedValueOnce(new Error("switch failed"));
      const listener = getRegisteredListener();
      const sendResponse = jest.fn();

      listener({ action: "ysTriggerAi", mode: "summary" }, {}, sendResponse);

      await new Promise(function (r) {
        setTimeout(r, 10);
      });

      // switchTab 内部の .catch で握り潰され success:true が返る
      expect(sendResponse).toHaveBeenCalledWith({ success: true });
    });

    test("preloadTranscript 失敗時は { success: false, error }", async () => {
      S.panelEl = document.createElement("div");
      transcript.preloadTranscript.mockRejectedValueOnce(new Error("preload failed"));
      const listener = getRegisteredListener();
      const sendResponse = jest.fn();

      listener({ action: "ysTriggerAi", mode: "summary" }, {}, sendResponse);

      await new Promise(function (r) {
        setTimeout(r, 10);
      });

      expect(sendResponse).toHaveBeenCalledWith({
        success: false,
        error: "preload failed"
      });
    });

    test("return true", () => {
      S.panelEl = document.createElement("div");
      const listener = getRegisteredListener();
      const result = listener({ action: "ysTriggerAi", mode: "summary" }, {}, jest.fn());
      expect(result).toBe(true);
    });
  });

  describe("登録失敗", () => {
    test("モジュールロード時に addListener が呼ばれている（try/catch で包まれている）", () => {
      // モック呼び出し履歴は jest.clearAllMocks でクリア済みだが、
      // registeredListener 変数には listener 参照が保持されている
      expect(typeof registeredListener).toBe("function");
    });
  });
});
