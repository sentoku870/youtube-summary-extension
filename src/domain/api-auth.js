// ============================================================
//  api-auth.js — 認証ヘルパー
//  OpenRouter 検出、認証ヘッダ構築
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
 * 認証ヘッダを構築
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
