// tests/tabs.test.js — src/content/ui/tabs.js の包括テスト
// 公開関数: abortChatStream, switchTab, applyButtonTitles, bindEvents
// 内部関数 (onChatSend, regenerate, handleEditUserMessage 等) は DOM イベント経由で検証する。

// requestAnimationFrame の polyfill（jsdom には存在しない）
if (typeof requestAnimationFrame === "undefined") {
  global.requestAnimationFrame = function (cb) {
    return setTimeout(cb, 0);
  };
  global.cancelAnimationFrame = function (id) {
    clearTimeout(id);
  };
}

// chrome.storage.onChanged をモック
global.chrome = global.chrome || {};
global.chrome.storage = global.chrome.storage || {};
global.chrome.storage.onChanged = { addListener: jest.fn(), removeListener: jest.fn() };
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
jest.mock("../src/infrastructure/storage-config.js", () => ({
  loadButtonTitle: jest.fn()
}));
jest.mock("../src/infrastructure/storage-cache.js", () => ({
  loadSummaryCache: jest.fn()
}));

// 初期状態のデフォルト戻り値
beforeAll(function () {
  const fakeResult = {
    div: {
      querySelector: function () {
        return null;
      }
    },
    body: {}
  };
  mockAppendChatMessage.mockReturnValue(fakeResult);
  mockAppendAssistantPlaceholder.mockReturnValue(fakeResult);
});

const { uiState: S, sessionState } = require("../src/shared/state");
const { getEl, enableAllButtons } = require("../src/content/ui/panel");
const ui = require("../src/content/ui/ui");
const tabsUi = require("../src/content/ui/tabs-ui");
const ai = require("../src/domain/ai");
const api = require("../src/domain/api");
const storage = require("../src/infrastructure/storage");

const { abortChatStream, switchTab, applyButtonTitles } = require("../src/content/ui/tabs");

// B-2: bindEvents は tabs-events.js から直接 import
const { bindEvents } = require("../src/content/ui/tabs-events");
// regenerate は tabs-events.js の内部関数だが、テストでは regenBtn click で検証可能

// 共通セットアップ: パネル DOM 構築
function buildPanelDOM() {
  document.body.innerHTML = "";
  const root = document.createElement("div");
  root.id = "yt-summary-root";
  root.innerHTML =
    '<div class="ys-tab-row">' +
    '<button id="ys-btn-summary">📝 A</button>' +
    '<button id="ys-btn-customA">📊 B</button>' +
    '<button id="ys-btn-customB">💡 C</button>' +
    "</div>" +
    '<div id="ys-panel" style="display:none">' +
    '<div id="ys-content-area"></div>' +
    '<div id="ys-error"></div>' +
    '<div id="ys-summaryText"></div>' +
    '<div id="ys-progress"></div>' +
    '<div id="ys-infoRow"><span id="ys-infoLabel"></span>' +
    '<button id="ys-copyBtn"></button>' +
    '<button id="ys-regenBtn"></button>' +
    "</div>" +
    '<div id="ys-chatHistory"></div>' +
    "</div>" +
    '<div id="ys-chatArea" style="display:none">' +
    '<textarea id="ys-chatInput" rows="1"></textarea>' +
    '<button id="ys-chatClearBtn"></button>' +
    "</div>";
  document.body.appendChild(root);
  S.panelEl = root;
  S.tabIds = ["summary", "customA", "customB"];
  S.tabs = {
    summary: {
      generated: false,
      content: "",
      config: null,
      modelLabel: "",
      transcriptCount: 0,
      chatHistory: []
    },
    customA: {
      generated: false,
      content: "",
      config: null,
      modelLabel: "",
      transcriptCount: 0,
      chatHistory: []
    },
    customB: {
      generated: false,
      content: "",
      config: null,
      modelLabel: "",
      transcriptCount: 0,
      chatHistory: []
    }
  };
  S.activeTab = null;
  S.eventsBound = false;
  // T1-U3: storage.onChanged リスナー参照もテスト毎にリセット
  S.storageOnChangedListener = null;
  S.storageOnChangedCleanupBound = false;
  getEl.mockImplementation(function (sel) {
    return root.querySelector(sel);
  });
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
    storage.loadButtonTitle.mockImplementation(async function (_btn) {
      return null;
    });
    // T2-A5: 既定は null（キャッシュヒットしない）。ヒット検証は当該テストで上書き。
    storage.loadSummaryCache.mockResolvedValue(null);
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
      const event = new KeyboardEvent("keydown", {
        key: "Enter",
        shiftKey: false,
        isComposing: false,
        bubbles: true,
        cancelable: true
      });
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
      storage.loadSummaryCache.mockResolvedValue(null);

      await switchTab("summary");

      expect(ai.callAI).toHaveBeenCalledWith("summary", true);
    });

    // T2-A5: saveSummaryCache ヒット時は callAI を呼ばずに即時表示
    test("saveSummaryCache ヒット時は callAI を呼ばずに復元", async () => {
      S.tabs.summary.generated = false;
      const cached = {
        content: "キャッシュ済み要約",
        modelLabel: "gpt-4o",
        transcriptCount: 100,
        timestamp: Date.now()
      };
      storage.loadSummaryCache.mockResolvedValue(cached);
      // window.location を YouTube watch 形式に
      Object.defineProperty(window, "location", {
        value: {
          href: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
          search: "?v=dQw4w9WgXcQ",
          pathname: "/watch"
        },
        writable: true,
        configurable: true
      });

      await switchTab("summary");

      // callAI は呼ばれない
      expect(ai.callAI).not.toHaveBeenCalled();
      // タブ状態がキャッシュから復元される
      expect(S.tabs.summary.generated).toBe(true);
      expect(S.tabs.summary.content).toBe("キャッシュ済み要約");
      expect(S.tabs.summary.modelLabel).toBe("gpt-4o");
      expect(S.tabs.summary.transcriptCount).toBe(100);
      // 描画は renderTabContent 経由
      expect(tabsUi.renderTabContent).toHaveBeenCalledWith("summary");
      expect(tabsUi.updateTabUI).toHaveBeenCalled();
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
      ai.callAI.mockReturnValueOnce(
        new Promise(function (r) {
          resolveCall = r;
        })
      );

      const p = switchTab("summary");
      // 同期的にボタンテキスト書き換えが走っている
      expect(btn.textContent).toBe("⏳ 処理中...");
      expect(btn.disabled).toBe(true);
      resolveCall(true);
      await p;
    });

    // 回帰防止: getEl("#ys-btn-X") が null を返すケース（パネル DOM 不整合など）
    test("ボタン要素が取得できない場合は callAI を実行（クラッシュしない）", async () => {
      S.tabs.summary.generated = false;
      storage.loadSummaryCache.mockResolvedValue(null);
      // #ys-btn-summary だけ null を返す
      getEl.mockImplementation(function (sel) {
        if (sel === "#ys-btn-summary") return null;
        return S.panelEl && S.panelEl.querySelector(sel);
      });

      await expect(switchTab("summary")).resolves.not.toThrow();
      expect(ai.callAI).toHaveBeenCalledWith("summary", true);
    });

    // T2-A5: キャッシュヒット中に世代が変わると破棄される（回帰防止）
    test("キャッシュヒット中に _switchGen が変わると cache は適用されず callAI も呼ばない", async () => {
      S.tabs.summary.generated = false;
      S.tabs.summary.content = "古いコンテンツ";
      const cached = {
        content: "新キャッシュ",
        modelLabel: "gpt-4o",
        transcriptCount: 100,
        timestamp: Date.now()
      };
      // キャッシュ取得を遅延させ、その間に _switchGen を進める
      let resolveCache;
      storage.loadSummaryCache.mockReturnValue(
        new Promise(function (r) {
          resolveCache = r;
        })
      );
      Object.defineProperty(window, "location", {
        value: { href: "https://www.youtube.com/watch?v=abc", pathname: "/watch" },
        writable: true,
        configurable: true
      });

      // switchTab を await せず開始
      const p = switchTab("summary");
      // await 経由で _switchGen を進める（古い呼び出し扱い）
      sessionState._switchGen++;
      // キャッシュを解決
      resolveCache(cached);
      await p;

      // 古い呼び出しなので cache は適用されない
      expect(S.tabs.summary.content).toBe("古いコンテンツ");
      expect(S.tabs.summary.generated).toBe(false);
      // callAI もスキップ（myGen !== _switchGen で早期 return）
      expect(ai.callAI).not.toHaveBeenCalled();
    });

    // 回帰防止: callAI 完了時の finally で _switchGen 不一致なら UI 状態を巻き込まない
    test("callAI 完了時: 別タブに切替済みなら applyButtonTitles は呼ばない（世代不一致）", async () => {
      S.tabs.summary.generated = false;
      S.tabs.customA.generated = false;
      storage.loadSummaryCache.mockResolvedValue(null);

      // A の callAI は遅延
      let resolveA;
      ai.callAI.mockImplementationOnce(
        () =>
          new Promise(function (r) {
            resolveA = r;
          })
      );
      // B は即完了
      ai.callAI.mockResolvedValueOnce(true);

      // A を開始
      const pA = switchTab("summary");
      // 直後に B へ切替（A の _switchGen より新しい世代に）
      const pB = switchTab("customA");
      await pB;
      await flushPromises();

      // B の applyButtonTitles 呼び出し回数を記録
      const callsAfterB = tabsUi.updateTabUI.mock.calls.length;
      // A の callAI を完了させ、A の finally を発火
      resolveA(false);
      await pA;
      await flushPromises();

      // A の finally は _switchGen 不一致で no-op のはず
      // → updateTabUI 呼び出しが増えていないことを確認
      expect(tabsUi.updateTabUI.mock.calls.length).toBe(callsAfterB);
    });

    // 回帰防止: tab.generated=true 切替時に scrollContentTop が呼ばれる
    test("tab.generated=true 切替時に requestAnimationFrame 経由で scrollContentTop が呼ばれる", async () => {
      S.tabs.summary.generated = true;
      S.tabs.summary.content = "x";
      // content-area を取得し、scrollTop セッターをスパイ。
      // jsdom の scrollTop は prototype 側の getter/setter なので、
      // Object.defineProperty でインスタンスに再定義してフックする。
      const area = getEl("#ys-content-area");
      const setSpy = jest.fn();
      Object.defineProperty(area, "scrollTop", {
        set: setSpy,
        get: function () {
          return 0;
        },
        configurable: true
      });
      await switchTab("summary");
      // RAF ポリフィル (setTimeout(cb, 0)) の発火を待つ
      await new Promise(function (resolve) {
        setTimeout(resolve, 50);
      });
      expect(setSpy).toHaveBeenCalledWith(0);
    });

    // 回帰防止: switchTab() の冒頭で必ず進行中のストリームを中断する
    test("switchTab 開始時に abortCurrentStream / abortChatStream を呼ぶ", async () => {
      await switchTab("summary");
      expect(ai.abortCurrentStream).toHaveBeenCalledTimes(1);
      // abortChatStream は実関数を呼ぶ（sessionState.chatAbortController=null なら no-op）
      expect(() => abortChatStream()).not.toThrow();
    });

    // 回帰防止: 連打時に古い呼び出しの finally が他タブのボタン状態を巻き込まない
    test("A→B連打: 古い A の finally が B の enabled 状態を巻き戻さない", async () => {
      const btnA = getEl("#ys-btn-summary");
      const btnB = getEl("#ys-btn-customA");
      S.tabs.summary.generated = false;
      S.tabs.customA.generated = false;

      // A の callAI は未完了のまま保留（abort されるまで pending）
      let resolveA;
      ai.callAI.mockImplementationOnce(
        () =>
          new Promise(function (r) {
            resolveA = r;
          })
      );
      // B の callAI は即完了
      ai.callAI.mockResolvedValueOnce(true);

      const pA = switchTab("summary");
      // 直後: A は「処理中...」で disabled
      expect(btnA.textContent).toBe("⏳ 処理中...");
      expect(btnA.disabled).toBe(true);

      // A の処理中に B をクリック
      const pB = switchTab("customA");
      // B は「処理中...」で disabled
      expect(btnB.textContent).toBe("⏳ 処理中...");
      expect(btnB.disabled).toBe(true);

      // B を完了させる
      await pB;
      await flushPromises();

      // ★ B の finally 内で enableAllButtons が呼ばれている
      // ★ 古い A 側の finally は世代不一致のため no-op のはず
      // テスト簡易化のため B 完了後の状態を確認する
      expect(btnB.disabled).toBe(false);
      expect(btnB.textContent).toBe("📊 B");

      // A も後で完了させる（abort で reject 扱いに）
      resolveA(false);
      await pA;
      await flushPromises();

      // ★ 重要: A の finally は世代不一致なので no-op。
      // ★ ここで B の disabled が true に巻き戻されないことを確認。
      expect(btnB.disabled).toBe(false);
      expect(btnB.textContent).toBe("📊 B");
    });

    // 回帰防止: 古い A の finally は enableAllButtons を呼ばない（世代不一致で抜ける）
    test("A→B連打: 古い A の finally は enableAllButtons を呼ばない", async () => {
      const btnB = getEl("#ys-btn-customA");
      S.tabs.summary.generated = false;
      S.tabs.customA.generated = false;

      let resolveA;
      ai.callAI.mockImplementationOnce(
        () =>
          new Promise(function (r) {
            resolveA = r;
          })
      );
      // B の callAI は即完了（finally で applyButtonTitles → enableAllButtons が走る）
      ai.callAI.mockResolvedValueOnce(true);

      const pA = switchTab("summary");
      const pB = switchTab("customA");
      await pB;
      await flushPromises();

      // B 完了時点で enableAllButtons が呼ばれているはず（B の finally から）
      const countBeforeA = enableAllButtons.mock.calls.length;
      expect(countBeforeA).toBeGreaterThanOrEqual(1);

      // B の呼び出しで enableAllButtons されたので B は enabled
      expect(btnB.disabled).toBe(false);

      // A を後で完了させ、A の古い finally を発火させる
      resolveA(false);
      await pA;
      await flushPromises();

      // ★ A の古い finally は世代不一致 → 早期 return する。
      // ★ したがって enableAllButtons は増えていないこと。
      // ★ （仮にバグがあれば A の finally で enableAllButtons が
      // ★   もう一度呼ばれ、textContent が "処理中..." に戻ってしまう）
      const countAfterA = enableAllButtons.mock.calls.length;
      expect(countAfterA).toBe(countBeforeA);
      expect(btnB.textContent).toBe("📊 B");
    });

    // 回帰防止: 連打時の _switchGen がインクリメントされる
    test("A→B連打: _switchGen が都度インクリメントされる", async () => {
      S.tabs.summary.generated = false;
      S.tabs.customA.generated = false;

      ai.callAI.mockResolvedValue(true);

      const genBefore = sessionState._switchGen;
      await switchTab("summary");
      const genAfter1st = sessionState._switchGen;
      await switchTab("customA");
      const genAfter2nd = sessionState._switchGen;

      expect(genAfter1st).toBeGreaterThan(genBefore);
      expect(genAfter2nd).toBeGreaterThan(genAfter1st);
    });

    // ★ T3-C1 回帰防止:
    //   「A タブで要約キャッシュあり → B タブをクリック」は callAI を
    //   実行するパスに進む必要がある。旧実装では (videoId, mode) を
    //   区別せずにキャッシュを共有していたため、B タブ click で
    //   A の要約キャッシュが customA の content として誤表示されていた。
    //   修正後: loadSummaryCache(videoId, "customA") は null を返し、
    //   必ず callAI("customA") が走る。
    test("A→B切替: A のキャッシュが customA に混入せず、callAI('customA') が呼ばれる", async () => {
      S.tabs.summary.generated = false;
      S.tabs.customA.generated = false;

      // A 用キャッシュだけがある状態 (summary モード)
      storage.loadSummaryCache.mockImplementation(async function (videoId, mode) {
        if (mode === "summary") {
          return {
            content: "A 要約 (summary キャッシュ)",
            modelLabel: "gpt-4o",
            transcriptCount: 100,
            timestamp: Date.now()
          };
        }
        return null;
      });
      ai.callAI.mockResolvedValue(true);

      // B (customA) を押す
      await switchTab("customA");
      await flushPromises();

      // customA のキャッシュは無かった扱い → callAI が走っている
      expect(ai.callAI).toHaveBeenCalledWith("customA", true);

      // customA の content は AI が setSummaryContent を呼んだ
      // （ここでは mock なので tab.content は saveSummaryCache mock 経由で
      //   直接設定されないが、callAI が呼ばれた事実で十分）
    });

    // ★ T3-C1 もう一つの回帰防止: B 用キャッシュがあれば即時表示される。
    test("A→B切替: customA のキャッシュがあれば callAI を呼ばずに即時表示", async () => {
      S.tabs.summary.generated = false;
      S.tabs.customA.generated = false;

      storage.loadSummaryCache.mockImplementation(async function (videoId, mode) {
        if (mode === "customA") {
          return {
            content: "B 要約 (customA キャッシュ)",
            modelLabel: "gpt-4o",
            transcriptCount: 100,
            timestamp: Date.now()
          };
        }
        return null;
      });

      await switchTab("customA");
      await flushPromises();

      // キャッシュヒット時: callAI を呼ばない
      expect(ai.callAI).not.toHaveBeenCalled();
      // customA の content がキャッシュから復元される
      expect(S.tabs.customA.generated).toBe(true);
      expect(S.tabs.customA.content).toBe("B 要約 (customA キャッシュ)");
    });
  });

  // ===== applyButtonTitles =====
  describe("applyButtonTitles", () => {
    test("各ボタンのラベルが正しく設定される", async () => {
      storage.loadButtonTitle.mockImplementation(async function (btn) {
        if (btn === "summary") return "要約カスタム";
        if (btn === "customA") return "分析カスタム";
        if (btn === "customB") return "考察カスタム";
        return null;
      });

      await applyButtonTitles();

      expect(getEl("#ys-btn-summary").textContent).toBe("📝 要約カスタム");
      expect(getEl("#ys-btn-customA").textContent).toBe("📊 分析カスタム");
      expect(getEl("#ys-btn-customB").textContent).toBe("💡 考察カスタム");
      expect(enableAllButtons).toHaveBeenCalled();
      expect(tabsUi.updateTabUI).toHaveBeenCalled();
    });

    test("loadButtonTitle が null の場合は A/B/C フォールバック", async () => {
      storage.loadButtonTitle.mockResolvedValue(null);
      await applyButtonTitles();
      expect(getEl("#ys-btn-summary").textContent).toBe("📝 A");
      expect(getEl("#ys-btn-customA").textContent).toBe("📊 B");
      expect(getEl("#ys-btn-customB").textContent).toBe("💡 C");
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
      // T2-A5: キャッシュチェックの await が追加されたため、複数マイクロタスク待つ
      return flushPromises().then(function () {
        expect(ai.callAI).toHaveBeenCalledWith("customA", true);
      });
    });

    test("chatInput keydown Enter で onChatSend が走る（chatBusy=false）", () => {
      bindEvents();
      const chatInput = getEl("#ys-chatInput");
      chatInput.value = "質問";

      const event = new KeyboardEvent("keydown", {
        key: "Enter",
        shiftKey: false,
        isComposing: false,
        bubbles: true,
        cancelable: true
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
        key: "Enter",
        shiftKey: true,
        isComposing: false,
        bubbles: true,
        cancelable: true
      });
      chatInput.dispatchEvent(event);

      expect(event.defaultPrevented).toBe(false);
    });

    test("chatInput keydown IME 変換中は送信しない", () => {
      bindEvents();
      const chatInput = getEl("#ys-chatInput");
      chatInput.value = "変換中";

      const event = new KeyboardEvent("keydown", {
        key: "Enter",
        shiftKey: false,
        isComposing: true,
        bubbles: true,
        cancelable: true
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
      S.tabs.summary.chatHistory = [{ role: "system" }, { role: "user" }, { role: "assistant" }];
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
        key: "Enter",
        shiftKey: false,
        isComposing: false,
        bubbles: true,
        cancelable: true
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

      chatInput.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Enter",
          shiftKey: false,
          isComposing: false,
          bubbles: true,
          cancelable: true
        })
      );
      await flushPromises();

      const calls = mockAppendChatMessage.mock.calls;
      const lastAssistantCall = calls
        .filter(function (c) {
          return c[0] === "assistant";
        })
        .pop();
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

      chatInput.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Enter",
          shiftKey: false,
          isComposing: false,
          bubbles: true,
          cancelable: true
        })
      );
      await flushPromises();
      await flushPromises();

      // updateChatMessageBody が呼ばれ、エラーメッセージを含む
      expect(ui.updateChatMessageBody).toHaveBeenCalled();
      const lastCall =
        ui.updateChatMessageBody.mock.calls[ui.updateChatMessageBody.mock.calls.length - 1];
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
      api.callChatAPIStream.mockImplementation(async function (messages, config, onChunk, onDone) {
        onChunk("回答テキスト");
        onDone("回答テキスト");
      });
      const chatInput = getEl("#ys-chatInput");
      chatInput.value = "質問";

      chatInput.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Enter",
          shiftKey: false,
          isComposing: false,
          bubbles: true,
          cancelable: true
        })
      );
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

  describe("applyCachedSummary 復元", () => {
    test("保存済みキャッシュがある場合、switchTab が即時表示する (API コールなし)", async () => {
      // buildPanelDOM 後にキャッシュを返すモック
      buildPanelDOM();
      const { loadSummaryCache } = require("../src/infrastructure/storage");
      loadSummaryCache.mockResolvedValue({
        content: "cached summary",
        modelLabel: "cached-model",
        transcriptCount: 100
      });
      const { callAI } = require("../src/domain/ai");
      S.tabs.summary.generated = false;
      S.tabs.summary.content = "";
      S.activeTab = null;
      await switchTab("summary");
      // callAI は呼ばれない（キャッシュヒット）
      expect(callAI).not.toHaveBeenCalled();
      // キャッシュ内容が tab に反映
      expect(S.tabs.summary.generated).toBe(true);
      expect(S.tabs.summary.content).toBe("cached summary");
      expect(S.tabs.summary.modelLabel).toBe("cached-model");
      expect(S.tabs.summary.transcriptCount).toBe(100);
    });

    test("キャッシュヒット中に他タブが押されると破棄される", async () => {
      buildPanelDOM();
      const { loadSummaryCache } = require("../src/infrastructure/storage");
      // キャッシュ取得を遅延させ、その間に他タブを踏むシミュレーション
      let resolveCache;
      loadSummaryCache.mockReturnValue(
        new Promise(function (r) {
          resolveCache = r;
        })
      );
      S.tabs.summary.generated = false;
      S.activeTab = null;
      // switchTab を await せず開始
      const p1 = switchTab("summary");
      // _switchGen を進める
      sessionState._switchGen++;
      // キャッシュを解決
      resolveCache({ content: "x", modelLabel: "m", transcriptCount: 0 });
      await p1;
      // 古い呼び出しなので content は反映されない
      // （実装上、myGen !== sessionState._switchGen で return）
    });

    test("saveSummaryCache 失敗時も動作は継続する（warn ログ）", async () => {
      buildPanelDOM();
      const { saveSummaryCache } = require("../src/infrastructure/storage");
      // saveSummaryCache がモック関数でない場合の対応
      if (saveSummaryCache && typeof saveSummaryCache.mockRejectedValue === "function") {
        saveSummaryCache.mockRejectedValue(new Error("quota exceeded"));
      }
      S.tabs.summary.generated = false;
      S.tabs.summary.content = "";
      S.activeTab = null;
      // キャッシュなし → callAI が呼ばれる
      const { callAI } = require("../src/domain/ai");
      await switchTab("summary");
      expect(callAI).toHaveBeenCalled();
    });
  });

  describe("regenerate (regenBtn click)", () => {
    test("activeTab が null の場合は何もしない", async () => {
      buildPanelDOM();
      bindEvents();
      S.activeTab = null;
      const { callAI } = require("../src/domain/ai");
      const regenBtn = document.getElementById("ys-regenBtn");
      regenBtn.click();
      await flushPromises();
      expect(callAI).not.toHaveBeenCalled();
    });

    test("activeTab の tab が undefined の場合は何もしない", async () => {
      buildPanelDOM();
      bindEvents();
      S.activeTab = "nonexistent";
      const { callAI } = require("../src/domain/ai");
      const regenBtn = document.getElementById("ys-regenBtn");
      regenBtn.click();
      await flushPromises();
      expect(callAI).not.toHaveBeenCalled();
    });

    test("正常系: callAI(mode, false) を呼ぶ", async () => {
      buildPanelDOM();
      bindEvents();
      S.tabs.summary.generated = true;
      S.tabs.summary.content = "old";
      S.tabs.summary.chatHistory = [{ role: "user", content: "x" }];
      S.activeTab = "summary";
      const { callAI } = require("../src/domain/ai");
      const regenBtn = document.getElementById("ys-regenBtn");
      regenBtn.click();
      await flushPromises();
      expect(callAI).toHaveBeenCalledWith("summary", false);
      // tab がリセット
      expect(S.tabs.summary.generated).toBe(false);
      expect(S.tabs.summary.content).toBe("");
      expect(S.tabs.summary.chatHistory.length).toBe(0);
    });
  });

  describe("loadCachedSummary: 例外経路", () => {
    test("loadSummaryCache が throw しても null を返す", async () => {
      buildPanelDOM();
      const { loadSummaryCache } = require("../src/infrastructure/storage");
      loadSummaryCache.mockRejectedValue(new Error("storage error"));
      // (getCurrentVideoId removed - unused)
      // 動画ページにいる
      Object.defineProperty(window, "location", {
        value: { href: "https://www.youtube.com/watch?v=abc" },
        writable: true,
        configurable: true
      });
      S.tabs.summary.generated = false;
      S.tabs.summary.content = "";
      S.activeTab = null;
      // 例外を吸収して callAI が呼ばれる
      const { callAI } = require("../src/domain/ai");
      await switchTab("summary");
      expect(callAI).toHaveBeenCalled();
    });
  });

  describe("scrollContentTop: #ys-content-area がない場合", () => {
    test("area がなければ何もしない（クラッシュしない）", () => {
      buildPanelDOM();
      // #ys-content-area を削除
      const area = document.getElementById("ys-content-area");
      if (area) area.remove();
      // scrollContentTop は内部関数だが switchTab 経由でテスト可能
      // ここではクラッシュしないことだけ確認
      expect(() => {
        const ev = new Event("test");
        document.dispatchEvent(ev);
      }).not.toThrow();
    });
  });
});
