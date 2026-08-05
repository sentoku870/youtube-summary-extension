// tests/content-index.test.js — content/index.js のエントリポイントテスト
// 役割: Port/Adapter 注入と初期化ライフサイクルが正しく動作することを確認。
// SPA 検出のロジックテストは tests/navigation.test.js に分離した。

const helpers = require("./__helpers__/index.cjs");

helpers.installChromeMock();
helpers.setupYouTubeWatchDom();

// waitForYtdApp() は document.querySelector("ytd-app") を待つ。
// テストでは ytd-app を body 直下に置いて即時コールバックを起動させる。
const ytdApp = document.createElement("ytd-app");
document.body.insertBefore(ytdApp, document.body.firstChild);

const { clearAll } = require("../src/shared/event-bus");
const { uiState: _uiState, sessionState: _sessionState } = require("../src/shared/state");
const ports = require("../src/domain/ports");

// 依存モジュールをモック化
jest.mock("../src/content/navigation.js", () => ({
  startNavigationDetection: jest.fn(),
  resetTranscript: jest.fn(),
  __resetNavigationForTest: jest.fn()
}));
jest.mock("../src/content/ui/panel.js", () => ({
  getEl: jest.fn(),
  enableAllButtons: jest.fn(),
  createPanel: jest.fn()
}));
jest.mock("../src/content/ui/tabs-events.js", () => ({
  bindEvents: jest.fn()
}));
jest.mock("../src/content/ui/tabs.js", () => ({
  updateTabUI: jest.fn(),
  updateTabActive: jest.fn(),
  switchTab: jest.fn(),
  applyButtonTitles: jest.fn()
}));
jest.mock("../src/content/ui/event-bridge.js", () => ({}));
jest.mock("../src/content/ui/message-handler.js", () => ({}));
jest.mock("../src/domain/transcript.js", () => ({
  preloadTranscript: jest.fn().mockResolvedValue({ all: ["x"] })
}));

// location をスタブ化
delete window.location;
window.location = {
  href: "https://www.youtube.com/watch?v=test",
  hash: ""
};

describe("content/index.js — エントリポイント", () => {
  // index.js の副作用（Port/Adapter 注入 + startNavigationDetection 呼び出し）は
  // モジュール初回 require 時に 1 度だけ実行される。beforeAll で固定的にロード。
  let nav;
  beforeAll(() => {
    require("../src/content/index.js");
    nav = require("../src/content/navigation");
  });

  beforeEach(() => {
    clearAll();
    helpers.resetStates();
    // 注: jest.clearAllMocks() を呼ばない。index.js の副作用は
    // beforeAll で 1 度だけ走り、副作用検証のテストはそれを観察する。
  });

  test("Port/Adapter: setUiAdapter が呼ばれ、UI 関数がバインドされる", () => {
    const adapter = ports.getUiAdapter();
    expect(typeof adapter.showError).toBe("function");
    expect(typeof adapter.hideProgress).toBe("function");
    expect(typeof adapter.showProgress).toBe("function");
    expect(typeof adapter.setSummaryContent).toBe("function");
    expect(typeof adapter.clearSummaryContent).toBe("function");
    expect(typeof adapter.updateInfoLabel).toBe("function");
    expect(typeof adapter.showChatArea).toBe("function");
    expect(typeof adapter.focusChatInput).toBe("function");
    expect(typeof adapter.showCopyButton).toBe("function");
    expect(typeof adapter.showRegenButton).toBe("function");
    expect(typeof adapter.hideError).toBe("function");
    expect(typeof adapter.getSummaryTextEl).toBe("function");
    expect(typeof adapter.updateTabUI).toBe("function");
  });

  test("副作用: startNavigationDetection が safeInit とともに呼ばれる", () => {
    // beforeAll で isolateModules 内で require したため、副作用が 1 度だけ走り、
    // モックには呼び出し記録が残っている。
    expect(nav.startNavigationDetection).toHaveBeenCalled();
    // 第1引数に safeInit（関数）が渡される
    const arg = nav.startNavigationDetection.mock.calls[0][0];
    expect(typeof arg).toBe("function");
  });

  // ===== safeInit ガード =====
  describe("safeInit() 初期化ガード", () => {
    // safeInit() はモジュール副作用では呼び出されない（DOMContentLoaded 的な経路がない）。
    // startNavigationDetection に渡されたコールバック経由でテストする。
    function getSafeInit() {
      return nav.startNavigationDetection.mock.calls[0][0];
    }

    test("1 回目: createPanel + bindEvents が呼ばれる", async () => {
      const safeInit = getSafeInit();
      // 初期化ガードをリセット
      const { uiState: uiStateRef } = require("../src/shared/state");
      uiStateRef.initialized = false;
      uiStateRef.lastInitTime = 0;
      uiStateRef.panelEl = null;
      uiStateRef.eventsBound = false;
      // 副作用モジュールを取得
      const panel = require("../src/content/ui/panel");
      const tabsEvents = require("../src/content/ui/tabs-events");
      panel.createPanel.mockClear();
      tabsEvents.bindEvents.mockClear();

      await safeInit();

      expect(panel.createPanel).toHaveBeenCalledTimes(1);
      expect(tabsEvents.bindEvents).toHaveBeenCalledTimes(1);
    });

    test("2 回目: uiState.initialized フラグで no-op", async () => {
      const safeInit = getSafeInit();
      const { uiState: uiStateRef } = require("../src/shared/state");
      uiStateRef.initialized = true;
      uiStateRef.lastInitTime = 0;
      const panel = require("../src/content/ui/panel");
      panel.createPanel.mockClear();

      await safeInit();

      expect(panel.createPanel).not.toHaveBeenCalled();
    });

    test("短時間再呼出: タイムスタンプガードで no-op", async () => {
      const safeInit = getSafeInit();
      const { uiState: uiStateRef } = require("../src/shared/state");
      uiStateRef.initialized = false;
      uiStateRef.lastInitTime = Date.now(); // 直前に初期化済み
      const panel = require("../src/content/ui/panel");
      panel.createPanel.mockClear();

      await safeInit();

      expect(panel.createPanel).not.toHaveBeenCalled();
    });

    test("createPanel が throw してもクラッシュしない", async () => {
      const safeInit = getSafeInit();
      const { uiState: uiStateRef } = require("../src/shared/state");
      uiStateRef.initialized = false;
      uiStateRef.lastInitTime = 0;
      uiStateRef.panelEl = null;
      const panel = require("../src/content/ui/panel");
      panel.createPanel.mockImplementationOnce(function () {
        throw new Error("boom");
      });

      // safeInit は throw せず Promise を返す（内部で catch される）
      // 戻り値は throw 前段で false がセット済みなので何でもよい
      await safeInit();
      // クラッシュしなかったことだけ確認
    });
  });

  // ===== preloadTranscript ライフサイクル =====
  describe("transcript プリロード", () => {
    test("未プリロードなら preloadTranscript を呼ぶ", async () => {
      const safeInit = nav.startNavigationDetection.mock.calls[0][0];
      const { uiState: uiStateRef, sessionState: sessionStateRef } = require("../src/shared/state");
      uiStateRef.initialized = false;
      uiStateRef.lastInitTime = 0;
      uiStateRef.panelEl = null;
      uiStateRef.eventsBound = false;
      sessionStateRef.transcriptReady = false;
      sessionStateRef.preloadedTranscript = null;
      const transcript = require("../src/domain/transcript");
      transcript.preloadTranscript.mockClear();

      await safeInit();

      expect(transcript.preloadTranscript).toHaveBeenCalled();
    });

    test("プリロード済みなら preloadTranscript を呼ばない", async () => {
      const safeInit = nav.startNavigationDetection.mock.calls[0][0];
      const { uiState: uiStateRef, sessionState: sessionStateRef } = require("../src/shared/state");
      uiStateRef.initialized = false;
      uiStateRef.lastInitTime = 0;
      uiStateRef.panelEl = null;
      uiStateRef.eventsBound = false;
      sessionStateRef.transcriptReady = true;
      sessionStateRef.preloadedTranscript = { all: ["x"] };
      const transcript = require("../src/domain/transcript");
      transcript.preloadTranscript.mockClear();

      await safeInit();

      expect(transcript.preloadTranscript).not.toHaveBeenCalled();
    });
  });
});
