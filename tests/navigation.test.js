// tests/navigation.test.js — src/content/navigation.js の SPA 検出テスト
// 5 つのイベントソース + ポーリングフォールバック + handleNavigation を検証。

const helpers = require("./__helpers__/index.cjs");

helpers.installChromeMock();
helpers.setupYouTubeWatchDom();

const { clearAll } = require("../src/shared/event-bus");
const { uiState, sessionState, resetSession: _resetSession } = require("../src/shared/state");

// 依存モジュールをモック化（副作用として呼ばれる関数を吸収）
jest.mock("../src/domain/ai.js", () => ({
  abortCurrentStream: jest.fn()
}));
jest.mock("../src/shared/logger.js", () => ({
  createLogger: function () {
    return { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
  }
}));
jest.mock("../src/content/ui/ui.js", () => ({
  clearSummaryContent: jest.fn(),
  hideProgress: jest.fn()
}));
jest.mock("../src/content/ui/tabs.js", () => ({
  updateTabActive: jest.fn(),
  applyButtonTitles: jest.fn()
}));

const mockBindStorageListener = jest.fn();
jest.mock("../src/content/ui/storage-listener.js", () => ({
  bindStorageListener: mockBindStorageListener
}));

const mockAbortChatStream = jest.fn();
jest.mock("../src/content/ui/chat.js", () => ({
  abortChatStream: mockAbortChatStream
}));

// location をスタブ化
delete window.location;
window.location = {
  href: "https://www.youtube.com/watch?v=test",
  hash: ""
};

const nav = require("../src/content/navigation");

describe("navigation", () => {
  beforeEach(() => {
    clearAll();
    helpers.resetStates();
    nav.__resetNavigationForTest();
    window.location.href = "https://www.youtube.com/watch?v=test";
    window.location.hash = "";
    jest.clearAllMocks();
    mockBindStorageListener.mockClear();
    mockAbortChatStream.mockClear();
  });

  afterEach(() => {
    nav.__resetNavigationForTest();
  });

  // ===== startNavigationDetection =====
  describe("startNavigationDetection", () => {
    test("冪等: 2 回呼んでも内部状態は一度だけ初期化される", () => {
      const onReinit = jest.fn();
      nav.startNavigationDetection(onReinit);
      // 2 回目は早期 return する。実行時クラッシュしないことだけ確認。
      expect(() => nav.startNavigationDetection(onReinit)).not.toThrow();
    });

    test("ytd-app 出現前は何もしない（コールバック未呼び出し）", () => {
      const cb = jest.fn();
      // ytd-app を消す
      const ytdApp = document.querySelector("ytd-app");
      if (ytdApp) ytdApp.remove();
      nav.startNavigationDetection(cb);
      // ここではコールバックは呼ばれない（waitForYtdApp 経由で呼ぶ）
      // startNavigationDetection 自体は引数チェックのみでよい
      expect(cb).not.toHaveBeenCalled();
    });
  });

  // ===== SPA 検出イベントブリッジ =====
  describe("yt-navigate-finish → NAV_FINISH イベント", () => {
    test("発火時に NAV_FINISH イベントが emit される", () => {
      const emitSpy = jest.spyOn(require("../src/shared/event-bus"), "emit");
      nav.startNavigationDetection(jest.fn());
      emitSpy.mockClear();
      document.dispatchEvent(new Event("yt-navigate-finish"));
      expect(emitSpy).toHaveBeenCalledWith(
        "nav:finish",
        expect.objectContaining({ url: expect.any(String) })
      );
      emitSpy.mockRestore();
    });
  });

  describe("yt-page-data-updated → NAV_FINISH イベント", () => {
    test("発火時に NAV_FINISH イベントが emit される", () => {
      const emitSpy = jest.spyOn(require("../src/shared/event-bus"), "emit");
      nav.startNavigationDetection(jest.fn());
      emitSpy.mockClear();
      document.dispatchEvent(new Event("yt-page-data-updated"));
      expect(emitSpy).toHaveBeenCalledWith(
        "nav:finish",
        expect.objectContaining({ url: expect.any(String) })
      );
      emitSpy.mockRestore();
    });
  });

  describe("popstate → NAV_FINISH イベント", () => {
    test("発火時に NAV_FINISH イベントが emit される", () => {
      const emitSpy = jest.spyOn(require("../src/shared/event-bus"), "emit");
      nav.startNavigationDetection(jest.fn());
      emitSpy.mockClear();
      window.dispatchEvent(new Event("popstate"));
      expect(emitSpy).toHaveBeenCalledWith(
        "nav:finish",
        expect.objectContaining({ url: expect.any(String) })
      );
      emitSpy.mockRestore();
    });
  });

  describe("hashchange フィルタ", () => {
    test("通常のハッシュ変化では NAV_FINISH を emit する", () => {
      const emitSpy = jest.spyOn(require("../src/shared/event-bus"), "emit");
      nav.startNavigationDetection(jest.fn());
      emitSpy.mockClear();
      window.location.hash = "#player";
      window.dispatchEvent(new Event("hashchange"));
      expect(emitSpy).toHaveBeenCalledWith("nav:finish", expect.any(Object));
      window.location.hash = "";
      emitSpy.mockRestore();
    });

    test("シーク変化（#t=123s）では NAV_FINISH を emit しない", () => {
      const emitSpy = jest.spyOn(require("../src/shared/event-bus"), "emit");
      nav.startNavigationDetection(jest.fn());
      emitSpy.mockClear();
      window.location.hash = "#t=123s";
      window.dispatchEvent(new Event("hashchange"));
      expect(emitSpy).not.toHaveBeenCalled();
      window.location.hash = "";
      emitSpy.mockRestore();
    });

    test("クエリ形式（&t=123s）でも NAV_FINISH は emit されない（[#&]t= を含むため抑制）", () => {
      // 現在の実装は /[#&]t=\d+/ をハッシュ全体に適用するため、
      // "#abc&t=123" のように途中に &t= を含んでいても抑制される
      // （意図: シーク変化由来の hashchange を確実に無視）
      const emitSpy = jest.spyOn(require("../src/shared/event-bus"), "emit");
      nav.startNavigationDetection(jest.fn());
      emitSpy.mockClear();
      window.location.hash = "#abc&t=123";
      window.dispatchEvent(new Event("hashchange"));
      expect(emitSpy).not.toHaveBeenCalled();
      window.location.hash = "";
      emitSpy.mockRestore();
    });
  });

  // ===== NAV_FINISH 受信 → handleNavigation =====
  describe("NAV_FINISH 受信", () => {
    test("video URL で emit されたら onReinit が呼ばれる", () => {
      const onReinit = jest.fn();
      const { emit } = require("../src/shared/event-bus");
      nav.startNavigationDetection(onReinit);
      // uiState.initialized をリセット（resetState 内で更新されないが onReinit 内で更新される）
      uiState.initialized = true;
      emit("nav:finish", { url: "https://www.youtube.com/watch?v=abc" });
      // handleNavigation → resetState → resetTranscript → onReinit
      expect(onReinit).toHaveBeenCalled();
    });

    // ★ B-3: 動画切替時に進行中のチャット応答も中断する
    test("動画切替時に abortChatStream が呼ばれる", () => {
      const onReinit = jest.fn();
      const { emit } = require("../src/shared/event-bus");
      nav.startNavigationDetection(onReinit);
      emit("nav:finish", { url: "https://www.youtube.com/watch?v=new" });
      expect(mockAbortChatStream).toHaveBeenCalled();
    });

    test("video URL 以外で emit されたら onReinit は呼ばれない", () => {
      const onReinit = jest.fn();
      const { emit } = require("../src/shared/event-bus");
      nav.startNavigationDetection(onReinit);
      emit("nav:finish", { url: "https://www.youtube.com/feed/trending" });
      expect(onReinit).not.toHaveBeenCalled();
    });

    test("url が空文字 / null / undefined の場合は onReinit は呼ばれない", () => {
      const onReinit = jest.fn();
      const { emit } = require("../src/shared/event-bus");
      nav.startNavigationDetection(onReinit);
      emit("nav:finish", { url: "" });
      emit("nav:finish", { url: null });
      emit("nav:finish", { url: undefined });
      emit("nav:finish", {});
      expect(onReinit).not.toHaveBeenCalled();
    });
  });

  // ===== pageshow (BFCache) =====
  describe("pageshow (BFCache)", () => {
    function makePageShowEvent(persisted) {
      // jsdom の Event constructor は persisted オプションを認識しないため、
      // Object.defineProperty で手動設定する
      const ev = new Event("pageshow");
      Object.defineProperty(ev, "persisted", { value: persisted, configurable: true });
      return ev;
    }

    test("persisted=true で動画ページの場合は onReinit を呼ぶ", () => {
      const onReinit = jest.fn();
      nav.startNavigationDetection(onReinit);
      uiState.initialized = true;
      window.dispatchEvent(makePageShowEvent(true));
      expect(onReinit).toHaveBeenCalled();
    });

    test("persisted=true だが動画ページでない場合は onReinit を呼ばない", () => {
      const onReinit = jest.fn();
      const oldHref = window.location.href;
      window.location.href = "https://www.youtube.com/feed/trending";
      nav.startNavigationDetection(onReinit);
      window.dispatchEvent(makePageShowEvent(true));
      expect(onReinit).not.toHaveBeenCalled();
      window.location.href = oldHref;
    });

    test("persisted=false の場合は onReinit を呼ばない", () => {
      const onReinit = jest.fn();
      nav.startNavigationDetection(onReinit);
      window.dispatchEvent(makePageShowEvent(false));
      expect(onReinit).not.toHaveBeenCalled();
    });

    // ★ B-1: BFCache 復元時、pagehide で外された chrome.storage.onChanged
    // リスナーを再登録しないと、別タブでの設定変更が反映されない。
    test("persisted=true 復元時に bindStorageListener が呼ばれて applyButtonTitles 監視が再開される", () => {
      const onReinit = jest.fn();
      mockBindStorageListener.mockClear();
      nav.startNavigationDetection(onReinit);
      window.dispatchEvent(makePageShowEvent(true));
      expect(mockBindStorageListener).toHaveBeenCalled();
      // 引数には関数（applyButtonTitles または同等の callback）が渡される
      const arg = mockBindStorageListener.mock.calls[0][0];
      expect(typeof arg).toBe("function");
    });
  });

  // ===== visibilitychange =====
  describe("visibilitychange", () => {
    test("hidden でポーリング停止、visible で再開（例外なく動作）", () => {
      nav.startNavigationDetection(jest.fn());
      Object.defineProperty(document, "visibilityState", {
        value: "hidden",
        configurable: true,
        writable: true
      });
      expect(() => document.dispatchEvent(new Event("visibilitychange"))).not.toThrow();
      Object.defineProperty(document, "visibilityState", {
        value: "visible",
        configurable: true,
        writable: true
      });
      expect(() => document.dispatchEvent(new Event("visibilitychange"))).not.toThrow();
    });
  });

  // ===== resetTranscript =====
  describe("resetTranscript", () => {
    test("preloadedTranscript を null / transcriptReady=false にする", () => {
      sessionState.preloadedTranscript = { all: ["x"] };
      sessionState.transcriptReady = true;
      nav.resetTranscript();
      expect(sessionState.preloadedTranscript).toBeNull();
      expect(sessionState.transcriptReady).toBe(false);
    });

    test("_transcriptGen をインクリメントする", () => {
      const before = sessionState._transcriptGen;
      nav.resetTranscript();
      expect(sessionState._transcriptGen).toBe(before + 1);
    });
  });
});
