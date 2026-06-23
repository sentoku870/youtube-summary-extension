// tests/options-logic.test.js — オプション画面の純粋関数テスト
const {
  PROVIDERS,
  generateId,
  promptKey,
  btnTitleKey,
  btnApiConfigKey,
  detectProviderKey,
  cssEscape,
  validateFormValues,
  VALIDATION_ERRORS,
  buildConfig,
  findExistingApiKeyByHost,
  getProviderChipClass,
  getProviderLabel
} = require("../src/options/options-logic");

// ===== PROVIDERS =====
describe("PROVIDERS", () => {
  test("4つのプロバイダーキーが定義されている", () => {
    expect(Object.keys(PROVIDERS).sort()).toEqual(["custom", "deepseek", "openai", "openrouter"]);
  });

  test("各プロバイダーがlabel/apiUrl/temperature/modelsを持つ", () => {
    for (const key in PROVIDERS) {
      const p = PROVIDERS[key];
      expect(typeof p.label).toBe("string");
      expect(typeof p.apiUrl).toBe("string");
      expect(typeof p.temperature).toBe("string");
      expect(Array.isArray(p.models)).toBe(true);
    }
  });

  test("deepseekのapiUrlが正しい", () => {
    expect(PROVIDERS.deepseek.apiUrl).toBe("https://api.deepseek.com/v1/chat/completions");
  });

  test("customは空URLと空モデル配列", () => {
    expect(PROVIDERS.custom.apiUrl).toBe("");
    expect(PROVIDERS.custom.models).toEqual([]);
  });
});

// ===== generateId =====
describe("generateId", () => {
  test("cfg_プレフィックスとタイムスタンプを含む一意IDを生成", () => {
    const id = generateId();
    expect(id).toMatch(/^cfg_\d+_[a-z0-9]+$/);
  });

  test("連続呼び出しで異なるIDを返す", () => {
    const id1 = generateId();
    const id2 = generateId();
    expect(id1).not.toBe(id2);
  });
});

// ===== キーヘルパー =====
describe("promptKey", () => {
  test("K.PROMPT_PREFIX + type を返す", () => {
    expect(promptKey("summary")).toBe("prompt_summary");
    expect(promptKey("customA")).toBe("prompt_customA");
    expect(promptKey("customB")).toBe("prompt_customB");
  });
});

describe("btnTitleKey", () => {
  test("K.BTN_TITLE_PREFIX + type を返す", () => {
    expect(btnTitleKey("summary")).toBe("btnTitle_summary");
    expect(btnTitleKey("customA")).toBe("btnTitle_customA");
  });
});

describe("btnApiConfigKey", () => {
  test("K.BTN_API_PREFIX + type を返す", () => {
    expect(btnApiConfigKey("summary")).toBe("btnApiConfig_summary");
    expect(btnApiConfigKey("customB")).toBe("btnApiConfig_customB");
  });
});

// ===== detectProviderKey =====
describe("detectProviderKey", () => {
  test("DeepSeekのURLを正しく判定", () => {
    expect(detectProviderKey("https://api.deepseek.com/v1/chat/completions")).toBe("deepseek");
  });

  test("OpenRouterのURLを正しく判定", () => {
    expect(detectProviderKey("https://openrouter.ai/api/v1/chat/completions")).toBe("openrouter");
  });

  test("OpenAIのURLを正しく判定", () => {
    expect(detectProviderKey("https://api.openai.com/v1/chat/completions")).toBe("openai");
  });

  test("未知のホストはcustomを返す", () => {
    expect(detectProviderKey("https://api.unknown.com/v1/chat/completions")).toBe("custom");
    expect(detectProviderKey("https://localhost:3000/v1/chat/completions")).toBe("custom");
  });

  test("空文字・null・undefinedはcustomを返す", () => {
    expect(detectProviderKey("")).toBe("custom");
    expect(detectProviderKey(null)).toBe("custom");
    expect(detectProviderKey(undefined)).toBe("custom");
  });

  test("不正なURL文字列はcustomを返す（例外フォールバック）", () => {
    expect(detectProviderKey("not-a-url")).toBe("custom");
    expect(detectProviderKey(":::invalid:::")).toBe("custom");
  });
});

// ===== cssEscape =====
describe("cssEscape", () => {
  test("ダブルクォートをエスケープする", () => {
    expect(cssEscape('hello"world')).toBe('hello\\"world');
  });

  test("バックスラッシュをエスケープする", () => {
    expect(cssEscape("hello\\world")).toBe("hello\\\\world");
  });

  test("スラッシュはそのまま（モデルIDの" / "は問題なし）", () => {
    expect(cssEscape("openai/gpt-4o")).toBe("openai/gpt-4o");
  });

  test("通常文字列はそのまま返す", () => {
    expect(cssEscape("gpt-4o")).toBe("gpt-4o");
    expect(cssEscape("")).toBe("");
  });

  test("非文字列はString変換後にエスケープ", () => {
    expect(cssEscape(null)).toBe("null");
    expect(cssEscape(123)).toBe("123");
  });
});

// ===== validateFormValues =====
describe("validateFormValues", () => {
  const validConfig = {
    label: "テスト設定",
    apiKey: "sk-xxx",
    apiUrl: "https://api.test.com/v1/chat/completions",
    apiModel: "gpt-4o",
    extraParams: ""
  };

  test("全フィールド妥当の場合はvalid=trueを返す", () => {
    const result = validateFormValues(validConfig);
    expect(result.valid).toBe(true);
    expect(result.errorKey).toBeNull();
  });

  test("labelが空の場合はerrorKey=LABEL", () => {
    const result = validateFormValues({ ...validConfig, label: "" });
    expect(result.valid).toBe(false);
    expect(result.errorKey).toBe(VALIDATION_ERRORS.LABEL);
  });

  test("apiKeyが空の場合はerrorKey=API_KEY", () => {
    const result = validateFormValues({ ...validConfig, apiKey: "" });
    expect(result.valid).toBe(false);
    expect(result.errorKey).toBe(VALIDATION_ERRORS.API_KEY);
  });

  test("apiUrlが空の場合はerrorKey=API_URL", () => {
    const result = validateFormValues({ ...validConfig, apiUrl: "" });
    expect(result.valid).toBe(false);
    expect(result.errorKey).toBe(VALIDATION_ERRORS.API_URL);
  });

  test("apiModelが空の場合はerrorKey=API_MODEL", () => {
    const result = validateFormValues({ ...validConfig, apiModel: "" });
    expect(result.valid).toBe(false);
    expect(result.errorKey).toBe(VALIDATION_ERRORS.API_MODEL);
  });

  test("extraParamsが正常なJSONの場合はvalid", () => {
    const result = validateFormValues({ ...validConfig, extraParams: '{"top_p": 0.9}' });
    expect(result.valid).toBe(true);
  });

  test("extraParamsが不正なJSONの場合はerrorKey=EXTRA_PARAMS_JSON", () => {
    const result = validateFormValues({ ...validConfig, extraParams: "{invalid}" });
    expect(result.valid).toBe(false);
    expect(result.errorKey).toBe(VALIDATION_ERRORS.EXTRA_PARAMS_JSON);
  });

  test("extraParamsが空文字の場合はJSON検証をスキップ", () => {
    const result = validateFormValues({ ...validConfig, extraParams: "" });
    expect(result.valid).toBe(true);
  });

  test("最初のエラーで短絡評価（label優先）", () => {
    const result = validateFormValues({ label: "", apiKey: "", apiUrl: "" });
    expect(result.errorKey).toBe(VALIDATION_ERRORS.LABEL);
  });
});

// ===== buildConfig =====
describe("buildConfig", () => {
  test("各フィールドをtrimしてconfigオブジェクトを構築", () => {
    const result = buildConfig({
      label: "  テスト  ",
      apiKey: "  key123  ",
      apiUrl: "  https://api.test.com  ",
      apiModel: "  gpt-4o  ",
      temperature: "0.5",
      maxTokens: "8192",
      extraParams: "  {}  "
    });

    expect(result.label).toBe("テスト");
    expect(result.apiKey).toBe("key123");
    expect(result.apiUrl).toBe("https://api.test.com");
    expect(result.apiModel).toBe("gpt-4o");
    expect(result.temperature).toBe("0.5");
    expect(result.maxTokens).toBe("8192");
    expect(result.extraParams).toBe("{}");
  });

  test("temperature未指定時はデフォルト0.3", () => {
    const result = buildConfig({ label: "x", apiKey: "k", apiUrl: "u", apiModel: "m" });
    expect(result.temperature).toBe("0.3");
  });

  test("maxTokens未指定時はデフォルト4096", () => {
    const result = buildConfig({ label: "x", apiKey: "k", apiUrl: "u", apiModel: "m" });
    expect(result.maxTokens).toBe("4096");
  });

  test("空文字のtemperature/maxTokensもデフォルトにフォールバック", () => {
    const result = buildConfig({
      label: "x",
      apiKey: "k",
      apiUrl: "u",
      apiModel: "m",
      temperature: "",
      maxTokens: ""
    });
    expect(result.temperature).toBe("0.3");
    expect(result.maxTokens).toBe("4096");
  });

  test("undefinedフィールドは空文字として扱う", () => {
    const result = buildConfig({});
    expect(result.label).toBe("");
    expect(result.apiKey).toBe("");
    expect(result.apiUrl).toBe("");
    expect(result.apiModel).toBe("");
    expect(result.extraParams).toBe("");
  });
});

// ===== findExistingApiKeyByHost =====
describe("findExistingApiKeyByHost", () => {
  test("同一ホストの apiKey を返す", () => {
    const configs = [
      { id: "1", apiKey: "key-1", apiUrl: "https://api.deepseek.com/v1/chat/completions" },
      { id: "2", apiKey: "key-2", apiUrl: "https://api.openai.com/v1/chat/completions" }
    ];
    const result = findExistingApiKeyByHost(
      "https://api.deepseek.com/v1/chat/completions",
      configs
    );
    expect(result).toBe("key-1");
  });

  test("ホスト名が一致しない場合は空文字", () => {
    const configs = [
      { id: "1", apiKey: "key-1", apiUrl: "https://api.deepseek.com/v1/chat/completions" }
    ];
    const result = findExistingApiKeyByHost("https://api.openai.com/v1/chat/completions", configs);
    expect(result).toBe("");
  });

  test("apiUrl が空文字 → 空文字", () => {
    expect(findExistingApiKeyByHost("", [{ apiKey: "k", apiUrl: "https://x.com" }])).toBe("");
    expect(findExistingApiKeyByHost(null, [{ apiKey: "k", apiUrl: "https://x.com" }])).toBe("");
    expect(findExistingApiKeyByHost(undefined, [{ apiKey: "k", apiUrl: "https://x.com" }])).toBe(
      ""
    );
  });

  test("apiUrl が不正な URL 文字列 → 空文字", () => {
    expect(findExistingApiKeyByHost("not-a-url", [{ apiKey: "k", apiUrl: "https://x.com" }])).toBe(
      ""
    );
  });

  test("configs が null / undefined / 空配列 → 空文字", () => {
    expect(findExistingApiKeyByHost("https://api.deepseek.com", null)).toBe("");
    expect(findExistingApiKeyByHost("https://api.deepseek.com", undefined)).toBe("");
    expect(findExistingApiKeyByHost("https://api.deepseek.com", [])).toBe("");
  });

  test("apiKey が無い config はスキップ", () => {
    const configs = [
      { id: "1", apiKey: "", apiUrl: "https://api.deepseek.com" },
      { id: "2", apiKey: "key-2", apiUrl: "https://api.deepseek.com" }
    ];
    const result = findExistingApiKeyByHost("https://api.deepseek.com", configs);
    expect(result).toBe("key-2");
  });

  test("apiUrl が不正な config はスキップ", () => {
    const configs = [
      { id: "1", apiKey: "key-bad", apiUrl: "not-a-url" },
      { id: "2", apiKey: "key-ok", apiUrl: "https://api.deepseek.com" }
    ];
    const result = findExistingApiKeyByHost("https://api.deepseek.com", configs);
    expect(result).toBe("key-ok");
  });

  test("apiUrl / apiKey が空の config はスキップ", () => {
    const configs = [
      { id: "1" }, // apiKey, apiUrl なし
      { id: "2", apiKey: "k", apiUrl: "" },
      { id: "3", apiKey: "real", apiUrl: "https://api.deepseek.com" }
    ];
    const result = findExistingApiKeyByHost("https://api.deepseek.com", configs);
    expect(result).toBe("real");
  });

  test("最初の一致を返す（複数該当時は先頭）", () => {
    const configs = [
      { id: "1", apiKey: "key-1", apiUrl: "https://api.deepseek.com/a" },
      { id: "2", apiKey: "key-2", apiUrl: "https://api.deepseek.com/b" }
    ];
    const result = findExistingApiKeyByHost("https://api.deepseek.com/c", configs);
    expect(result).toBe("key-1");
  });
});

// ===== getProviderChipClass =====
describe("getProviderChipClass", () => {
  test("主要プロバイダーは対応するチップクラスを返す", () => {
    expect(getProviderChipClass("deepseek")).toBe("provider-chip-deepseek");
    expect(getProviderChipClass("openrouter")).toBe("provider-chip-openrouter");
    expect(getProviderChipClass("openai")).toBe("provider-chip-openai");
  });

  test("未知のキー / カスタム は provider-chip-custom", () => {
    expect(getProviderChipClass("custom")).toBe("provider-chip-custom");
    expect(getProviderChipClass("unknown")).toBe("provider-chip-custom");
  });

  test("null / undefined / 空文字 は provider-chip-custom", () => {
    expect(getProviderChipClass(null)).toBe("provider-chip-custom");
    expect(getProviderChipClass(undefined)).toBe("provider-chip-custom");
    expect(getProviderChipClass("")).toBe("provider-chip-custom");
  });
});

// ===== getProviderLabel =====
describe("getProviderLabel", () => {
  test("主要プロバイダーのラベルを返す", () => {
    expect(getProviderLabel("deepseek")).toBe("DeepSeek（直API）");
    expect(getProviderLabel("openrouter")).toBe("OpenRouter");
    expect(getProviderLabel("openai")).toBe("OpenAI（直API）");
    expect(getProviderLabel("custom")).toBe("カスタム");
  });

  test("未知のキーは「カスタム」を返す", () => {
    expect(getProviderLabel("unknown")).toBe("カスタム");
  });

  test("null / undefined / 空文字 は「カスタム」", () => {
    expect(getProviderLabel(null)).toBe("カスタム");
    expect(getProviderLabel(undefined)).toBe("カスタム");
    expect(getProviderLabel("")).toBe("カスタム");
  });
});
