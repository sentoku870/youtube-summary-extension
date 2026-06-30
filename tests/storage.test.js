// tests/storage.test.js — ストレージ層の単体テスト
const storage = require("../src/infrastructure/storage");
const storageCore = require("../src/infrastructure/storage-core");

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

describe("storage-core: コンテキスト無効時の挙動", () => {
  beforeEach(() => {
    chrome.runtime.id = "test-extension-id";
    chrome.storage.local.get.mockReset();
    chrome.storage.local.set.mockReset();
    chrome.storage.local.remove.mockReset();
  });

  test("chrome.runtime が undefined の場合 isExtensionContextValid は false", () => {
    const original = chrome.runtime;
    delete chrome.runtime;
    expect(storageCore.isExtensionContextValid()).toBe(false);
    chrome.runtime = original;
  });

  test("chrome.runtime.id が undefined の場合 isExtensionContextValid は false", () => {
    chrome.runtime.id = undefined;
    expect(storageCore.isExtensionContextValid()).toBe(false);
    chrome.runtime.id = "test-extension-id";
  });

  test("context invalidated エラーは warn ログだけで吸収される", async () => {
    chrome.storage.local.get.mockRejectedValue(
      Object.assign(new Error("context invalidated"), { message: "Extension context invalidated" })
    );
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(function () {});
    const result = await storageCore.get("test");
    expect(result).toBeNull();
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  test("その他のエラーはそのまま throw", async () => {
    chrome.storage.local.get.mockRejectedValue(new Error("other error"));
    await expect(storageCore.get("test")).rejects.toThrow("other error");
  });
});

describe("storage-core: K 定数", () => {
  test("全てのキー定数が定義されている", () => {
    expect(storageCore.K.API_CONFIGS).toBe("apiConfigs");
    expect(storageCore.K.PROMPT_PREFIX).toBe("prompt_");
    expect(storageCore.K.BTN_TITLE_PREFIX).toBe("btnTitle_");
    expect(storageCore.K.BTN_API_PREFIX).toBe("btnApiConfig_");
    expect(storageCore.K.SUBTITLE_LANG).toBe("subtitleLang");
    expect(storageCore.K.FONT_SIZE).toBe("fontSize");
    expect(storageCore.K.PANEL_HEIGHT).toBe("panelHeight");
    expect(storageCore.K.THEME).toBe("theme");
    expect(storageCore.K.LATEST_SUMMARY).toBe("latestSummary");
    expect(storageCore.K.LATEST_CAPTIONS).toBe("latestCaptions");
  });
});

describe("storage-core: getAll", () => {
  test("コンテキスト無効時は空オブジェクトを返す", async () => {
    const original = chrome.runtime;
    delete chrome.runtime;
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(function () {});
    const result = await storageCore.getAll();
    expect(result).toEqual({});
    chrome.runtime = original;
    warnSpy.mockRestore();
  });

  test("context invalidated エラーで空オブジェクトを返す", async () => {
    chrome.storage.local.get.mockRejectedValue(
      Object.assign(new Error("context invalidated"), { message: "context invalidated" })
    );
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(function () {});
    const result = await storageCore.getAll();
    expect(result).toEqual({});
    warnSpy.mockRestore();
  });
});

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
    expect(storage.K.PROMPT_PREFIX).toBe("prompt_");
    expect(storage.K.BTN_TITLE_PREFIX).toBe("btnTitle_");
    expect(storage.K.BTN_API_PREFIX).toBe("btnApiConfig_");
    expect(storage.K.SUBTITLE_LANG).toBe("subtitleLang");
    expect(storage.K.FONT_SIZE).toBe("fontSize");
    expect(storage.K.PANEL_HEIGHT).toBe("panelHeight");
    expect(storage.K.THEME).toBe("theme");
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
    storage.__resetSummaryCacheMemory();
  });

  test("(videoId, mode) 単位でタイムスタンプ付きでキャッシュ保存する", async () => {
    chrome.storage.local.set.mockResolvedValue(undefined);
    const before = Date.now();
    await storage.saveSummaryCache("video123", "summary", {
      content: "要約テキスト",
      modelLabel: "gpt-4o",
      transcriptCount: 10
    });
    const after = Date.now();

    const saved = chrome.storage.local.set.mock.calls[0][0];
    const cache = saved["summary_cache_video123_summary"];
    expect(cache).toBeDefined();
    expect(cache.content).toBe("要約テキスト");
    expect(cache.modelLabel).toBe("gpt-4o");
    expect(cache.transcriptCount).toBe(10);
    expect(cache.timestamp).toBeGreaterThanOrEqual(before);
    expect(cache.timestamp).toBeLessThanOrEqual(after);
  });

  // ★ T3-C1 回帰防止: 同一 videoId でも mode 毎にキーが独立している。
  test("同一 videoId の異なる mode は独立したキャッシュキーを使う", async () => {
    chrome.storage.local.set.mockResolvedValue(undefined);
    await storage.saveSummaryCache("video1", "summary", {
      content: "A要約",
      modelLabel: "m1",
      transcriptCount: 1
    });
    await storage.saveSummaryCache("video1", "customA", {
      content: "B要約",
      modelLabel: "m2",
      transcriptCount: 2
    });

    const first = chrome.storage.local.set.mock.calls[0][0];
    const second = chrome.storage.local.set.mock.calls[1][0];
    expect(first["summary_cache_video1_summary"].content).toBe("A要約");
    expect(second["summary_cache_video1_customA"].content).toBe("B要約");
  });
});

// ===== loadSummaryCache (7日TTL) =====
describe("loadSummaryCache", () => {
  beforeEach(() => {
    chrome.storage.local.get.mockReset();
    chrome.storage.local.remove.mockReset();
    // T2-C1: in-memory キャッシュをテスト毎にリセット
    storage.__resetSummaryCacheMemory();
  });

  test("キャッシュがない場合はnullを返す", async () => {
    chrome.storage.local.get.mockResolvedValue({});
    const result = await storage.loadSummaryCache("video123", "summary");
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
      summary_cache_video123_summary: cacheData
    });
    const result = await storage.loadSummaryCache("video123", "summary");
    expect(result).toEqual(cacheData);
  });

  test("7日以上経過したキャッシュは削除してnullを返す", async () => {
    const eightDaysAgo = Date.now() - 8 * 24 * 60 * 60 * 1000;
    chrome.storage.local.get.mockResolvedValue({
      summary_cache_video123_summary: {
        content: "古い要約",
        modelLabel: "gpt-4",
        transcriptCount: 50,
        timestamp: eightDaysAgo
      }
    });
    chrome.storage.local.remove.mockResolvedValue(undefined);

    const result = await storage.loadSummaryCache("video123", "summary");
    expect(result).toBeNull();
    expect(chrome.storage.local.remove).toHaveBeenCalledWith("summary_cache_video123_summary");
  });

  test("7日ギリギリ（6日と23時間）のキャッシュは返す", async () => {
    const almostSevenDays = Date.now() - (7 * 24 * 60 * 60 * 1000 - 1);
    chrome.storage.local.get.mockResolvedValue({
      summary_cache_video123_summary: {
        content: "期限ギリギリ",
        timestamp: almostSevenDays
      }
    });
    const result = await storage.loadSummaryCache("video123", "summary");
    expect(result).not.toBeNull();
    expect(result.content).toBe("期限ギリギリ");
  });

  // T2-C1: メモリキャッシュの挙動
  test("2回目以降はstorage.getを呼ばずメモリから返す", async () => {
    const cacheData = {
      content: "キャッシュ",
      modelLabel: "gpt-4o",
      transcriptCount: 10,
      timestamp: Date.now()
    };
    chrome.storage.local.get.mockResolvedValue({
      summary_cache_video123_summary: cacheData
    });
    // 1回目: storage.get が呼ばれる
    const r1 = await storage.loadSummaryCache("video123", "summary");
    expect(r1).toEqual(cacheData);
    expect(chrome.storage.local.get).toHaveBeenCalledTimes(1);
    // 2回目: メモリキャッシュヒットで storage.get は呼ばれない
    const r2 = await storage.loadSummaryCache("video123", "summary");
    expect(r2).toEqual(cacheData);
    expect(chrome.storage.local.get).toHaveBeenCalledTimes(1);
  });

  test("saveSummaryCache でメモリキャッシュも更新される", async () => {
    chrome.storage.local.set.mockResolvedValue(undefined);
    chrome.storage.local.get.mockResolvedValue({});
    await storage.saveSummaryCache("videoX", "summary", {
      content: "new",
      modelLabel: "gpt-4o",
      transcriptCount: 1
    });
    // 直後の loadSummaryCache は storage.get を呼ばない
    const r = await storage.loadSummaryCache("videoX", "summary");
    expect(r.content).toBe("new");
    expect(chrome.storage.local.get).not.toHaveBeenCalled();
  });

  // ★ T3-C1 回帰防止: 異なる mode は独立したメモリキャッシュを持つ
  test("同じ videoId でも mode が異なれば独立してキャッシュされる", async () => {
    chrome.storage.local.set.mockResolvedValue(undefined);
    chrome.storage.local.get.mockResolvedValue({});
    await storage.saveSummaryCache("videoX", "summary", {
      content: "A要約",
      modelLabel: "m1",
      transcriptCount: 1
    });
    await storage.saveSummaryCache("videoX", "customA", {
      content: "B要約",
      modelLabel: "m2",
      transcriptCount: 2
    });

    const rA = await storage.loadSummaryCache("videoX", "summary");
    const rB = await storage.loadSummaryCache("videoX", "customA");
    expect(rA.content).toBe("A要約");
    expect(rB.content).toBe("B要約");
    // save 直後なので storage.get は一度も呼ばれない
    expect(chrome.storage.local.get).not.toHaveBeenCalled();
  });

  test("clearSummaryCache でメモリキャッシュもクリアされる", async () => {
    chrome.storage.local.set.mockResolvedValue(undefined);
    chrome.storage.local.get.mockResolvedValue({});
    chrome.storage.local.remove.mockResolvedValue(undefined);
    await storage.saveSummaryCache("videoX", "summary", {
      content: "x",
      modelLabel: "m",
      transcriptCount: 1
    });
    await storage.clearSummaryCache("videoX");
    // クリア後の loadSummaryCache は storage.get を呼ぶ（メモリが空）
    await storage.loadSummaryCache("videoX", "summary");
    expect(chrome.storage.local.get).toHaveBeenCalled();
  });

  test("videoId が空文字 / null の場合は null を返す", async () => {
    expect(await storage.loadSummaryCache("", "summary")).toBeNull();
    expect(await storage.loadSummaryCache(null, "summary")).toBeNull();
  });
});

// ===== clearSummaryCache =====
describe("clearSummaryCache", () => {
  beforeEach(() => {
    chrome.storage.local.remove.mockReset();
  });

  test("videoId + 既定3モード + 旧キーのキャッシュをすべて削除する", async () => {
    chrome.storage.local.remove.mockResolvedValue(undefined);
    await storage.clearSummaryCache("video123");
    const removed = new Set(
      chrome.storage.local.remove.mock.calls.map(function (c) {
        return c[0];
      })
    );
    // 既定3モード分 + 旧キー (後方互換) の 4 件
    expect(removed.has("summary_cache_video123_summary")).toBe(true);
    expect(removed.has("summary_cache_video123_customA")).toBe(true);
    expect(removed.has("summary_cache_video123_customB")).toBe(true);
    expect(removed.has("summary_cache_video123")).toBe(true);
  });

  test("mode を指定すると該当 mode のみ削除する", async () => {
    chrome.storage.local.remove.mockResolvedValue(undefined);
    await storage.clearSummaryCache("video123", "customA");
    expect(chrome.storage.local.remove).toHaveBeenCalledWith("summary_cache_video123_customA");
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
