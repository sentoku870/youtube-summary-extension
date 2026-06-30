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
});
