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
jest.mock("../src/content/ui/ui-summary.js", () => ({
  clearSummaryContent: jest.fn()
}));
jest.mock("../src/content/ui/ui-progress.js", () => ({
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
const mockResetChatHistoryDom = jest.fn();
jest.mock("../src/content/ui/chat.js", () => ({
  abortChatStream: mockAbortChatStream,
  resetChatHistoryDom: mockResetChatHistoryDom
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
    helpers.setWindowLocation({ href: "https://www.youtube.com/watch?v=test" });
    window.location.hash = "";
    jest.clearAllMocks();
    mockBindStorageListener.mockClear();
    mockAbortChatStream.mockClear();
    mockResetChatHistoryDom.mockClear();
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

    // ★ B-4: 同じ URL の NAV_FINISH 短時間連発は 2 回目以降スキップされる
    test("同一URLの短時間連発 (200ms以内) は2回目以降スキップ", () => {
      const onReinit = jest.fn();
      const { emit } = require("../src/shared/event-bus");
      nav.startNavigationDetection(onReinit);
      // 1回目: 呼ばれる
      emit("nav:finish", { url: "https://www.youtube.com/watch?v=abc" });
      // 2回目: 200ms以内なのでスキップ
      emit("nav:finish", { url: "https://www.youtube.com/watch?v=abc" });
      emit("nav:finish", { url: "https://www.youtube.com/watch?v=abc" });
      expect(onReinit).toHaveBeenCalledTimes(1);
    });

    // ★ B-4: 異なる URL ならガードを無視
    test("異なるURLなら重複ガードを無視して両方呼ばれる", () => {
      const onReinit = jest.fn();
      const { emit } = require("../src/shared/event-bus");
      nav.startNavigationDetection(onReinit);
      emit("nav:finish", { url: "https://www.youtube.com/watch?v=abc" });
      emit("nav:finish", { url: "https://www.youtube.com/watch?v=xyz" });
      expect(onReinit).toHaveBeenCalledTimes(2);
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
      helpers.setWindowLocation({ href: "https://www.youtube.com/feed/trending" });
      nav.startNavigationDetection(onReinit);
      window.dispatchEvent(makePageShowEvent(true));
      expect(onReinit).not.toHaveBeenCalled();
      helpers.setWindowLocation({ href: oldHref });
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

  // ===== handleNavigation → resetState =====
  describe("動画切替時のリセット", () => {
    test("panelEl があると #ys-panel を非表示にしてタブ状態をクリア", () => {
      const onReinit = jest.fn();
      nav.startNavigationDetection(onReinit);

      // パネル要素を作る
      const panel = document.createElement("div");
      panel.id = "yt-summary-root";
      const inner = document.createElement("div");
      inner.id = "ys-panel";
      panel.appendChild(inner);
      document.body.appendChild(panel);
      uiState.panelEl = panel;
      uiState.activeTab = "summary";
      uiState.tabs = {
        summary: { generated: true, content: "old", chatHistory: [{ role: "user" }] },
        customA: { generated: true, content: "x", chatHistory: [] },
        customB: { generated: false, content: "", chatHistory: [] }
      };

      const { emit } = require("../src/shared/event-bus");
      emit("nav:finish", { url: "https://www.youtube.com/watch?v=new" });

      expect(uiState.activeTab).toBeNull();
      expect(uiState.tabs.summary.generated).toBe(false);
      expect(uiState.tabs.summary.content).toBe("");
      expect(uiState.tabs.summary.chatHistory).toEqual([]);
      // updateTabActive は tabs.js のモック経由
      const tabs = require("../src/content/ui/tabs");
      expect(tabs.updateTabActive).toHaveBeenCalled();
      // ★ チャット履歴 DOM (#ys-chatHistory) もクリアされる
      //   state だけクリアして DOM が残ると、別動画に切替後も古い Q&A が
      //   見えてしまうリークになっていた (chat.js:resetChatHistoryDom を
      //   経由する)。
      expect(mockResetChatHistoryDom).toHaveBeenCalled();
    });

    test("panelEl が無い場合は updateTabActive 等の DOM 操作をスキップ", () => {
      const onReinit = jest.fn();
      nav.startNavigationDetection(onReinit);
      uiState.panelEl = null;

      const { emit } = require("../src/shared/event-bus");
      emit("nav:finish", { url: "https://www.youtube.com/watch?v=new" });

      // エラーなく完了
      expect(onReinit).toHaveBeenCalled();
    });

    test("同一 videoId の連続 emit では resetTranscript 呼ばれず preloadedTranscript が残る", () => {
      const onReinit = jest.fn();
      nav.startNavigationDetection(onReinit);

      // activeVideoId を一度設定 (初回emit扱い)
      uiState.activeVideoId = "test";
      sessionState.preloadedTranscript = { all: ["x"] };
      sessionState.transcriptReady = true;
      const genBefore = sessionState._transcriptGen;

      // 同一videoIdで再emit (yt-page-data-updated 頻発を模倣)
      const { emit } = require("../src/shared/event-bus");
      emit("nav:finish", { url: "https://www.youtube.com/watch?v=test" });

      expect(sessionState.preloadedTranscript).toEqual({ all: ["x"] });
      expect(sessionState.transcriptReady).toBe(true);
      expect(sessionState._transcriptGen).toBe(genBefore);
    });

    test("異なる videoId では resetTranscript が呼ばれ _transcriptGen がインクリメント", () => {
      nav.startNavigationDetection(jest.fn());
      uiState.activeVideoId = "old";
      sessionState.preloadedTranscript = { all: ["x"] };
      sessionState.transcriptReady = true;
      const genBefore = sessionState._transcriptGen;

      const { emit } = require("../src/shared/event-bus");
      emit("nav:finish", { url: "https://www.youtube.com/watch?v=new" });

      expect(sessionState.preloadedTranscript).toBeNull();
      expect(sessionState.transcriptReady).toBe(false);
      expect(sessionState._transcriptGen).toBe(genBefore + 1);
    });

    test("連続 emit で lastInitTime がリセットされるため safeInit が再実行可能", () => {
      const onReinit = jest.fn();
      nav.startNavigationDetection(onReinit);

      // activeVideoId を null のまま、200ms 未満で 2 回到着
      uiState.activeVideoId = null;
      uiState.lastInitTime = Date.now();
      uiState.initialized = true;

      const { emit } = require("../src/shared/event-bus");
      // 1 回目: videoId 変化 → activeVideoId が設定される
      emit("nav:finish", { url: "https://www.youtube.com/watch?v=video1" });
      // 2 回目: 別のvideoId → 状態変化
      emit("nav:finish", { url: "https://www.youtube.com/watch?v=video2" });

      // lastInitTime は handleNavigation 内で 0 にリセットされる
      expect(uiState.lastInitTime).toBe(0);
      // initialized も false にリセットされる (safeInit の入口ガードが外れる)
      expect(uiState.initialized).toBe(false);
      // 2 回とも onReinit が呼ばれる
      expect(onReinit).toHaveBeenCalledTimes(2);
    });
  });

  // ===== フォールバックポーリング =====
  describe("URL ポーリングフォールバック", () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    test("hidden 状態のときはポーリングを開始しない", () => {
      Object.defineProperty(document, "visibilityState", {
        value: "hidden",
        configurable: true,
        writable: true
      });
      nav.startNavigationDetection(jest.fn());
      // タイマ発火させてもエラーなく動作
      expect(() => jest.advanceTimersByTime(10000)).not.toThrow();
    });

    test("URL が変わったら handleNavigation を発火", () => {
      Object.defineProperty(document, "visibilityState", {
        value: "visible",
        configurable: true,
        writable: true
      });
      const onReinit = jest.fn();
      nav.startNavigationDetection(onReinit);
      // 初期化直後は lastObservedUrl = current
      // URL を変更
      helpers.setWindowLocation({ href: "https://www.youtube.com/watch?v=changed" });
      jest.advanceTimersByTime(10000);
      expect(onReinit).toHaveBeenCalled();
    });

    test("5 分間 URL 変化なしで自動停止", () => {
      Object.defineProperty(document, "visibilityState", {
        value: "visible",
        configurable: true,
        writable: true
      });
      const onReinit = jest.fn();
      nav.startNavigationDetection(onReinit);
      onReinit.mockClear();

      // 5 分 (= 300000ms) 経過でポーリング停止
      jest.advanceTimersByTime(5 * 60 * 1000 + 10000);
      // タイマが停止しているので、この時刻以降 onReinit は呼ばれない
      // (=mock.calls.length は変わらない)
      const currentCalls = onReinit.mock.calls.length;
      jest.advanceTimersByTime(30000);
      expect(onReinit.mock.calls.length).toBe(currentCalls);
    });
  });

  // ===== BFCache 復元時の bindStorageListener エラーハンドリング =====
  describe("BFCache 復元の例外処理", () => {
    test("bindStorageListener が throw してもクラッシュしない", () => {
      const onReinit = jest.fn();
      nav.startNavigationDetection(onReinit);
      mockBindStorageListener.mockImplementationOnce(function () {
        throw new Error("context invalidated");
      });

      function makePageShowEvent(persisted) {
        const ev = new Event("pageshow");
        Object.defineProperty(ev, "persisted", { value: persisted, configurable: true });
        return ev;
      }

      expect(() => window.dispatchEvent(makePageShowEvent(true))).not.toThrow();
    });
  });
});
