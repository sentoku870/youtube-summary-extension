// tests/ai.test.js — AI呼び出し・要約の純粋関数テスト

// window のモックを require より前に設定（IIFE実行時に S = window.__ysState が評価されるため）
global.window = global.window || {};

// 共有状態の初期化
global.window.__ysState = {
  panelEl: null,
  transcriptText: "",
  preloadedTranscript: null,
  transcriptReady: false,
  activeTab: null,
  eventsBound: false,
  tabs: {},
  abortController: null,
  pendingRetry: false,
  videoMeta: null
};

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

// モジュールをrequire（この時点でIIFEが実行され、window.__ysState / chrome が参照される）
require("../src/infrastructure/errors");
require("../src/shared/utils");
require("../src/infrastructure/storage");

const {
  formatTranscriptWithTimestamps,
  buildMetaContext,
  createTimeoutPromise,
  finalizeResult,
  resolveApiConfig,
  fetchConfigAndPrompt,
  abortCurrentStream,
  showError,
  linkTimestamps
} = require("../src/domain/ai");

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
  getSummaryTextEl: function() { return global.YsPanel.getEl("#ys-summaryText"); },
  updateTabUI: global.YsTabs.updateTabUI
});

// YsTimeoutError の参照（ESMから取得）
const { YsTimeoutError } = require("../src/infrastructure/errors");

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
    const items = [
      { text: "Hello" },
      { text: "World" }
    ];
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
    global.window.__ysState.activeTab = "summary";
    global.window.__ysState.tabs = {
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
    const tab = global.window.__ysState.tabs.summary;
    const config = { apiModel: "gpt-4o" };
    const transcript = { all: ["line1", "line2"] };

    finalizeResult("summary", tab, "要約テキスト", config, "システムプロンプト", "ユーザーメッセージ", transcript);

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
    const tab = global.window.__ysState.tabs.summary;
    const config = { apiModel: "gpt-4o" };
    const transcript = { all: ["line1"] };

    finalizeResult("summary", tab, "text", config, "prompt", "msg", transcript);

    expect(YsUI.hideProgress).toHaveBeenCalled();
    expect(YsUI.setSummaryContent).toHaveBeenCalledWith("text");
    expect(YsUI.showChatArea).toHaveBeenCalled();
    expect(YsTabs.updateTabUI).toHaveBeenCalled();
  });

  test("アクティブタブと異なる場合はUIを更新しない", () => {
    global.window.__ysState.activeTab = "customA";
    const tab = global.window.__ysState.tabs.summary;
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
      .mockResolvedValue({ apiConfigs: [{ id: "cfg1", apiKey: "key1" }, { id: "cfg2", apiKey: "key2" }] });

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
      .mockResolvedValueOnce({ apiConfigs: [] })
      .mockResolvedValue({ apiConfig: null }); // レガシーもなし

    const result = await fetchConfigAndPrompt("summary");
    expect(result).toBeNull();
  });
});

// ===== abortCurrentStream =====
describe("abortCurrentStream", () => {
  test("アクティブなAbortControllerを中断する", () => {
    const abortSpy = jest.fn();
    global.window.__ysState.abortController = { abort: abortSpy };
    
    abortCurrentStream();
    expect(abortSpy).toHaveBeenCalled();
    expect(global.window.__ysState.abortController).toBeNull();
  });

  test("AbortControllerがない場合は何もしない", () => {
    global.window.__ysState.abortController = null;
    expect(() => abortCurrentStream()).not.toThrow();
  });
});