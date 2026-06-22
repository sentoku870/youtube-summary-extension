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
  convertLegacyToConfigs
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

  test("スラッシュはそのまま（モデルIDの"/"は問題なし）", () => {
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
      label: "x", apiKey: "k", apiUrl: "u", apiModel: "m",
      temperature: "", maxTokens: ""
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

// ===== convertLegacyToConfigs =====
describe("convertLegacyToConfigs", () => {
  // テスト用の固定ID生成関数
  const fakeId = () => "cfg_fixed";
  // oldConfigが存在しないと早期リターンする仕様（元コード通り）のため、
  // provider個別設定のテストには必ず apiConfig（legacy）を含める
  const legacyOldConfig = {
    apiKey: "legacy-key",
    apiUrl: "https://api.legacy.com",
    apiModel: "legacy-model",
    apiProvider: "legacy"
  };

  test("既にapiConfigsが存在する場合は空配列を返す（移行不要）", () => {
    const storage = {
      apiConfigs: [{ id: "existing", apiKey: "k" }],
      apiConfig: legacyOldConfig
    };
    const result = convertLegacyToConfigs(storage, fakeId);
    expect(result).toEqual([]);
  });

  test("legacy oldConfigも個別プロバイダー設定も無い場合は空配列", () => {
    const result = convertLegacyToConfigs({}, fakeId);
    expect(result).toEqual([]);
  });

  test("oldConfigがない場合はprovider個別設定があっても空配列", () => {
    // 元コード仕様: oldConfig(apiConfig)が存在しないと早期リターン
    const storage = {
      apiConfig_deepseek: { apiKey: "ds-key", apiUrl: "https://api.deepseek.com" }
    };
    const result = convertLegacyToConfigs(storage, fakeId);
    expect(result).toEqual([]);
  });

  test("oldConfigあり + apiConfig_deepseek → 両方が変換される", () => {
    const storage = {
      apiConfig: legacyOldConfig,
      apiConfig_deepseek: {
        apiKey: "ds-key",
        apiUrl: "https://api.deepseek.com/v1/chat/completions",
        apiModel: "deepseek-chat"
      }
    };
    const result = convertLegacyToConfigs(storage, fakeId);
    expect(result).toHaveLength(2);
    expect(result.map(c => c.apiKey)).toContain("ds-key");
    expect(result.map(c => c.apiKey)).toContain("legacy-key");
  });

  test("複数プロバイダーの個別設定を変換（oldConfig含む）", () => {
    const storage = {
      apiConfig: legacyOldConfig,
      apiConfig_deepseek: { apiKey: "ds-key", apiUrl: "https://api.deepseek.com" },
      apiConfig_openrouter: { apiKey: "or-key", apiUrl: "https://openrouter.ai" },
      apiConfig_custom: { apiKey: "custom-key", apiUrl: "https://custom.api" }
    };
    const result = convertLegacyToConfigs(storage, fakeId);
    // 3プロバイダー + oldConfig = 4件
    expect(result).toHaveLength(4);
  });

  test("apiKey未設定のプロバイダーはスキップ", () => {
    const storage = {
      apiConfig: legacyOldConfig,
      apiConfig_deepseek: { apiKey: "", apiUrl: "https://api.deepseek.com" },
      apiConfig_openrouter: { apiKey: "or-key", apiUrl: "https://openrouter.ai" }
    };
    const result = convertLegacyToConfigs(storage, fakeId);
    // openrouter + oldConfig = 2件（deepseekはapiKey空なのでスキップ）
    expect(result).toHaveLength(2);
    expect(result.find(c => c.apiKey === "or-key")).toBeDefined();
  });

  test("legacy apiConfigのみ（プロバイダー個別なし）から1件変換", () => {
    const storage = {
      apiConfig: {
        apiKey: "legacy-key",
        apiUrl: "https://api.legacy.com",
        apiModel: "legacy-model",
        apiProvider: "legacy"
      }
    };
    const result = convertLegacyToConfigs(storage, fakeId);
    expect(result).toHaveLength(1);
    expect(result[0].apiKey).toBe("legacy-key");
    expect(result[0].label).toBe("legacy");
  });

  test("oldConfigとプロバイダー個別が重複する場合はoldConfigをマージしない", () => {
    const storage = {
      apiConfig: {
        apiKey: "same-key",
        apiUrl: "https://api.deepseek.com"
      },
      apiConfig_deepseek: {
        apiKey: "same-key",
        apiUrl: "https://api.deepseek.com"
      }
    };
    const result = convertLegacyToConfigs(storage, fakeId);
    expect(result).toHaveLength(1);
  });

  test("oldConfigのapiProviderがない場合はlabel=Default", () => {
    const storage = {
      apiConfig: {
        apiKey: "key",
        apiUrl: "https://api.test.com"
      }
    };
    const result = convertLegacyToConfigs(storage, fakeId);
    expect(result).toHaveLength(1);
    expect(result[0].label).toBe("Default");
  });

  test("未設定フィールドはデフォルト値で補完", () => {
    const storage = {
      apiConfig: legacyOldConfig,
      apiConfig_deepseek: { apiKey: "k" }
    };
    const result = convertLegacyToConfigs(storage, fakeId);
    const dsConfig = result.find(c => c.apiKey === "k");
    expect(dsConfig.apiUrl).toBe("");
    expect(dsConfig.apiModel).toBe("");
    expect(dsConfig.temperature).toBe("0.3");
    expect(dsConfig.maxTokens).toBe("4096");
    expect(dsConfig.extraParams).toBe("");
  });

  test("generateIdFnが各configに呼ばれる", () => {
    const storage = {
      apiConfig: legacyOldConfig,
      apiConfig_deepseek: { apiKey: "k1" },
      apiConfig_openrouter: { apiKey: "k2" }
    };
    const idFn = jest.fn(() => "id-x");
    const result = convertLegacyToConfigs(storage, idFn);
    expect(idFn.mock.calls.length).toBe(result.length);
  });
});
