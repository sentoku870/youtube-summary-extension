// ============================================================
//  api-auth.js — 認証・URL 推論ヘルパー
//  OpenRouter 検出、認証ヘッダ構築、/models エンドポイント URL 推論
// ============================================================

/**
 * URL が OpenRouter かどうか（ホスト名ベースの厳密判定）
 * @param {string} apiUrl
 * @returns {boolean}
 */
export function isOpenRouterUrl(apiUrl) {
  if (!apiUrl) return false;
  try {
    return new URL(apiUrl).hostname === "openrouter.ai";
  } catch {
    // 不正URLは部分一致フォールバック
    return apiUrl.indexOf("openrouter.ai") !== -1;
  }
}

/**
 * 認証ヘッダを構築（チャット/モデル一覧で共用）
 * OpenRouter は HTTP-Referer / X-Title が必須。他は Bearer のみ。
 * @param {string} apiUrl
 * @param {string} apiKey
 * @returns {Object} ヘッダオブジェクト
 */
export function buildAuthHeaders(apiUrl, apiKey) {
  const headers = {
    "Content-Type": "application/json",
    Authorization: "Bearer " + apiKey
  };
  if (isOpenRouterUrl(apiUrl)) {
    headers["HTTP-Referer"] = "https://chrome.google.com/webstore";
    headers["X-Title"] = "YouTube Summary Extension";
  }
  return headers;
}

/**
 * chat/completions URL から /models URL を推論
 * OpenAI 互換 API は /v1/chat/completions と /v1/models が兄弟パスとして配置される慣例。
 * 例外: /chat/completions が含まれない場合は ${origin}/v1/models にフォールバック。
 * @param {string} apiUrl
 * @returns {string}
 */
export function deriveModelsUrl(apiUrl) {
  if (!apiUrl) return "";
  try {
    const u = new URL(apiUrl);
    const path = u.pathname || "";
    const idx = path.indexOf("/chat/completions");
    if (idx !== -1) {
      u.pathname = path.substring(0, idx) + "/models";
      u.search = "";
      return u.toString();
    }
    if (/\/v\d+(\/|$)/.test(path)) {
      u.pathname = path.replace(/\/v\d+(\/.*)?$/, "/v1") + "/models";
      u.search = "";
      return u.toString();
    }
    u.pathname = "/v1/models";
    u.search = "";
    return u.toString();
  } catch {
    return apiUrl.replace("/chat/completions", "/models");
  }
}
