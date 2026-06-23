// tests/model-filter.test.js — モデル絞り込みの単体テスト
const { filterConfigCards, extractHost } = require("../src/options/model-filter");

// ===== filterConfigCards =====
describe("filterConfigCards", () => {
  const sampleConfigs = [
    {
      id: "1",
      label: "DeepSeek Chat",
      apiModel: "deepseek-chat",
      apiUrl: "https://api.deepseek.com/v1/chat/completions"
    },
    {
      id: "2",
      label: "OpenAI GPT-4o",
      apiModel: "gpt-4o",
      apiUrl: "https://api.openai.com/v1/chat/completions"
    },
    {
      id: "3",
      label: "OpenRouter Claude",
      apiModel: "anthropic/claude-3.5-sonnet",
      apiUrl: "https://openrouter.ai/api/v1/chat/completions"
    }
  ];

  test("キーワード無しで全件返す（元の配列は変えない）", () => {
    const result = filterConfigCards(sampleConfigs, "");
    expect(result).toHaveLength(3);
    expect(result).not.toBe(sampleConfigs); // slice して返しているので別参照
  });

  test("ラベルに含まれる語で絞り込み", () => {
    const result = filterConfigCards(sampleConfigs, "claude");
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("3");
  });

  test("モデル ID に含まれる語で絞り込み", () => {
    const result = filterConfigCards(sampleConfigs, "gpt-4o");
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("2");
  });

  test("ホストに含まれる語で絞り込み", () => {
    const result = filterConfigCards(sampleConfigs, "openrouter");
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("3");
  });

  test("複数キーワード AND 検索", () => {
    const result = filterConfigCards(sampleConfigs, "openai gpt");
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("2");
  });

  test("大文字小文字を区別しない", () => {
    expect(filterConfigCards(sampleConfigs, "DEEPSEEK")).toHaveLength(1);
    expect(filterConfigCards(sampleConfigs, "deepseek")).toHaveLength(1);
  });

  test("一致なしは空配列", () => {
    expect(filterConfigCards(sampleConfigs, "nonexistent")).toEqual([]);
  });

  test("configs が null / undefined / 空配列 → 空配列", () => {
    expect(filterConfigCards(null, "x")).toEqual([]);
    expect(filterConfigCards(undefined, "x")).toEqual([]);
    expect(filterConfigCards([], "x")).toEqual([]);
  });

  test("null / undefined 要素は除外", () => {
    const arr = [null, { id: "1", label: "a", apiModel: "b", apiUrl: "c" }];
    expect(filterConfigCards(arr, "a")).toHaveLength(1);
  });
});

// ===== extractHost =====
describe("extractHost", () => {
  test("URL から host 部分（host:port）を抽出", () => {
    expect(extractHost("https://api.deepseek.com/v1/chat/completions")).toBe("api.deepseek.com");
    expect(extractHost("https://api.openai.com:443/v1/chat")).toBe("api.openai.com");
    expect(extractHost("http://localhost:3000/v1")).toBe("localhost:3000");
  });

  test("不正なURLはそのまま返す", () => {
    expect(extractHost("not-a-url")).toBe("not-a-url");
  });

  test("空文字・null・undefined は空文字", () => {
    expect(extractHost("")).toBe("");
    expect(extractHost(null)).toBe("");
    expect(extractHost(undefined)).toBe("");
  });
});
