// ============================================================
//  api.js — API呼び出し（ESM版）
//  共通ロジックを抽出し、カスタムエラークラスを利用
// ============================================================
import { YsAPIError, YsAbortError, YsTimeoutError } from "../infrastructure/errors.js";
import {
  API_TIMEOUT_MS,
  API_MAX_RETRIES_STREAM,
  API_MAX_RETRIES_NONSTREAM,
  API_RETRY_BASE_WAIT_MS,
  API_RETRY_NET_BASE_WAIT_MS,
  DEFAULT_MAX_TOKENS,
  DEFAULT_TEMPERATURE
} from "../shared/constants.js";

// ===== OpenRouter 判定（ホスト名ベースの厳密判定） =====
export function isOpenRouterUrl(apiUrl) {
  if (!apiUrl) return false;
  try {
    return new URL(apiUrl).hostname === "openrouter.ai";
  } catch {
    // 不正URLは部分一致フォールバック
    return apiUrl.indexOf("openrouter.ai") !== -1;
  }
}

// ===== 認証ヘッダー構築（チャット/モデル一覧で共用） =====
// OpenRouter は HTTP-Referer / X-Title が必須。他は Bearer のみ。
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

// ===== chat/completions URL から /models URL を推論 =====
// OpenAI 互換 API は `/v1/chat/completions` と `/v1/models` が兄弟パスとして配置される慣例を利用。
// 例外: `/chat/completions` が含まれない場合は `${origin}/v1/models` にフォールバック。
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
    // フォールバック: 末尾が /chat や /v1 等で終わる場合も考慮して /v1/models を推論
    if (/\/v\d+(\/|$)/.test(path)) {
      u.pathname = path.replace(/\/v\d+(\/.*)?$/, "/v1") + "/models";
      u.search = "";
      return u.toString();
    }
    u.pathname = "/v1/models";
    u.search = "";
    return u.toString();
  } catch {
    // 不正URLは文字列置換で最低限のフォールバック
    return apiUrl.replace("/chat/completions", "/models");
  }
}

// ===== 利用可能なモデル一覧を取得（OpenAI 互換 /models エンドポイント） =====
// 戻り値: { id, label } の配列（label は OpenRouter のみ人間可読名を含む場合あり）
// 失敗時は例外を投げる（呼び出し元で catch してフォールバック表示）
export async function fetchModelList(apiUrl, apiKey) {
  if (!apiUrl) {
    throw new Error("APIエンドポイントURLが未設定です");
  }
  if (!apiKey) {
    throw new Error("モデル一覧の取得にはAPIキーが必要です");
  }
  const modelsUrl = deriveModelsUrl(apiUrl);
  const headers = buildAuthHeaders(apiUrl, apiKey);

  const controller = new AbortController();
  const timeoutId = setTimeout(function () {
    controller.abort();
  }, API_TIMEOUT_MS);
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
      throw new YsTimeoutError("モデル一覧の取得がタイムアウトしました");
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

  // OpenAI互換: { data: [{ id, ... }] }
  // OpenRouter: { data: [{ id, name, ... }] }
  const list = Array.isArray(data) ? data : data && data.data ? data.data : [];
  const models = [];
  for (let i = 0; i < list.length; i++) {
    const m = list[i];
    if (!m || !m.id) continue;
    // OpenRouter は name プロパティに人間可読名を提供する場合がある
    const label = m.name || m.id;
    models.push({ id: m.id, label: label });
  }
  // アルファベット順でソート（安定したUX）
  models.sort(function (a, b) {
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
  return models;
}

// ===== 共通リクエスト設定構築 =====
export function buildRequestConfig(config, messages, stream) {
  const headers = buildAuthHeaders(config.apiUrl, config.apiKey);

  const body = {
    model: config.apiModel,
    messages: messages,
    max_tokens: parseInt(config.maxTokens || String(DEFAULT_MAX_TOKENS), 10),
    temperature: parseFloat(config.temperature || String(DEFAULT_TEMPERATURE)),
    stream: stream
  };

  // extraParams のマージ（深いマージで上書きによる破壊を防止）
  // 例: response_format などのネストしたオプションを安全に統合
  if (config.extraParams) {
    try {
      const extra = JSON.parse(config.extraParams);
      deepMergeBody(body, extra);
    } catch (e) {
      console.error("[YouTube 要約] extraParams JSON parse error:", e);
    }
  }

  return { headers: headers, body: JSON.stringify(body) };
}

// ===== 深いマージ（extraParams 用） =====
// target は body（既定項目）、src はユーザー指定 extraParams。
// ネストしたプレーンオブジェクトは再帰マージ、
// 配列やスカラーは src で上書き（既定の model/messages 等は保護）。
function deepMergeBody(target, src) {
  if (!target || typeof target !== "object" || Array.isArray(target)) return target;
  if (!src || typeof src !== "object" || Array.isArray(src)) return target;
  for (const key in src) {
    if (!Object.prototype.hasOwnProperty.call(src, key)) continue;
    // 既定項目（model, messages, max_tokens, temperature, stream）の
    // 上書きはユーザー意図が不明瞭なため許容するが、
    // 安全のため undefined のみ無視
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
      // 両側プレーンオブジェクト → 再帰マージ
      deepMergeBody(cur, val);
    } else {
      target[key] = val;
    }
  }
  return target;
}

// ===== エラーレスポンス解析 =====
export async function handleErrorResponse(response) {
  let errText = "";
  try {
    errText = await response.text();
  } catch (e) {
    console.error("[YouTube 要約] failed to read error response body:", e);
  }
  let statusMsg = "";
  if (response.status === 429) {
    statusMsg = "APIの利用制限中です（レート制限）。しばらく待ってから再試行してください。";
  } else if (response.status >= 500) {
    statusMsg =
      "APIサーバーでエラーが発生しました（" + response.status + "）。後ほど再試行してください。";
  } else {
    statusMsg =
      "APIエラー (" +
      response.status +
      "): " +
      (errText.length > 100 ? errText.substring(0, 100) + "..." : errText);
  }
  throw new YsAPIError(statusMsg, response.status, response.statusText);
}

// ===== リトライ判定ヘルパー =====
// HTTPステータスコードがリトライ対象か判定（429 および 5xx）
export function isRetryableHttpStatus(status) {
  return status === 429 || status >= 500;
}

// ネットワークエラーがリトライ対象か判定（AbortError は対象外）
export function isRetryableNetworkError(err) {
  if (!err) return false;
  if (err instanceof DOMException && err.name === "AbortError") return false;
  // その他のネットワーク例外（TypeError 等）はリトライ対象
  return true;
}

// 1回の fetch 試行を実行（タイムアウト + 外部 abort 連携）
// 戻り値: { response, abortedByExternal, timedOut }
//   response: 成功時 Response / HTTP エラー時 Response / 失敗時 null
//   abortedByExternal: 外部シグナルで中断された
//   timedOut: 内部タイムアウトで中断された
async function attemptFetch(url, options, externalSignal) {
  const controller = new AbortController();
  const timeoutId = setTimeout(function () {
    controller.abort("timeout");
  }, API_TIMEOUT_MS);
  let abortedByExternal = false;
  let onAbortExternal = null;
  if (externalSignal) {
    onAbortExternal = function () {
      abortedByExternal = true;
      controller.abort("external");
    };
    externalSignal.addEventListener("abort", onAbortExternal, { once: true });
  }
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: options.headers,
      body: options.body,
      signal: controller.signal
    });
    return { response: response, abortedByExternal: abortedByExternal, timedOut: false };
  } catch (e) {
    const timedOut = !abortedByExternal && e instanceof DOMException && e.name === "AbortError";
    return { response: null, abortedByExternal: abortedByExternal, timedOut: timedOut, error: e };
  } finally {
    clearTimeout(timeoutId);
    if (onAbortExternal && externalSignal) {
      externalSignal.removeEventListener("abort", onAbortExternal);
    }
  }
}

// リトライ待機（指数バックオフ）
function backoffMs(attempt, baseMs) {
  return attempt * baseMs;
}

// ===== リトライ付きAPI呼び出し（abortSignal対応） =====
// 戻り値: Response（成功時は ok、リトライ限界到達時は最後のResponse）
// 例外: 中断・タイムアウト・全リトライ失敗時に throw
export async function fetchWithRetry(url, options, maxRetries) {
  const externalSignal = options.signal || null;
  let lastResponse = null;
  let lastError = null;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const { response, abortedByExternal, timedOut, error } = await attemptFetch(
      url,
      options,
      externalSignal
    );

    if (response) {
      if (response.ok) return response;
      lastResponse = response;
      if (isRetryableHttpStatus(response.status) && attempt < maxRetries) {
        await new Promise(function (r) {
          setTimeout(r, backoffMs(attempt, API_RETRY_BASE_WAIT_MS));
        });
        continue;
      }
      return response;
    }

    // response === null: fetch 自体が失敗
    if (abortedByExternal) {
      throw new YsAbortError("API呼び出しが中断されました。");
    }
    if (timedOut) {
      throw new YsTimeoutError("API応答が30秒でタイムアウトしました。");
    }
    lastError = error;
    lastResponse = null;
    if (isRetryableNetworkError(error) && attempt < maxRetries) {
      await new Promise(function (r) {
        setTimeout(r, backoffMs(attempt, API_RETRY_NET_BASE_WAIT_MS));
      });
      continue;
    }
    throw error;
  }
  // ループ終了後のフォールスルー対策（理論上到達しない）
  if (lastResponse) return lastResponse;
  if (lastError) throw lastError;
  throw new Error("fetchWithRetry: retries exhausted unexpectedly");
}

// ===== SSEパース =====
export async function readStream(reader, onChunk, onDone) {
  const decoder = new TextDecoder();
  let buffer = "";
  let accumulated = "";
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      buffer += decoder.decode(result.value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line === "data: [DONE]") {
          onDone(accumulated);
          return;
        }
        if (line.indexOf("data: ") === 0) {
          const jsonStr = line.substring(6);
          try {
            const parsed = JSON.parse(jsonStr);
            const delta = parsed.choices && parsed.choices[0] && parsed.choices[0].delta;
            if (delta && delta.content) {
              accumulated += delta.content;
              onChunk(accumulated);
            }
          } catch (e) {
            console.error("[YouTube 要約] JSON parse error in SSE stream:", e);
          }
        }
      }
    }
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError")
      throw new YsAbortError("API応答が中断されました。");
    console.error("[YouTube 要約] SSE stream read error:", e);
    throw e;
  }
  onDone(accumulated);
}

// ===== 非ストリーミングAPI呼び出し（チャンク処理用、高速） =====
export async function callChatAPINonStream(messages, config, abortSignal) {
  const fetchOptions = buildRequestConfig(config, messages, false);
  if (abortSignal) fetchOptions.signal = abortSignal;

  const response = await fetchWithRetry(config.apiUrl, fetchOptions, API_MAX_RETRIES_NONSTREAM);

  if (!response.ok) {
    await handleErrorResponse(response);
  }

  const data = await response.json();
  const content =
    data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
  return content || "";
}

// ===== ストリーミングAPI呼び出し（abortSignal対応） =====
export async function callChatAPIStream(messages, config, onChunk, onDone, abortSignal) {
  const fetchOptions = buildRequestConfig(config, messages, true);
  if (abortSignal) fetchOptions.signal = abortSignal;

  const response = await fetchWithRetry(config.apiUrl, fetchOptions, API_MAX_RETRIES_STREAM);

  if (!response.ok) {
    await handleErrorResponse(response);
  }

  const reader = response.body.getReader();
  await readStream(reader, onChunk, onDone);
}
