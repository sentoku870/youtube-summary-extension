// ============================================================
//  options-logic.js — オプション画面の純粋関数群（ESM版）
//  options.js から副作用のないロジックを分離。
//  DOM操作・イベント登録は options.js に残す。
// ============================================================
import { K } from "../infrastructure/storage.js";

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
    } catch {
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

// ===== 同一ホストの既存APIキーを検索（再入力不要化） =====
// 純粋関数: apiUrl を受け取り、configs 内で同一ホストの apiKey を返す。
// 該当なしは空文字、URL パース失敗も空文字を返す。
export function findExistingApiKeyByHost(apiUrl, configs) {
  if (!apiUrl) return "";
  if (!Array.isArray(configs) || configs.length === 0) return "";
  let host = "";
  try {
    host = new URL(apiUrl).hostname;
  } catch {
    return "";
  }
  if (!host) return "";
  for (let i = 0; i < configs.length; i++) {
    const c = configs[i];
    if (!c || !c.apiKey || !c.apiUrl) continue;
    try {
      if (new URL(c.apiUrl).hostname === host) {
        return c.apiKey;
      }
    } catch {
      // 不正URLは無視
    }
  }
  return "";
}
