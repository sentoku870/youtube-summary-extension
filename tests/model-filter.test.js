// tests/model-filter.test.js — モデル絞り込みの単体テスト
const {
  extractModelProvider,
  listModelProviders,
  filterModels,
  filterConfigCards,
  extractHost
} = require("../src/options/model-filter");

describe("extractModelProvider", () => {
  test("OpenRouter 形式の id からプロバイダー名を抽出", () => {
    expect(extractModelProvider("openai/gpt-4o")).toBe("openai");
    expect(extractModelProvider("anthropic/claude-3.5-sonnet")).toBe("anthropic");
    expect(extractModelProvider("google/gemini-2.0-flash-exp:free")).toBe("google");
    expect(extractModelProvider("deepseek/deepseek-chat")).toBe("deepseek");
    expect(extractModelProvider("meta-llama/llama-3-70b")).toBe("meta-llama");
  });

  test("スラッシュを含まない id は (other)", () => {
    expect(extractModelProvider("deepseek-chat")).toBe("(other)");
    expect(extractModelProvider("gpt-4o")).toBe("(other)");
  });

  test("空・無効値", () => {
    expect(extractModelProvider("")).toBe("(other)");
    expect(extractModelProvider(null)).toBe("(other)");
    expect(extractModelProvider(undefined)).toBe("(other)");
  });
});

describe("listModelProviders", () => {
  test("モデルリストからプロバイダー一覧を重複なく抽出（出現順）", () => {
    const models = [
      { id: "openai/gpt-4o" },
      { id: "anthropic/claude-3.5-sonnet" },
      { id: "openai/gpt-4o-mini" }, // 重複
      { id: "google/gemini-flash" },
      { id: "deepseek-chat" } // スラッシュ無し
    ];
    expect(listModelProviders(models)).toEqual(["openai", "anthropic", "google", "(other)"]);
  });

  test("空リスト・null", () => {
    expect(listModelProviders([])).toEqual([]);
    expect(listModelProviders(null)).toEqual([]);
    expect(listModelProviders(undefined)).toEqual([]);
  });

  test("id の無い要素を除外", () => {
    const models = [{ id: "openai/gpt-4o" }, { name: "no-id" }, null, { id: "" }];
    expect(listModelProviders(models)).toEqual(["openai"]);
  });
});

describe("filterModels", () => {
  const sampleModels = [
    { id: "openai/gpt-4o", label: "GPT-4o" },
    { id: "openai/gpt-4o-mini", label: "GPT-4o Mini" },
    { id: "anthropic/claude-3.5-sonnet", label: "Claude 3.5 Sonnet" },
    { id: "google/gemini-2.0-flash-exp:free", label: "Gemini 2.0 Flash" },
    { id: "deepseek/deepseek-chat", label: "DeepSeek Chat" },
    { id: "meta-llama/llama-3-70b-instruct", label: "Llama 3 70B" }
  ];

  test("フィルターなしですべて返す", () => {
    expect(filterModels("openrouter", sampleModels, "", "")).toHaveLength(6);
  });

  test("プロバイダーで絞り込み", () => {
    const result = filterModels("openrouter", sampleModels, "openai", "");
    expect(result).toHaveLength(2);
    expect(result.every((m) => m.id.startsWith("openai/"))).toBe(true);
  });

  test("キーワード検索（id と label の両方を対象）", () => {
    // "gpt" で絞り込み → 2件
    expect(filterModels("openrouter", sampleModels, "", "gpt")).toHaveLength(2);
    // "claude" → label のみに一致する1件
    const r = filterModels("openrouter", sampleModels, "", "claude");
    expect(r).toHaveLength(1);
    expect(r[0].id).toBe("anthropic/claude-3.5-sonnet");
  });

  test("プロバイダー + キーワードの組み合わせ", () => {
    // openai プロバイダー + "mini" → 1件
    const r = filterModels("openrouter", sampleModels, "openai", "mini");
    expect(r).toHaveLength(1);
    expect(r[0].id).toBe("openai/gpt-4o-mini");
  });

  test("空白区切りの AND 検索", () => {
    // "gpt mini" → gpt-4o と gpt-4o-mini の両方に "gpt" が含まれ、
    // かつ "mini" が含まれるのは gpt-4o-mini のみ
    const r = filterModels("openrouter", sampleModels, "", "gpt mini");
    expect(r).toHaveLength(1);
    expect(r[0].id).toBe("openai/gpt-4o-mini");
  });

  test("大文字小文字を区別しない", () => {
    expect(filterModels("openrouter", sampleModels, "", "GPT")).toHaveLength(2);
    expect(filterModels("openrouter", sampleModels, "", "CLAUDE")).toHaveLength(1);
  });

  test("一致なしは空配列", () => {
    expect(filterModels("openrouter", sampleModels, "", "nonexistent")).toEqual([]);
  });

  test("(other) プロバイダーでスラッシュ無しモデルを抽出", () => {
    const models = [
      { id: "openai/gpt-4o" },
      { id: "deepseek-chat" }, // スラッシュ無し
      { id: "gpt-3.5-turbo" } // スラッシュ無し
    ];
    const r = filterModels("openrouter", models, "(other)", "");
    expect(r).toHaveLength(2);
    expect(r.map((m) => m.id).sort()).toEqual(["deepseek-chat", "gpt-3.5-turbo"]);
  });

  test("空リスト・null入力の安全性", () => {
    expect(filterModels("openrouter", [], "", "")).toEqual([]);
    expect(filterModels("openrouter", null, "", "")).toEqual([]);
    expect(filterModels("openrouter", undefined, "openai", "gpt")).toEqual([]);
  });

  test("providerKey はフィルタ動作に影響しない（ラベル生成用のみ）", () => {
    // providerKey に関わらず同じ結果
    const a = filterModels("openrouter", sampleModels, "openai", "");
    const b = filterModels("deepseek", sampleModels, "openai", "");
    expect(a).toEqual(b);
  });
});

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
