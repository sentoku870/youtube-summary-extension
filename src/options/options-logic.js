// ============================================================
//  options-logic.js — オプション画面の純粋関数群（ESM版）
//  options.js から副作用のないロジックを分離。
//  DOM操作・イベント登録は options.js に残す。
// ============================================================
import { K } from "../infrastructure/storage.js";

// ===== プロバイダープリセット（プロバイダー → モデルの2段階選択） =====
// 各プロバイダーには代表的なデフォルトモデルを内蔵。
export const PROVIDERS = {
  deepseek: {
    label: "DeepSeek（直API）",
    apiUrl: "https://api.deepseek.com/v1/chat/completions",
    temperature: "0.3",
    models: [
      { id: "deepseek-chat", label: "DeepSeek Chat", extraParams: "" },
      { id: "deepseek-reasoner", label: "DeepSeek Reasoner", extraParams: '{"thinking": {"type": "disabled"}}' }
    ]
  },
  openrouter: {
    label: "OpenRouter",
    apiUrl: "https://openrouter.ai/api/v1/chat/completions",
    temperature: "0.3",
    models: [
      { id: "openai/gpt-4o", label: "GPT-4o", extraParams: "" },
      { id: "openai/gpt-4o-mini", label: "GPT-4o Mini", extraParams: "" },
      { id: "anthropic/claude-3.5-sonnet", label: "Claude 3.5 Sonnet", extraParams: "" },
      { id: "google/gemini-2.0-flash-exp:free", label: "Gemini 2.0 Flash (free)", extraParams: "" },
      { id: "deepseek/deepseek-chat", label: "DeepSeek Chat", extraParams: "" }
    ]
  },
  openai: {
    label: "OpenAI（直API）",
    apiUrl: "https://api.openai.com/v1/chat/completions",
    temperature: "0.3",
    models: [
      { id: "gpt-4o", label: "GPT-4o", extraParams: "" },
      { id: "gpt-4o-mini", label: "GPT-4o Mini", extraParams: "" },
      { id: "gpt-4-turbo", label: "GPT-4 Turbo", extraParams: "" }
    ]
  },
  custom: {
    label: "カスタム（手動入力）",
    apiUrl: "",
    temperature: "0.3",
    models: []
  }
};

// ===== 一意ID生成（モジュール状態でカウンタを保持） =====
let idCounter = 0;
export function generateId() {
  return "cfg_" + ++idCounter + "_" + Date.now().toString(36);
}

// ===== ストレージキー文字列を生成するヘルパー（K 定数経由） =====
export function promptKey(type) {
  return K.PROMPT_PREFIX + type;
}

export function btnTitleKey(type) {
  return K.BTN_TITLE_PREFIX + type;
}

export function btnApiConfigKey(type) {
  return K.BTN_API_PREFIX + type;
}

// ===== apiUrl からプロバイダーキーを推定 =====
export function detectProviderKey(apiUrl) {
  if (!apiUrl) return "custom";
  try {
    const host = new URL(apiUrl).hostname;
    if (host === "api.deepseek.com") return "deepseek";
    if (host === "openrouter.ai") return "openrouter";
    if (host === "api.openai.com") return "openai";
  } catch (e) {
    /* fallthrough */
  }
  return "custom";
}

// ===== CSS セレクタの特殊文字をエスケープ =====
// モデルIDに "/" が含まれる場合のため（例: "openai/gpt-4o"）
export function cssEscape(s) {
  return String(s).replace(/["\\]/g, "\\$&");
}

// ===== フォームバリデーション（純粋版） =====
// 戻り値: { valid: boolean, errorKey: string|null }
// errorKey は VALIDATION_ERRORS のいずれか。メッセージ化は呼び出し側で行う。
export const VALIDATION_ERRORS = {
  LABEL: "label",
  API_KEY: "apiKey",
  API_URL: "apiUrl",
  API_MODEL: "apiModel",
  EXTRA_PARAMS_JSON: "extraParamsJson"
};

export function validateFormValues(config) {
  if (!config.label) {
    return { valid: false, errorKey: VALIDATION_ERRORS.LABEL };
  }
  if (!config.apiKey) {
    return { valid: false, errorKey: VALIDATION_ERRORS.API_KEY };
  }
  if (!config.apiUrl) {
    return { valid: false, errorKey: VALIDATION_ERRORS.API_URL };
  }
  if (!config.apiModel) {
    return { valid: false, errorKey: VALIDATION_ERRORS.API_MODEL };
  }
  if (config.extraParams) {
    try {
      JSON.parse(config.extraParams);
    } catch (e) {
      return { valid: false, errorKey: VALIDATION_ERRORS.EXTRA_PARAMS_JSON };
    }
  }
  return { valid: true, errorKey: null };
}

// ===== フォーム値オブジェクトからconfigを構築（純粋版） =====
// values: { label, apiKey, apiUrl, apiModel, temperature, maxTokens, extraParams }
// trim と デフォルト値の充填を行う。
export function buildConfig(values) {
  return {
    label: (values.label || "").trim(),
    apiKey: (values.apiKey || "").trim(),
    apiUrl: (values.apiUrl || "").trim(),
    apiModel: (values.apiModel || "").trim(),
    temperature: values.temperature || "0.3",
    maxTokens: values.maxTokens || "4096",
    extraParams: (values.extraParams || "").trim()
  };
}

// ===== 旧形式（apiConfig_<provider>）から新形式（apiConfigs配列）へ変換 =====
// 純粋関数: ストレージの全読み出し結果とID生成関数を受け取り、変換後のconfigs配列を返す。
// - 既に apiConfigs が存在する場合は空配列を返す（移行不要）
// - legacy oldConfig も各プロバイダー個別設定も無い場合は空配列
// - oldConfig とプロバイダー個別が重複する場合は oldConfig をマージしない
//
// allStorage: getAll() の結果オブジェクト
// generateIdFn: 一意ID生成関数（テストで固定値を注入可能）
export function convertLegacyToConfigs(allStorage, generateIdFn) {
  const existing = allStorage[K.API_CONFIGS];
  if (existing && existing.length > 0) return [];

  const oldConfig = allStorage[K.API_CONFIG_LEGACY];
  if (!oldConfig) return [];

  const newConfigs = [];
  const providers = ["deepseek", "openrouter", "custom"];
  for (let i = 0; i < providers.length; i++) {
    const provider = providers[i];
    const key = "apiConfig_" + provider;
    const pc = allStorage[key];
    if (pc && pc.apiKey) {
      newConfigs.push({
        id: generateIdFn(),
        label: provider.charAt(0).toUpperCase() + provider.slice(1),
        apiKey: pc.apiKey,
        apiUrl: pc.apiUrl || "",
        apiModel: pc.apiModel || "",
        temperature: pc.temperature || "0.3",
        maxTokens: pc.maxTokens || "4096",
        extraParams: pc.extraParams || ""
      });
    }
  }

  if (oldConfig.apiKey) {
    const exists = newConfigs.some(function (c) {
      return c.apiUrl === oldConfig.apiUrl && c.apiKey === oldConfig.apiKey;
    });
    if (!exists) {
      newConfigs.push({
        id: generateIdFn(),
        label: oldConfig.apiProvider || "Default",
        apiKey: oldConfig.apiKey,
        apiUrl: oldConfig.apiUrl || "",
        apiModel: oldConfig.apiModel || "",
        temperature: oldConfig.temperature || "0.3",
        maxTokens: oldConfig.maxTokens || "4096",
        extraParams: oldConfig.extraParams || ""
      });
    }
  }

  return newConfigs;
}
