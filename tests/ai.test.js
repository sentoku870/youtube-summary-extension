// tests/ai.test.js — AI呼び出し・要約の純粋関数テスト

// window のモックを require より前に設定
global.window = global.window || {};

// state.js の uiState / sessionState を直接 import
const { uiState: U, sessionState: S, resetSession } = require("../src/shared/state");

// YsUI のモック
global.YsUI = {
  showError: jest.fn(),
  hideError: jest.fn(),
  hideProgress: jest.fn(),
  setSummaryContent: jest.fn(),
  clearSummaryContent: jest.fn(),
  updateInfoLabel: jest.fn(),
  showChatArea: jest.fn(),
  focusChatInput: jest.fn(),
  enableSendButton: jest.fn(),
  showCopyButton: jest.fn(),
  showRegenButton: jest.fn(),
  showProgress: jest.fn()
};

// YsPanel のモック
global.YsPanel = {
  getEl: jest.fn()
};

// YsTabs のモック
global.YsTabs = {
  updateTabUI: jest.fn(),
  updateTabActive: jest.fn()
};

// chrome.storage.local のモック（require前に設定）
// runtime.id も含めないと isExtensionContextValid() がfalseになりstorage操作が全てスキップされる
global.chrome = {
  runtime: { id: "test-extension-id" },
  storage: {
    local: {
      get: jest.fn(),
      set: jest.fn(),
      remove: jest.fn()
    }
  }
};

// モジュールをrequire
require("../src/infrastructure/errors");
require("../src/shared/utils");
require("../src/infrastructure/storage");

// callAI のテストのため api.js をモック化（既存の純粋関数テストには影響しない）
jest.mock("../src/domain/api.js", () => ({
  callChatAPIStream: jest.fn(),
  callChatAPINonStream: jest.fn()
}));

const {
  formatTranscriptWithTimestamps,
  buildMetaContext,
  createTimeoutPromise,
  finalizeResult,
  resolveApiConfig,
  fetchConfigAndPrompt,
  abortCurrentStream,
  callAI
} = require("../src/domain/ai");

// モック化された api.js の関数を取得
const { callChatAPIStream, callChatAPINonStream } = require("../src/domain/api");

// 各テスト前に sessionState を初期値にリセット（ai.js と共有されるシングルトン）
// uiState.tabs は createPanel() で再構築されるため、テストでは明示的に作る
function resetSharedSession() {
  resetSession();
  U.tabs = {};
}

beforeEach(() => {
  resetSharedSession();
});

// Port/Adapter: テスト用にモックアダプターを注入
const { setUiAdapter } = require("../src/domain/ports");
setUiAdapter({
  showError: global.YsUI.showError,
  hideError: global.YsUI.hideError,
  hideProgress: global.YsUI.hideProgress,
  showProgress: global.YsUI.showProgress,
  setSummaryContent: global.YsUI.setSummaryContent,
  clearSummaryContent: global.YsUI.clearSummaryContent,
  updateInfoLabel: global.YsUI.updateInfoLabel,
  showChatArea: global.YsUI.showChatArea,
  focusChatInput: global.YsUI.focusChatInput,
  enableSendButton: global.YsUI.enableSendButton,
  showCopyButton: global.YsUI.showCopyButton,
  showRegenButton: global.YsUI.showRegenButton,
  getSummaryTextEl: function () {
    return global.YsPanel.getEl("#ys-summaryText");
  },
  updateTabUI: global.YsTabs.updateTabUI
});

// YsTimeoutError の参照（ESMから取得）
const { YsTimeoutError, YsAbortError, YsAPIError } = require("../src/infrastructure/errors");

// ===== formatTranscriptWithTimestamps =====
describe("formatTranscriptWithTimestamps", () => {
  test("空の配列は空文字を返す", () => {
    expect(formatTranscriptWithTimestamps([])).toBe("");
    expect(formatTranscriptWithTimestamps(null)).toBe("");
    expect(formatTranscriptWithTimestamps(undefined)).toBe("");
  });

  test("タイムスタンプ付きフォーマットに変換する", () => {
    const items = [
      { text: "Hello", offset: 1000, duration: 2000 },
      { text: "World", offset: 5000, duration: 1500 }
    ];
    const result = formatTranscriptWithTimestamps(items);
    expect(result).toBe("[00:01] Hello\n[00:05] World");
  });

  test("オフセットがない場合はタイムスタンプなし", () => {
    const items = [{ text: "Hello" }, { text: "World" }];
    const result = formatTranscriptWithTimestamps(items);
    expect(result).toBe("Hello\nWorld");
  });

  test("ミリ秒を正しく分:秒に変換する", () => {
    const items = [
      { text: "Start", offset: 0, duration: 1000 },
      { text: "One minute", offset: 60000, duration: 5000 },
      { text: "Ten minutes", offset: 600000, duration: 10000 }
    ];
    const result = formatTranscriptWithTimestamps(items);
    expect(result).toBe("[00:00] Start\n[01:00] One minute\n[10:00] Ten minutes");
  });
});

// ===== buildMetaContext =====
describe("buildMetaContext", () => {
  test("null/undefinedの場合は空文字を返す", () => {
    expect(buildMetaContext(null)).toBe("");
    expect(buildMetaContext(undefined)).toBe("");
  });

  test("全ての項目が揃っている場合", () => {
    const meta = {
      title: "テスト動画",
      author: "テストチャンネル",
      shortDescription: "これは説明文です",
      viewCount: "1000000",
      lengthSeconds: "3661",
      keywords: "tag1, tag2"
    };
    const result = buildMetaContext(meta);
    expect(result).toContain("テスト動画");
    expect(result).toContain("テストチャンネル");
    expect(result).toContain("これは説明文です");
    expect(result).toContain("1,000,000");
    expect(result).toContain("61分1秒");
    expect(result).toContain("tag1, tag2");
  });

  test("説明文が200文字を超える場合はtruncateされる", () => {
    const meta = {
      title: "test",
      shortDescription: "あ".repeat(300)
    };
    const result = buildMetaContext(meta);
    expect(result).toContain("...");
    expect(result.length).toBeLessThan(600);
  });

  test("数値のviewCountをロケール形式に変換", () => {
    const meta = {
      title: "test",
      viewCount: "5000000"
    };
    const result = buildMetaContext(meta);
    expect(result).toContain("5,000,000");
  });

  test("再生時間の秒数がない場合は分のみ表示", () => {
    const meta = {
      title: "test",
      lengthSeconds: "120"
    };
    const result = buildMetaContext(meta);
    expect(result).toContain("2分");
  });
});

// ===== createTimeoutPromise =====
describe("createTimeoutPromise", () => {
  test("YsTimeoutErrorでrejectする", async () => {
    jest.useFakeTimers();
    const promise = createTimeoutPromise();
    jest.advanceTimersByTime(180000);
    await expect(promise).rejects.toThrow(YsTimeoutError);
    jest.useRealTimers();
  }, 1000);
});

// ===== finalizeResult =====
describe("finalizeResult", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    U.activeTab = "summary";
    U.tabs = {
      summary: {
        generated: false,
        content: "",
        config: null,
        modelLabel: "",
        transcriptCount: 0,
        chatHistory: []
      }
    };
    chrome.storage.local.set.mockResolvedValue(undefined);
    chrome.storage.local.get.mockResolvedValue({});
  });

  test("タブの状態を正しく更新する", () => {
    const tab = U.tabs.summary;
    const config = { apiModel: "gpt-4o" };
    const transcript = { all: ["line1", "line2"] };

    finalizeResult(
      "summary",
      tab,
      "要約テキスト",
      config,
      "システムプロンプト",
      "ユーザーメッセージ",
      transcript
    );

    expect(tab.generated).toBe(true);
    expect(tab.content).toBe("要約テキスト");
    expect(tab.config).toBe(config);
    expect(tab.modelLabel).toBe("gpt-4o");
    expect(tab.transcriptCount).toBe(2);
    expect(tab.chatHistory.length).toBe(3);
    expect(tab.chatHistory[0].role).toBe("system");
    expect(tab.chatHistory[2].role).toBe("assistant");
    expect(tab.chatHistory[2].content).toBe("要約テキスト");
  });

  test("アクティブタブと一致する場合UIを更新する", () => {
    const tab = U.tabs.summary;
    const config = { apiModel: "gpt-4o" };
    const transcript = { all: ["line1"] };

    finalizeResult("summary", tab, "text", config, "prompt", "msg", transcript);

    expect(YsUI.hideProgress).toHaveBeenCalled();
    expect(YsUI.setSummaryContent).toHaveBeenCalledWith("text");
    expect(YsUI.showChatArea).toHaveBeenCalled();
    expect(YsTabs.updateTabUI).toHaveBeenCalled();
  });

  test("アクティブタブと異なる場合はUIを更新しない", () => {
    U.activeTab = "customA";
    const tab = U.tabs.summary;
    const config = { apiModel: "gpt-4o" };
    const transcript = { all: ["line1"] };

    finalizeResult("summary", tab, "text", config, "prompt", "msg", transcript);

    expect(YsUI.hideProgress).not.toHaveBeenCalled();
    expect(YsTabs.updateTabUI).toHaveBeenCalled();
  });
});

// ===== resolveApiConfig =====
describe("resolveApiConfig", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("configIdが指定されていて該当する設定があればそれを返す", async () => {
    chrome.storage.local.get
      .mockResolvedValueOnce({ btnApiConfig_summary: "cfg1" })
      .mockResolvedValueOnce({ apiConfigs: [{ id: "cfg1", apiKey: "key1", label: "My Config" }] });

    const result = await resolveApiConfig("summary");
    expect(result.id).toBe("cfg1");
    expect(result.apiKey).toBe("key1");
  });

  test("configIdに対応する設定がない場合は最初の有効な設定を返す", async () => {
    chrome.storage.local.get
      .mockResolvedValueOnce({ btnApiConfig_summary: "cfg999" })
      .mockResolvedValueOnce({ apiConfigs: [{ id: "cfg999" }] }) // apiKeyなし
      .mockResolvedValue({
        apiConfigs: [
          { id: "cfg1", apiKey: "key1" },
          { id: "cfg2", apiKey: "key2" }
        ]
      });

    const result = await resolveApiConfig("summary");
    expect(result.id).toBe("cfg1");
    expect(result.apiKey).toBe("key1");
  });

  test("有効な設定がない場合はnullを返す", async () => {
    chrome.storage.local.get
      .mockResolvedValueOnce({ btnApiConfig_summary: null })
      .mockResolvedValue({ apiConfigs: [{ id: "cfg1" }, { id: "cfg2" }] }); // apiKeyなし

    const result = await resolveApiConfig("summary");
    expect(result).toBeNull();
  });
});

// ===== fetchConfigAndPrompt =====
describe("fetchConfigAndPrompt", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("通常の設定とプロンプトを解決する", async () => {
    chrome.storage.local.get
      .mockResolvedValueOnce({ btnApiConfig_summary: "cfg1" })
      .mockResolvedValueOnce({ apiConfigs: [{ id: "cfg1", apiKey: "key1" }] })
      .mockResolvedValueOnce({ prompt_summary: "カスタムプロンプト" });

    const result = await fetchConfigAndPrompt("summary");
    expect(result.config.apiKey).toBe("key1");
    expect(result.prompt).toBe("カスタムプロンプト");
  });

  test("カスタムプロンプトがない場合はデフォルトプロンプトを使用する", async () => {
    chrome.storage.local.get
      .mockResolvedValueOnce({ btnApiConfig_summary: "cfg1" })
      .mockResolvedValueOnce({ apiConfigs: [{ id: "cfg1", apiKey: "key1" }] })
      .mockResolvedValueOnce({ prompt_summary: undefined });

    const result = await fetchConfigAndPrompt("summary");
    expect(result.config.apiKey).toBe("key1");
    expect(result.prompt).toContain("要約");
  });

  test("API設定がない場合はnullを返す", async () => {
    chrome.storage.local.get
      .mockResolvedValueOnce({ btnApiConfig_summary: null })
      .mockResolvedValueOnce({ apiConfigs: [] });

    const result = await fetchConfigAndPrompt("summary");
    expect(result).toBeNull();
  });
});

// ===== abortCurrentStream =====
describe("abortCurrentStream", () => {
  test("アクティブなAbortControllerを中断する", () => {
    const abortSpy = jest.fn();
    S.abortController = { abort: abortSpy };

    abortCurrentStream();
    expect(abortSpy).toHaveBeenCalled();
    expect(S.abortController).toBeNull();
  });

  test("AbortControllerがない場合は何もしない", () => {
    S.abortController = null;
    expect(() => abortCurrentStream()).not.toThrow();
  });
});

// ===== callAI（包括テスト） =====
// callAI はドメイン層のメインオーケストレーション関数。
// api.js は jest.mock で、transcript は state.preloadedTranscript 経由で、
// storage は chrome.storage.local で、それぞれモック化済み。
describe("callAI", () => {
  // callAI 用の共通セットアップ
  function setupState(transcript) {
    U.activeTab = "summary";
    U.tabs = {
      summary: {
        generated: false,
        content: "",
        config: null,
        modelLabel: "",
        transcriptCount: 0,
        chatHistory: []
      }
    };
    S.abortController = null;
    S.videoMeta = null;
    S.transcriptText = "";
    S.preloadedTranscript = transcript;

    // saveSummaryCache が window.location.search を参照するため設定
    Object.defineProperty(window, "location", {
      value: {
        href: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        search: "?v=dQw4w9WgXcQ",
        pathname: "/watch"
      },
      writable: true,
      configurable: true
    });
  }

  // API設定とプロンプトの解決に成功するよう chrome.storage を設定
  function setupConfigStorage() {
    chrome.storage.local.get
      .mockResolvedValueOnce({ btnApiConfig_summary: "cfg1" })
      .mockResolvedValueOnce({
        apiConfigs: [{ id: "cfg1", apiKey: "key1", apiModel: "gpt-4", maxTokens: "4096" }]
      })
      .mockResolvedValueOnce({ prompt_summary: "カスタムプロンプト" });
    chrome.storage.local.set.mockResolvedValue(undefined);
  }

  beforeEach(() => {
    jest.clearAllMocks();
    callChatAPIStream.mockReset();
    callChatAPINonStream.mockReset();
    chrome.storage.local.get.mockReset();
    chrome.storage.local.set.mockReset();
    chrome.storage.local.remove.mockReset();
  });

  test("単一ストリーム成功: 字幕→設定解決→ストリーミング→finalize", async () => {
    // 短い字幕（gpt-4 なら available=2457、これより小さく単一ストリーム）
    setupState({
      all: ["あ".repeat(500)], // 約1000トークン < 2457
      allTimestamps: [],
      meta: { title: "テスト動画" }
    });
    setupConfigStorage();

    callChatAPIStream.mockImplementation(async function (messages, config, onChunk, onDone) {
      onChunk("途中の要約");
      onDone("最終的な要約");
    });

    const result = await callAI("summary", false);

    expect(result).toBe(true);
    // タブ状態の更新
    const tab = U.tabs.summary;
    expect(tab.generated).toBe(true);
    expect(tab.content).toBe("最終的な要約");
    expect(tab.modelLabel).toBe("gpt-4");
    expect(tab.transcriptCount).toBe(1);
    expect(tab.chatHistory).toHaveLength(3);
    expect(tab.chatHistory[2].content).toBe("最終的な要約");
    // UI表示の呼び出し
    expect(YsUI.setSummaryContent).toHaveBeenCalledWith("最終的な要約");
    expect(YsUI.showChatArea).toHaveBeenCalled();
    expect(YsUI.showCopyButton).toHaveBeenCalled();
    expect(YsUI.showRegenButton).toHaveBeenCalled();
    expect(YsTabs.updateTabUI).toHaveBeenCalled();
    // ストレージ保存
    expect(chrome.storage.local.set).toHaveBeenCalled();
  });

  test("Map-Reduceパス: 字幕が長大な場合はチャンク分割して統合", async () => {
    // gpt-4 (available=2457) を超える長さ
    setupState({
      all: ["あ".repeat(2000)], // 約4000トークン > 2457
      allTimestamps: []
    });
    setupConfigStorage();

    // 各チャンク要約を返す
    callChatAPINonStream.mockResolvedValue("チャンク要約");
    // 最終統合ストリーム
    callChatAPIStream.mockImplementation(async function (messages, config, onChunk, onDone) {
      onDone("統合された要約");
    });

    const result = await callAI("summary", false);

    expect(result).toBe(true);
    // callChatAPINonStream がチャンク分（2回以上）呼ばれる
    expect(callChatAPINonStream.mock.calls.length).toBeGreaterThanOrEqual(2);
    // 最終統合のストリーム呼び出し
    expect(callChatAPIStream).toHaveBeenCalled();
    // タブ状態
    const tab = U.tabs.summary;
    expect(tab.generated).toBe(true);
    expect(tab.content).toBe("統合された要約");
  });

  test("字幕が空の場合はshowErrorでfalseを返す", async () => {
    setupState({ all: [], allTimestamps: [] });
    setupConfigStorage();

    const result = await callAI("summary", false);

    expect(result).toBe(false);
    expect(YsUI.showError).toHaveBeenCalledWith("字幕が見つかりませんでした。");
    expect(callChatAPIStream).not.toHaveBeenCalled();
  });

  test("API設定が未解決の場合はshowErrorでfalseを返す", async () => {
    setupState({
      all: ["あ".repeat(100)],
      allTimestamps: []
    });
    // どのストレージキーも空 → config解決失敗
    chrome.storage.local.get.mockResolvedValue({});

    const result = await callAI("summary", false);

    expect(result).toBe(false);
    expect(YsUI.showError).toHaveBeenCalledWith(
      "API設定がされていません。オプション画面で設定してください。"
    );
  });

  test("callChatAPIStreamがYsAbortErrorでrejectされた場合はfalseを返す", async () => {
    setupState({
      all: ["あ".repeat(500)],
      allTimestamps: []
    });
    setupConfigStorage();

    callChatAPIStream.mockRejectedValue(new YsAbortError("中断されました"));

    const result = await callAI("summary", false);

    expect(result).toBe(false);
    expect(YsUI.hideProgress).toHaveBeenCalled();
  });

  test("callChatAPIStreamがYsTimeoutErrorでrejectされた場合はfalseを返す", async () => {
    setupState({
      all: ["あ".repeat(500)],
      allTimestamps: []
    });
    setupConfigStorage();

    callChatAPIStream.mockRejectedValue(new YsTimeoutError("タイムアウトしました"));

    const result = await callAI("summary", false);

    expect(result).toBe(false);
    expect(YsUI.hideProgress).toHaveBeenCalled();
  });

  test("callChatAPIStreamがYsAPIErrorでrejectされた場合はshowErrorでfalseを返す", async () => {
    setupState({
      all: ["あ".repeat(500)],
      allTimestamps: []
    });
    setupConfigStorage();

    callChatAPIStream.mockRejectedValue(new YsAPIError("APIエラー発生", 500, ""));

    const result = await callAI("summary", false);

    expect(result).toBe(false);
    expect(YsUI.clearSummaryContent).toHaveBeenCalled();
    expect(YsUI.showError).toHaveBeenCalledWith("エラー: APIエラー発生");
    expect(YsUI.hideProgress).toHaveBeenCalled();
  });

  test("DOMException AbortErrorの場合はサイレントにfalseを返す（showErrorなし）", async () => {
    setupState({
      all: ["あ".repeat(500)],
      allTimestamps: []
    });
    setupConfigStorage();

    const abortErr = new DOMException("aborted", "AbortError");
    callChatAPIStream.mockRejectedValue(abortErr);

    const result = await callAI("summary", false);

    expect(result).toBe(false);
    expect(YsUI.hideProgress).toHaveBeenCalled();
    expect(YsUI.showError).not.toHaveBeenCalled();
  });

  test("useAbort=trueの場合は既存のAbortControllerを中断してから開始する", async () => {
    setupState({
      all: ["あ".repeat(500)],
      allTimestamps: []
    });
    setupConfigStorage();

    const abortSpy = jest.fn();
    S.abortController = { abort: abortSpy };

    callChatAPIStream.mockImplementation(async function (messages, config, onChunk, onDone) {
      onDone("要約");
    });

    await callAI("summary", true);

    expect(abortSpy).toHaveBeenCalled();
  });

  // ===== 追加: Map-Reduce の失敗系と allTimestamps 経路 =====
  test("Map-Reduce全チャンク失敗: showError で false を返す", async () => {
    setupState({
      all: ["あ".repeat(2000)], // 約4000トークン
      allTimestamps: []
    });
    setupConfigStorage();

    // すべてのチャンク要約が null (processSingleChunk が maxAttempts 到達で失敗)
    callChatAPINonStream.mockResolvedValue(null);
    // 統合ストリームは呼ばれない
    callChatAPIStream.mockImplementation(async function () {
      throw new Error("should not be called");
    });

    const result = await callAI("summary", false);

    expect(result).toBe(false);
    expect(YsUI.showError).toHaveBeenCalledWith(
      expect.stringContaining("すべてのチャンクの処理に失敗")
    );
  });

  test("Map-Reduce 一部チャンク失敗: 成功した分だけで統合", async () => {
    setupState({
      all: ["あ".repeat(3000)], // 大容量
      allTimestamps: []
    });
    setupConfigStorage();

    // 最初のリトライで成功 → リトライはスキップされる
    callChatAPINonStream.mockResolvedValue("部分要約");
    callChatAPIStream.mockImplementation(async function (messages, config, onChunk, onDone) {
      onDone("統合結果");
    });

    const result = await callAI("summary", false);

    expect(result).toBe(true);
    expect(callChatAPINonStream).toHaveBeenCalled();
    expect(YsUI.showError).not.toHaveBeenCalled();
    const tab = U.tabs.summary;
    expect(tab.content).toBe("統合結果");
  });

  test("allTimestamps がある字幕: formatTranscriptWithTimestamps 経路で処理", async () => {
    // allTimestamps がある場合、resolveTranscriptText は formatTranscriptWithTimestamps を使う
    // 短い字幕で単一ストリームに
    setupState({
      all: ["fallback"],
      allTimestamps: [
        { text: "あ", offset: 0 },
        { text: "い", offset: 60000 },
        { text: "う", offset: 120000 }
      ],
      meta: { title: "t" }
    });
    setupConfigStorage();

    callChatAPIStream.mockImplementation(async function (messages, config, onChunk, onDone) {
      // messages の user content に [00:00] 形式が含まれることを確認
      const userContent = messages.find(function (m) {
        return m.role === "user";
      }).content;
      expect(userContent).toContain("[00:00] あ");
      expect(userContent).toContain("[01:00] い");
      expect(userContent).toContain("[02:00] う");
      onDone("ok");
    });

    const result = await callAI("summary", false);
    expect(result).toBe(true);
  });

  test("中断系: '中断' メッセージだけでは showError が呼ばれる（文字列判定廃止）", async () => {
    setupState({
      all: ["あ".repeat(500)],
      allTimestamps: []
    });
    setupConfigStorage();

    // 旧: 文字列 "中断" で silent false だったが、型/フラグ判定に変更
    callChatAPIStream.mockRejectedValue(new Error("処理が中断されました"));

    const result = await callAI("summary", false);

    expect(result).toBe(false);
    expect(YsUI.hideProgress).toHaveBeenCalled();
    // 型でも signal.aborted でもないエラーは通常エラーとして表示
    expect(YsUI.showError).toHaveBeenCalledWith("エラー: 処理が中断されました");
  });

  test("中断系: signal.aborted 時にサイレント false", async () => {
    setupState({
      all: ["あ".repeat(500)],
      allTimestamps: []
    });
    setupConfigStorage();

    // callAI 実行後に abortController.signal を abort する特殊実装
    callChatAPIStream.mockImplementation(async function () {
      // callAI 側で S.abortController が作られてから reject する
      if (S.abortController) S.abortController.abort();
      throw new Error("any error");
    });

    const result = await callAI("summary", false);

    expect(result).toBe(false);
    expect(YsUI.hideProgress).toHaveBeenCalled();
    // signal.aborted 経由なので showError は呼ばれない
    expect(YsUI.showError).not.toHaveBeenCalled();
  });

  test("window.location の videoId 抽出: 通常の watch URL から保存", async () => {
    setupState({
      all: ["あ".repeat(500)],
      allTimestamps: []
    });
    setupConfigStorage();

    callChatAPIStream.mockImplementation(async function (messages, config, onChunk, onDone) {
      onDone("要約");
    });

    await callAI("summary", false);

    // saveSummaryCache が呼ばれる
    // storage.local.set のいずれかの呼び出しで summary_cache_dQw4w9WgXcQ が含まれる
    const setCalls = chrome.storage.local.set.mock.calls;
    const found = setCalls.some(function (call) {
      return call[0] && call[0]["summary_cache_dQw4w9WgXcQ"];
    });
    expect(found).toBe(true);
  });

  test("window.location が /shorts/ 形式でも videoId を抽出", async () => {
    setupState({
      all: ["あ".repeat(500)],
      allTimestamps: []
    });
    setupConfigStorage();

    // /shorts/<id> 形式の URL
    Object.defineProperty(window, "location", {
      value: {
        href: "https://www.youtube.com/shorts/abc123XYZ45",
        search: "",
        pathname: "/shorts/abc123XYZ45"
      },
      writable: true,
      configurable: true
    });

    callChatAPIStream.mockImplementation(async function (messages, config, onChunk, onDone) {
      onDone("ok");
    });

    await callAI("summary", false);

    const setCalls = chrome.storage.local.set.mock.calls;
    const found = setCalls.some(function (call) {
      return call[0] && call[0]["summary_cache_abc123XYZ45"];
    });
    expect(found).toBe(true);
  });
});
