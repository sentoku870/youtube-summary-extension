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
    const result = await window.loadApiConfigs();
    expect(result).toEqual([]);
  });

  test("設定がある場合はその配列を返す", async () => {
    const configs = [{ id: "1", label: "test", apiKey: "key" }];
    chrome.storage.local.get.mockResolvedValue({ apiConfigs: configs });
    const result = await window.loadApiConfigs();
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
    const result = await window.loadApiConfigById("2");
    expect(result).toEqual({ id: "2", label: "test2", apiKey: "key2" });
  });

  test("IDが一致しない場合はnullを返す", async () => {
    chrome.storage.local.get.mockResolvedValue({ apiConfigs: [{ id: "1", label: "test" }] });
    const result = await window.loadApiConfigById("999");
    expect(result).toBeNull();
  });
});

describe("saveToStorage", () => {
  beforeEach(() => {
    chrome.storage.local.set.mockReset();
  });

  test("要約結果と字幕を保存する", async () => {
    chrome.storage.local.set.mockResolvedValue(undefined);
    await window.saveToStorage("summary text", ["line1", "line2"]);
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
    const result = await window.loadSubtitleLang();
    expect(result).toBe("auto");
  });

  test("設定がある場合はその値を返す", async () => {
    chrome.storage.local.get.mockResolvedValue({ subtitleLang: "en" });
    const result = await window.loadSubtitleLang();
    expect(result).toBe("en");
  });
});

describe("loadFontSize", () => {
  beforeEach(() => {
    chrome.storage.local.get.mockReset();
  });

  test("設定がない場合は13を返す", async () => {
    chrome.storage.local.get.mockResolvedValue({ fontSize: undefined });
    const result = await window.loadFontSize();
    expect(result).toBe("13");
  });
});

describe("loadCustomPrompt", () => {
  beforeEach(() => {
    chrome.storage.local.get.mockReset();
  });

  test("プロンプト設定がない場合は空文字を返す", async () => {
    chrome.storage.local.get.mockResolvedValue({ prompt_summary: undefined });
    const result = await window.loadCustomPrompt("summary");
    expect(result).toBe("");
  });

  test("プロンプト設定がある場合はその値を返す", async () => {
    chrome.storage.local.get.mockResolvedValue({ prompt_summary: "要約して" });
    const result = await window.loadCustomPrompt("summary");
    expect(result).toBe("要約して");
  });
});

describe("getDefaultPrompt", () => {
  test("summaryのデフォルトプロンプトを返す", () => {
    const prompt = window.getDefaultPrompt("summary");
    expect(prompt).toContain("要約");
  });

  test("customAのデフォルトプロンプトを返す", () => {
    const prompt = window.getDefaultPrompt("customA");
    expect(prompt).toContain("分析");
  });

  test("customBのデフォルトプロンプトを返す", () => {
    const prompt = window.getDefaultPrompt("customB");
    expect(prompt).toContain("考察");
  });

  test("未知のタイプには空文字を返す", () => {
    const prompt = window.getDefaultPrompt("unknown");
    expect(prompt).toBe("");
  });
});