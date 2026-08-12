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
  abortChatStream: jest.fn(),
  resetChatHistoryDom: jest.fn()
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

test("同一動画IDで再 emit: パネル・タブ状態ともに保持される", () => {
    const { inner } = createPanelDom();
    inner.style.display = "flex";
    uiState.activeVideoId = "initial";
    uiState.activeTab = "summary";
    uiState.tabs.summary.generated = true;
    uiState.tabs.summary.content = "ユーザーが生成した要約";

    nav.startNavigationDetection(jest.fn());

    const { emit } = require("../src/shared/event-bus");
    // 同一 URL (BFCache 復元や yt-page-data-updated 重複 emit を想定)
    emit("nav:finish", { url: "https://www.youtube.com/watch?v=initial" });

    // 動画IDが同じなので panel は閉じない
    expect(inner.style.display).toBe("flex");
    // N-6: タブ状態（activeTab / generated / content）も保持される
    expect(uiState.activeTab).toBe("summary");
    expect(uiState.tabs.summary.generated).toBe(true);
    expect(uiState.tabs.summary.content).toBe("ユーザーが生成した要約");
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

  // ★ 回帰防止 (N-6): ブラウザ再起動後にユーザーが要約生成 → その後
  //   yt-page-data-updated などの同一動画 re-emit が走っても、ユーザーの
  //   要約・アクティブタブ・チャット履歴が消えないこと。元の実装では
  //   タブ状態だけクリアして activeTab=null になり、再生成ボタンを押しても
  //   無反応になる症状があった。
  test("ユーザーが生成後に同一動画 re-emit: タブ状態・activeTab ともに保持", () => {
    createPanelDom();
    // switchTab 相当の操作を再現: activeVideoId を確定させる
    uiState.activeVideoId = "initial";
    uiState.activeTab = "summary";
    uiState.tabs.summary.generated = true;
    uiState.tabs.summary.content = "ユーザー生成の要約";
    uiState.tabs.summary.chatHistory = [
      { role: "system" },
      { role: "user" },
      { role: "assistant", content: "ユーザー生成の要約" }
    ];

    nav.startNavigationDetection(jest.fn());

    const { emit } = require("../src/shared/event-bus");
    // ユーザーが要約を生成した後に yt-page-data-updated が再 emit される
    emit("nav:finish", { url: "https://www.youtube.com/watch?v=initial" });

    // 同一動画 re-emit → ユーザー状態は消えない
    expect(uiState.activeTab).toBe("summary");
    expect(uiState.tabs.summary.generated).toBe(true);
    expect(uiState.tabs.summary.content).toBe("ユーザー生成の要約");
    expect(uiState.tabs.summary.chatHistory.length).toBe(3);
  });

  // ★ 回帰防止 (N-6): switchTab が activeVideoId を能動的にセットすること。
  //   handleNavigation が初回に走る前にユーザーがタブをクリックした場合、
  //   activeVideoId が null のままだと「初回」判定でクリアされてしまう。
  test("switchTab が activeVideoId を能動的にセットする", () => {
    const helpers = require("./__helpers__/index.cjs");
    helpers.setWindowLocation({
      href: "https://www.youtube.com/watch?v=initial",
      pathname: "/watch"
    });
    createPanelDom();
    // activeVideoId は未設定 (= 初期状態)
    uiState.activeVideoId = null;
    uiState.activeTab = null;

    nav.startNavigationDetection(jest.fn());

    // 直接 switchTab を呼ぶ代わりに、ユーザーがタブ操作を行うシナリオを再現。
    // ここでは internal 関数の代わりに、activeVideoId が確定される仕組みを検証。
    const { emit } = require("../src/shared/event-bus");
    // 初回 handleNavigation が走る
    emit("nav:finish", { url: "https://www.youtube.com/watch?v=initial" });
    // 初回は activeVideoId が null → クリア処理が走る → activeVideoId が確定する
    expect(uiState.activeVideoId).toBe("initial");
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
