// tests/nav-stability.test.js — N-1 / N-3 / N-4 の安定性テスト
// 症状1（初回/再起動で閉じる）と症状2（別動画でブレる）の回帰防止。
//  - N-1: resetState() は動画ID変化時のみ #ys-panel を閉じる
//  - N-3: popstate にも #t=NN 抑制を入れる
//  - N-4: フォールバックポーリングも NAV_DEDUPE 経由にする

const helpers = require("./__helpers__/index.cjs");

helpers.installChromeMock();
helpers.setupYouTubeWatchDom();

const { clearAll } = require("../src/shared/event-bus");
const { uiState } = require("../src/shared/state");

// 副作用モジュールのモック化
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
jest.mock("../src/content/ui/storage-listener.js", () => ({
  bindStorageListener: jest.fn()
}));
jest.mock("../src/content/ui/chat.js", () => ({
  abortChatStream: jest.fn()
}));

// location スタブ
delete window.location;
window.location = {
  href: "https://www.youtube.com/watch?v=initial",
  hash: ""
};

const nav = require("../src/content/navigation");

// テスト用ヘルパ: パネルの DOM を作って uiState に紐付ける
function createPanelDom() {
  const root = document.createElement("div");
  root.id = "yt-summary-root";
  const inner = document.createElement("div");
  inner.id = "ys-panel";
  inner.style.display = "flex";
  root.appendChild(inner);
  document.body.appendChild(root);
  uiState.panelEl = root;
  uiState.tabs = {
    summary: { generated: true, content: "old", chatHistory: [] },
    customA: { generated: false, content: "", chatHistory: [] },
    customB: { generated: false, content: "", chatHistory: [] }
  };
  return { root, inner };
}

describe("N-1: resetState() の動画ID別パネル非表示", () => {
  beforeEach(() => {
    clearAll();
    helpers.resetStates();
    nav.__resetNavigationForTest();
    jest.clearAllMocks();
    helpers.setWindowLocation({ href: "https://www.youtube.com/watch?v=initial" });
    window.location.hash = "";
  });

  afterEach(() => {
    nav.__resetNavigationForTest();
    // パネル DOM を片付け
    const root = document.getElementById("yt-summary-root");
    if (root) root.remove();
    uiState.panelEl = null;
  });

  test("初回リセット: activeVideoId 未設定→変化ありとして閉じる", () => {
    const { inner } = createPanelDom();
    inner.style.display = "flex";
    uiState.activeVideoId = null;
    uiState.activeTab = "summary";

    // startNavigationDetection を呼んで NAV_FINISH リスナーを登録
    nav.startNavigationDetection(jest.fn());

    const { emit } = require("../src/shared/event-bus");
    emit("nav:finish", { url: "https://www.youtube.com/watch?v=initial" });

    expect(inner.style.display).toBe("none");
    expect(uiState.activeVideoId).toBe("initial");
  });

  test("同一動画IDで再 emit: パネルを閉じない", () => {
    const { inner } = createPanelDom();
    inner.style.display = "flex";
    uiState.activeVideoId = "initial";
    uiState.activeTab = "summary";

    nav.startNavigationDetection(jest.fn());

    const { emit } = require("../src/shared/event-bus");
    // 同一 URL (BFCache 復元や yt-page-data-updated 重複 emit を想定)
    emit("nav:finish", { url: "https://www.youtube.com/watch?v=initial" });

    // 動画IDが同じなので panel は閉じない
    expect(inner.style.display).toBe("flex");
    // ただしタブ状態（activeTab / generated / content）はリセットされる
    expect(uiState.activeTab).toBeNull();
    expect(uiState.tabs.summary.generated).toBe(false);
    expect(uiState.tabs.summary.content).toBe("");
  });

  test("動画ID変化時: パネルを閉じる", () => {
    const { inner } = createPanelDom();
    inner.style.display = "flex";
    uiState.activeVideoId = "initial";
    uiState.activeTab = "summary";

    nav.startNavigationDetection(jest.fn());

    helpers.setWindowLocation({ href: "https://www.youtube.com/watch?v=other" });
    const { emit } = require("../src/shared/event-bus");
    emit("nav:finish", { url: "https://www.youtube.com/watch?v=other" });

    expect(inner.style.display).toBe("none");
    expect(uiState.activeVideoId).toBe("other");
  });

  test("BFCache 復元→同一動画: パネル状態は維持される", () => {
    const { inner } = createPanelDom();
    inner.style.display = "flex";
    uiState.activeVideoId = "initial";
    uiState.activeTab = "summary";

    // 初回: ユーザー操作なしで activeTab を保持したいシナリオ
    // BFCache.persisted=true 復元経路を再現
    uiState.activeVideoId = "initial";
    const onReinit = jest.fn();
    nav.startNavigationDetection(onReinit);
    onReinit.mockClear();

    const ev = new Event("pageshow");
    Object.defineProperty(ev, "persisted", { value: true, configurable: true });
    window.dispatchEvent(ev);

    // film.activeVideoId と同じ URL なら display は "flex" のまま
    expect(inner.style.display).toBe("flex");
  });
});

describe("N-3: popstate の #t=NN 抑制", () => {
  beforeEach(() => {
    clearAll();
    helpers.resetStates();
    nav.__resetNavigationForTest();
    jest.clearAllMocks();
    helpers.setWindowLocation({ href: "https://www.youtube.com/watch?v=test" });
    window.location.hash = "";
  });

  afterEach(() => {
    nav.__resetNavigationForTest();
  });

  test("popstate で #t=NN ハッシュ: NAV_FINISH を emit しない", () => {
    const emitSpy = jest.spyOn(require("../src/shared/event-bus"), "emit");
    nav.startNavigationDetection(jest.fn());
    emitSpy.mockClear();

    window.location.hash = "#t=123s";
    window.dispatchEvent(new Event("popstate"));

    expect(emitSpy).not.toHaveBeenCalled();
    emitSpy.mockRestore();
    window.location.hash = "";
  });

  test("popstate で #t=NN なし: NAV_FINISH を emit する", () => {
    const emitSpy = jest.spyOn(require("../src/shared/event-bus"), "emit");
    nav.startNavigationDetection(jest.fn());
    emitSpy.mockClear();

    window.location.hash = "";
    window.dispatchEvent(new Event("popstate"));

    expect(emitSpy).toHaveBeenCalledWith(
      "nav:finish",
      expect.objectContaining({ url: expect.any(String) })
    );
    emitSpy.mockRestore();
  });

  test("popstate で #t=NN がクエリ形式 (&t=): NAV_FINISH を emit しない", () => {
    const emitSpy = jest.spyOn(require("../src/shared/event-bus"), "emit");
    nav.startNavigationDetection(jest.fn());
    emitSpy.mockClear();

    window.location.hash = "#abc&t=123";
    window.dispatchEvent(new Event("popstate"));

    expect(emitSpy).not.toHaveBeenCalled();
    emitSpy.mockRestore();
    window.location.hash = "";
  });
});

describe("N-4: ポーリング経路も NAV_DEDUPE 経由", () => {
  beforeEach(() => {
    clearAll();
    helpers.resetStates();
    nav.__resetNavigationForTest();
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
    nav.__resetNavigationForTest();
  });

  test("URL が変わったとき NAV_DEDUPE 経由で handleNavigation を発火", () => {
    Object.defineProperty(document, "visibilityState", {
      value: "visible",
      configurable: true,
      writable: true
    });
    const onReinit = jest.fn();
    nav.startNavigationDetection(onReinit);

    // 初期化直後 (lastObservedUrl = current) → URL変更 → 10秒タイマー発火
    helpers.setWindowLocation({ href: "https://www.youtube.com/watch?v=changed" });
    jest.advanceTimersByTime(10000);

    expect(onReinit).toHaveBeenCalledTimes(1);
  });

  test("同一URLが短時間に2回到着 (SPA emit + ポーリング): 2回目は dedupe", () => {
    Object.defineProperty(document, "visibilityState", {
      value: "visible",
      configurable: true,
      writable: true
    });
    const onReinit = jest.fn();
    nav.startNavigationDetection(onReinit);

    // SPA イベント経由で先に emit
    const { emit } = require("../src/shared/event-bus");
    emit("nav:finish", { url: "https://www.youtube.com/watch?v=foo" });
    expect(onReinit).toHaveBeenCalledTimes(1);

    // ポーリングで同じ URL を発火させる（200ms 内のため dedupe されるはず）
    helpers.setWindowLocation({ href: "https://www.youtube.com/watch?v=foo" });
    // lastObservedUrl を進める
    jest.advanceTimersByTime(10);
    // さらにポーリング emit
    emit("nav:finish", { url: "https://www.youtube.com/watch?v=foo" });
    // 200ms ガード内なのでスキップ
    expect(onReinit).toHaveBeenCalledTimes(1);
  });
});
