// ============================================================
//  api.js — LLM API 呼び出しの公開ファサード（ESM版）
//  認証 (api-auth) / リトライ (api-retry) / SSE (api-stream) /
//  リクエスト構築 (api-request) を束ねて公開する。
// ============================================================
import {
  API_MAX_RETRIES_STREAM,
  API_MAX_RETRIES_NONSTREAM,
  DEFAULT_MAX_TOKENS,
  DEFAULT_TEMPERATURE
} from "../shared/constants.js";
import {
  fetchWithRetry,
  handleErrorResponse,
  isRetryableHttpStatus,
  isRetryableNetworkError
} from "./api-retry.js";
import { readStream } from "./api-stream.js";
import { isOpenRouterUrl, buildAuthHeaders, deriveModelsUrl } from "./api-auth.js";
import { createLogger } from "../shared/logger.js";

const log = createLogger("api");

// ===== リクエスト構築 =====
function buildRequestConfig(config, messages, stream) {
  const headers = buildAuthHeaders(config.apiUrl, config.apiKey);
  const body = {
    model: config.apiModel,
    messages: messages,
    max_tokens: parseInt(config.maxTokens || String(DEFAULT_MAX_TOKENS), 10),
    temperature: parseFloat(config.temperature || String(DEFAULT_TEMPERATURE)),
    stream: stream
  };
  if (config.extraParams) {
    try {
      const extra = JSON.parse(config.extraParams);
      deepMergeBody(body, extra);
    } catch (e) {
      log.error("extraParams JSON parse error:", e);
    }
  }
  return { headers: headers, body: JSON.stringify(body) };
}

// 深いマージ（extraParams 用）
function deepMergeBody(target, src) {
  if (!target || typeof target !== "object" || Array.isArray(target)) return target;
  if (!src || typeof src !== "object" || Array.isArray(src)) return target;
  for (const key in src) {
    if (!Object.prototype.hasOwnProperty.call(src, key)) continue;
    const val = src[key];
    if (val === undefined) continue;
    const cur = target[key];
    if (
      cur &&
      typeof cur === "object" &&
      !Array.isArray(cur) &&
      val &&
      typeof val === "object" &&
      !Array.isArray(val)
    ) {
      deepMergeBody(cur, val);
    } else {
      target[key] = val;
    }
  }
  return target;
}

// ===== 公開 API =====

/**
 * モデル一覧を取得（OpenAI 互換 /models エンドポイント）
 * @returns {Promise<Array<{id: string, label?: string}>>}
 */
export async function fetchModelList(apiUrl, apiKey) {
  if (!apiUrl) throw new Error("APIエンドポイントURLが未設定です");
  if (!apiKey) throw new Error("モデル一覧の取得にはAPIキーが必要です");

  const modelsUrl = deriveModelsUrl(apiUrl);
  const headers = buildAuthHeaders(apiUrl, apiKey);
  const controller = new AbortController();
  const timeoutId = setTimeout(function () {
    controller.abort();
  }, 30000);
  let response;
  try {
    response = await fetch(modelsUrl, {
      method: "GET",
      headers: headers,
      signal: controller.signal
    });
  } catch (e) {
    clearTimeout(timeoutId);
    if (e instanceof DOMException && e.name === "AbortError") {
      throw new Error("モデル一覧の取得がタイムアウトしました");
    }
    throw new Error("モデル一覧の取得に失敗しました（ネットワークエラー）: " + (e.message || e));
  }
  clearTimeout(timeoutId);

  if (!response.ok) {
    let errText = "";
    try {
      errText = await response.text();
    } catch {
      /* noop */
    }
    let msg;
    if (response.status === 401 || response.status === 403) {
      msg = "APIキーが無効です（" + response.status + "）";
    } else if (response.status === 404) {
      msg =
        "モデル一覧エンドポイントが見つかりません（" +
        modelsUrl +
        "）。手動でモデル名を入力してください。";
    } else {
      msg = "モデル一覧の取得に失敗しました（" + response.status + "）";
    }
    throw new Error(msg + (errText ? ": " + errText.substring(0, 100) : ""));
  }

  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error("モデル一覧のレスポンスがJSON形式ではありません");
  }

  const list = Array.isArray(data) ? data : data && data.data ? data.data : [];
  const models = [];
  for (let i = 0; i < list.length; i++) {
    const m = list[i];
    if (!m || !m.id) continue;
    const label = m.name || m.id;
    models.push({ id: m.id, label: label });
  }
  models.sort(function (a, b) {
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
  return models;
}

/**
 * 非ストリーミング API 呼び出し（チャンク処理用、高速）
 */
export async function callChatAPINonStream(messages, config, abortSignal) {
  const fetchOptions = buildRequestConfig(config, messages, false);
  if (abortSignal) fetchOptions.signal = abortSignal;
  const response = await fetchWithRetry(config.apiUrl, fetchOptions, API_MAX_RETRIES_NONSTREAM);
  if (!response.ok) await handleErrorResponse(response);
  const data = await response.json();
  const content =
    data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
  return content || "";
}

/**
 * ストリーミング API 呼び出し
 */
export async function callChatAPIStream(messages, config, onChunk, onDone, abortSignal) {
  const fetchOptions = buildRequestConfig(config, messages, true);
  if (abortSignal) fetchOptions.signal = abortSignal;
  const response = await fetchWithRetry(config.apiUrl, fetchOptions, API_MAX_RETRIES_STREAM);
  if (!response.ok) await handleErrorResponse(response);
  const reader = response.body.getReader();
  await readStream(reader, onChunk, onDone);
}

// 公開 API (auth utilities)
export { isOpenRouterUrl, buildAuthHeaders, deriveModelsUrl };

// 公開 API (retry utilities)
export { fetchWithRetry, handleErrorResponse, isRetryableHttpStatus, isRetryableNetworkError };

// 公開 API (stream utility)
export { readStream };

// buildRequestConfig は api.js 内部関数だが、テスト互換のため再エクスポート
export { buildRequestConfig };
