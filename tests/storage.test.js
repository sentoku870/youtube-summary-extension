// tests/storage.test.js — ストレージ層の単体テスト
const storage = require("../src/infrastructure/storage");

// chrome.storage.local のモック（runtime.idも含めないと isExtensionContextValid() がfalseになる）
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

describe("loadApiConfigs", () => {
  beforeEach(() => {
    chrome.storage.local.get.mockReset();
  });

  test("設定がない場合は空配列を返す", async () => {
    chrome.storage.local.get.mockResolvedValue({ apiConfigs: undefined });
    const result = await storage.loadApiConfigs();
    expect(result).toEqual([]);
  });

  test("設定がある場合はその配列を返す", async () => {
    const configs = [{ id: "1", label: "test", apiKey: "key" }];
    chrome.storage.local.get.mockResolvedValue({ apiConfigs: configs });
    const result = await storage.loadApiConfigs();
    expect(result).toEqual(configs);
  });
});

describe("loadApiConfigById", () => {
  beforeEach(() => {
    chrome.storage.local.get.mockReset();
  });

  test("IDが一致する設定を返す", async () => {
    const configs = [
      { id: "1", label: "test1", apiKey: "key1" },
      { id: "2", label: "test2", apiKey: "key2" }
    ];
    chrome.storage.local.get.mockResolvedValue({ apiConfigs: configs });
    const result = await storage.loadApiConfigById("2");
    expect(result).toEqual({ id: "2", label: "test2", apiKey: "key2" });
  });

  test("IDが一致しない場合はnullを返す", async () => {
    chrome.storage.local.get.mockResolvedValue({ apiConfigs: [{ id: "1", label: "test" }] });
    const result = await storage.loadApiConfigById("999");
    expect(result).toBeNull();
  });
});

describe("saveToStorage", () => {
  beforeEach(() => {
    chrome.storage.local.set.mockReset();
  });

  test("要約結果と字幕を保存する", async () => {
    chrome.storage.local.set.mockResolvedValue(undefined);
    await storage.saveToStorage("summary text", ["line1", "line2"]);
    expect(chrome.storage.local.set).toHaveBeenCalledWith({
      latestSummary: "summary text",
      latestCaptions: ["line1", "line2"]
    });
  });
});

describe("loadSubtitleLang", () => {
  beforeEach(() => {
    chrome.storage.local.get.mockReset();
  });

  test("設定がない場合はautoを返す", async () => {
    chrome.storage.local.get.mockResolvedValue({ subtitleLang: undefined });
    const result = await storage.loadSubtitleLang();
    expect(result).toBe("auto");
  });

  test("設定がある場合はその値を返す", async () => {
    chrome.storage.local.get.mockResolvedValue({ subtitleLang: "en" });
    const result = await storage.loadSubtitleLang();
    expect(result).toBe("en");
  });
});

describe("loadFontSize", () => {
  beforeEach(() => {
    chrome.storage.local.get.mockReset();
  });

  test("設定がない場合は13を返す", async () => {
    chrome.storage.local.get.mockResolvedValue({ fontSize: undefined });
    const result = await storage.loadFontSize();
    expect(result).toBe("13");
  });
});

describe("loadCustomPrompt", () => {
  beforeEach(() => {
    chrome.storage.local.get.mockReset();
  });

  test("プロンプト設定がない場合は空文字を返す", async () => {
    chrome.storage.local.get.mockResolvedValue({ prompt_summary: undefined });
    const result = await storage.loadCustomPrompt("summary");
    expect(result).toBe("");
  });

  test("プロンプト設定がある場合はその値を返す", async () => {
    chrome.storage.local.get.mockResolvedValue({ prompt_summary: "要約して" });
    const result = await storage.loadCustomPrompt("summary");
    expect(result).toBe("要約して");
  });
});

describe("getDefaultPrompt", () => {
  test("summaryのデフォルトプロンプトを返す", () => {
    const prompt = storage.getDefaultPrompt("summary");
    expect(prompt).toContain("要約");
  });

  test("customAのデフォルトプロンプトを返す", () => {
    const prompt = storage.getDefaultPrompt("customA");
    expect(prompt).toContain("分析");
  });

  test("customBのデフォルトプロンプトを返す", () => {
    const prompt = storage.getDefaultPrompt("customB");
    expect(prompt).toContain("考察");
  });

  test("未知のタイプには空文字を返す", () => {
    const prompt = storage.getDefaultPrompt("unknown");
    expect(prompt).toBe("");
  });
});

// ===== K (ストレージキー定数) =====
describe("K (ストレージキー定数)", () => {
  test("各キーが期待される文字列値を持つ", () => {
    expect(storage.K.API_CONFIGS).toBe("apiConfigs");
    expect(storage.K.API_CONFIG_LEGACY).toBe("apiConfig");
    expect(storage.K.PROMPT_PREFIX).toBe("prompt_");
    expect(storage.K.BTN_TITLE_PREFIX).toBe("btnTitle_");
    expect(storage.K.BTN_API_PREFIX).toBe("btnApiConfig_");
    expect(storage.K.SUBTITLE_LANG).toBe("subtitleLang");
    expect(storage.K.FONT_SIZE).toBe("fontSize");
    expect(storage.K.PANEL_HEIGHT).toBe("panelHeight");
    expect(storage.K.THEME).toBe("theme");
    expect(storage.K.SYSTEM_PROMPT_LEGACY).toBe("systemPrompt");
    expect(storage.K.LATEST_SUMMARY).toBe("latestSummary");
    expect(storage.K.LATEST_CAPTIONS).toBe("latestCaptions");
  });
});

// ===== isExtensionContextValid =====
describe("isExtensionContextValid", () => {
  const origId = chrome.runtime.id;

  afterEach(() => {
    // 各テスト後に chrome.runtime.id を復元
    chrome.runtime.id = origId;
  });

  test("chrome.runtime.idがあればtrueを返す", () => {
    expect(storage.isExtensionContextValid()).toBe(true);
  });

  test("chrome.runtime.idが未設定の場合はfalseを返す", () => {
    delete chrome.runtime.id;
    expect(storage.isExtensionContextValid()).toBe(false);
  });

  test("chrome.runtimeが未定義の場合はfalseを返す", () => {
    const origRuntime = chrome.runtime;
    delete chrome.runtime;
    expect(storage.isExtensionContextValid()).toBe(false);
    chrome.runtime = origRuntime;
  });
});

// ===== 基本プリミティブ: get / set / remove / getAll =====
describe("get", () => {
  beforeEach(() => {
    chrome.storage.local.get.mockReset();
  });

  test("指定キーの値を返す", async () => {
    chrome.storage.local.get.mockResolvedValue({ myKey: "value" });
    const result = await storage.get("myKey");
    expect(result).toBe("value");
  });

  test("コンテキスト無効時はnullを返してストレージにアクセスしない", async () => {
    const origId = chrome.runtime.id;
    delete chrome.runtime.id;
    try {
      const result = await storage.get("myKey");
      expect(result).toBeNull();
      expect(chrome.storage.local.get).not.toHaveBeenCalled();
    } finally {
      chrome.runtime.id = origId;
    }
  });

  test("'context invalidated'エラー時はnullを返す", async () => {
    chrome.storage.local.get.mockRejectedValue(new Error("Extension context invalidated."));
    const result = await storage.get("myKey");
    expect(result).toBeNull();
  });

  test("その他のエラーは再throwする", async () => {
    chrome.storage.local.get.mockRejectedValue(new Error("unknown error"));
    await expect(storage.get("myKey")).rejects.toThrow("unknown error");
  });
});

describe("set", () => {
  beforeEach(() => {
    chrome.storage.local.set.mockReset();
  });

  test("オブジェクトをストレージに保存する", async () => {
    chrome.storage.local.set.mockResolvedValue(undefined);
    await storage.set({ key1: "value1" });
    expect(chrome.storage.local.set).toHaveBeenCalledWith({ key1: "value1" });
  });

  test("コンテキスト無効時はストレージにアクセスしない", async () => {
    const origId = chrome.runtime.id;
    delete chrome.runtime.id;
    try {
      await storage.set({ key1: "value1" });
      expect(chrome.storage.local.set).not.toHaveBeenCalled();
    } finally {
      chrome.runtime.id = origId;
    }
  });

  test("'context invalidated'エラー時は警告して処理をスキップ", async () => {
    chrome.storage.local.set.mockRejectedValue(new Error("Extension context invalidated."));
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    await storage.set({ key1: "value1" });
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});

describe("remove", () => {
  beforeEach(() => {
    chrome.storage.local.remove.mockReset();
  });

  test("指定キーを削除する", async () => {
    chrome.storage.local.remove.mockResolvedValue(undefined);
    await storage.remove("myKey");
    expect(chrome.storage.local.remove).toHaveBeenCalledWith("myKey");
  });

  test("コンテキスト無効時はストレージにアクセスしない", async () => {
    const origId = chrome.runtime.id;
    delete chrome.runtime.id;
    try {
      await storage.remove("myKey");
      expect(chrome.storage.local.remove).not.toHaveBeenCalled();
    } finally {
      chrome.runtime.id = origId;
    }
  });
});

describe("getAll", () => {
  beforeEach(() => {
    chrome.storage.local.get.mockReset();
  });

  test("全ストレージ内容を返す", async () => {
    const allData = { key1: "v1", key2: "v2" };
    chrome.storage.local.get.mockResolvedValue(allData);
    const result = await storage.getAll();
    expect(result).toEqual(allData);
    expect(chrome.storage.local.get).toHaveBeenCalledWith(null);
  });

  test("コンテキスト無効時は空オブジェクトを返す", async () => {
    const origId = chrome.runtime.id;
    delete chrome.runtime.id;
    try {
      const result = await storage.getAll();
      expect(result).toEqual({});
      expect(chrome.storage.local.get).not.toHaveBeenCalled();
    } finally {
      chrome.runtime.id = origId;
    }
  });
});

// ===== loadButtonTitle =====
describe("loadButtonTitle", () => {
  beforeEach(() => {
    chrome.storage.local.get.mockReset();
  });

  test("設定がない場合はnullを返す", async () => {
    chrome.storage.local.get.mockResolvedValue({});
    const result = await storage.loadButtonTitle("summary");
    expect(result).toBeNull();
  });

  test("設定がある場合はその値を返す", async () => {
    chrome.storage.local.get.mockResolvedValue({ btnTitle_summary: "要約" });
    const result = await storage.loadButtonTitle("summary");
    expect(result).toBe("要約");
  });
});

// ===== loadPanelHeight =====
describe("loadPanelHeight", () => {
  beforeEach(() => {
    chrome.storage.local.get.mockReset();
  });

  test("設定がない場合はデフォルト1100を返す", async () => {
    chrome.storage.local.get.mockResolvedValue({});
    const result = await storage.loadPanelHeight();
    expect(result).toBe("1100");
  });

  test("設定がある場合はその値を返す", async () => {
    chrome.storage.local.get.mockResolvedValue({ panelHeight: "800" });
    const result = await storage.loadPanelHeight();
    expect(result).toBe("800");
  });
});

// ===== loadThemeSetting =====
describe("loadThemeSetting", () => {
  beforeEach(() => {
    chrome.storage.local.get.mockReset();
  });

  test("設定がない場合はautoを返す", async () => {
    chrome.storage.local.get.mockResolvedValue({});
    const result = await storage.loadThemeSetting();
    expect(result).toBe("auto");
  });

  test("設定がある場合はその値を返す", async () => {
    chrome.storage.local.get.mockResolvedValue({ theme: "dark" });
    const result = await storage.loadThemeSetting();
    expect(result).toBe("dark");
  });
});

// ===== saveSummaryCache =====
describe("saveSummaryCache", () => {
  beforeEach(() => {
    chrome.storage.local.set.mockReset();
  });

  test("videoId単位でタイムスタンプ付きでキャッシュ保存する", async () => {
    chrome.storage.local.set.mockResolvedValue(undefined);
    const before = Date.now();
    await storage.saveSummaryCache("video123", {
      content: "要約テキスト",
      modelLabel: "gpt-4o",
      transcriptCount: 10
    });
    const after = Date.now();

    const saved = chrome.storage.local.set.mock.calls[0][0];
    const cache = saved["summary_cache_video123"];
    expect(cache).toBeDefined();
    expect(cache.content).toBe("要約テキスト");
    expect(cache.modelLabel).toBe("gpt-4o");
    expect(cache.transcriptCount).toBe(10);
    expect(cache.timestamp).toBeGreaterThanOrEqual(before);
    expect(cache.timestamp).toBeLessThanOrEqual(after);
  });
});

// ===== loadSummaryCache (7日TTL) =====
describe("loadSummaryCache", () => {
  beforeEach(() => {
    chrome.storage.local.get.mockReset();
    chrome.storage.local.remove.mockReset();
  });

  test("キャッシュがない場合はnullを返す", async () => {
    chrome.storage.local.get.mockResolvedValue({});
    const result = await storage.loadSummaryCache("video123");
    expect(result).toBeNull();
  });

  test("新鮮なキャッシュはデータを返す", async () => {
    const cacheData = {
      content: "要約テキスト",
      modelLabel: "gpt-4o",
      transcriptCount: 100,
      timestamp: Date.now()
    };
    chrome.storage.local.get.mockResolvedValue({
      summary_cache_video123: cacheData
    });
    const result = await storage.loadSummaryCache("video123");
    expect(result).toEqual(cacheData);
  });

  test("7日以上経過したキャッシュは削除してnullを返す", async () => {
    const eightDaysAgo = Date.now() - (8 * 24 * 60 * 60 * 1000);
    chrome.storage.local.get.mockResolvedValue({
      summary_cache_video123: {
        content: "古い要約",
        modelLabel: "gpt-4",
        transcriptCount: 50,
        timestamp: eightDaysAgo
      }
    });
    chrome.storage.local.remove.mockResolvedValue(undefined);

    const result = await storage.loadSummaryCache("video123");
    expect(result).toBeNull();
    expect(chrome.storage.local.remove).toHaveBeenCalledWith("summary_cache_video123");
  });

  test("7日ギリギリ（6日と23時間）のキャッシュは返す", async () => {
    const almostSevenDays = Date.now() - (7 * 24 * 60 * 60 * 1000 - 1);
    chrome.storage.local.get.mockResolvedValue({
      summary_cache_video123: {
        content: "期限ギリギリ",
        timestamp: almostSevenDays
      }
    });
    const result = await storage.loadSummaryCache("video123");
    expect(result).not.toBeNull();
    expect(result.content).toBe("期限ギリギリ");
  });
});

// ===== clearSummaryCache =====
describe("clearSummaryCache", () => {
  beforeEach(() => {
    chrome.storage.local.remove.mockReset();
  });

  test("指定videoIdのキャッシュを削除する", async () => {
    chrome.storage.local.remove.mockResolvedValue(undefined);
    await storage.clearSummaryCache("video123");
    expect(chrome.storage.local.remove).toHaveBeenCalledWith("summary_cache_video123");
  });
});

// ===== loadApiConfigLegacy =====
describe("loadApiConfigLegacy", () => {
  beforeEach(() => {
    chrome.storage.local.get.mockReset();
  });

  test("設定がある場合はオブジェクトを返す", async () => {
    const legacy = { apiKey: "old-key", apiUrl: "https://old.api", apiModel: "old" };
    chrome.storage.local.get.mockResolvedValue({ apiConfig: legacy });
    const result = await storage.loadApiConfigLegacy();
    expect(result).toEqual(legacy);
  });

  test("設定がない場合は null を返す", async () => {
    chrome.storage.local.get.mockResolvedValue({});
    const result = await storage.loadApiConfigLegacy();
    expect(result).toBeNull();
  });
});

// ===== loadBtnApiConfigId =====
describe("loadBtnApiConfigId", () => {
  beforeEach(() => {
    chrome.storage.local.get.mockReset();
  });

  test("設定がある場合はその ID を返す", async () => {
    chrome.storage.local.get.mockResolvedValue({ btnApiConfig_summary: "cfg_1" });
    const result = await storage.loadBtnApiConfigId("summary");
    expect(result).toBe("cfg_1");
  });

  test("設定がない場合は null を返す", async () => {
    chrome.storage.local.get.mockResolvedValue({});
    const result = await storage.loadBtnApiConfigId("summary");
    expect(result).toBeNull();
  });
});