// ============================================================
//  api-retry.js — リトライ戦略 (fetchWithRetry)
//  HTTP/ネットワーク/タイムアウト/外部 abort の 4 経路を判定し、
//  指数バックオフでリトライする。
// ============================================================
import {
  API_TIMEOUT_MS,
  API_RETRY_BASE_WAIT_MS,
  API_RETRY_NET_BASE_WAIT_MS
} from "../shared/constants.js";
import { YsAPIError, YsAbortError, YsTimeoutError } from "../infrastructure/errors.js";
import { createLogger } from "../shared/logger.js";

const log = createLogger("api-retry");

/**
 * HTTPステータスコードがリトライ対象か判定（429 および 5xx）
 */
export function isRetryableHttpStatus(status) {
  return status === 429 || status >= 500;
}

/**
 * ネットワークエラーがリトライ対象か判定（AbortError は対象外）
 */
export function isRetryableNetworkError(err) {
  if (!err) return false;
  if (err instanceof DOMException && err.name === "AbortError") return false;
  return true;
}

// 1回の fetch 試行を実行（タイムアウト + 外部 abort 連携）
async function attemptFetch(url, options, externalSignal) {
  // 外部 signal が既に abort 済みなら即座に YsAbortError を投げる経路と同じ結果を返す。
  // addEventListener("abort") は過去イベントを再送しないため、listener 登録だけでは
  // 取りこぼす。早期に判定してリスナーを一切作らない。
  if (externalSignal && externalSignal.aborted) {
    return { response: null, abortedByExternal: true, timedOut: false };
  }
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

// 指数バックオフ (baseMs × 2^(attempt-1))
// 1回目: baseMs, 2回目: 2*baseMs, 3回目: 4*baseMs ...
// 429/5xx サーバーへの負荷軽減と再試行成功率向上を狙う。
function backoffMs(attempt, baseMs) {
  return baseMs * Math.pow(2, attempt - 1);
}

/**
 * リトライ付き API 呼び出し
 * @param {string} url
 * @param {Object} options - fetch options (headers, body, signal)
 * @param {number} maxRetries
 * @returns {Promise<Response>} 成功時は ok な Response
 * @throws {YsAbortError} 外部 abort
 * @throws {YsTimeoutError} タイムアウト
 * @throws {Error} 全リトライ失敗時
 */
export async function fetchWithRetry(url, options, maxRetries) {
  const externalSignal = options.signal || null;
  let lastResponse = null;
  let lastError = null;
  // C-5: バックオフタイマーをキャンセル可能にする。外部 signal が abort された
  // 場合に setTimeout のコールバックが後で走って resolve し、次の試行に進む
  // 競合を防ぐ。
  let backoffTimerId = null;
  const sleep = function (ms) {
    return new Promise(function (resolve) {
      backoffTimerId = setTimeout(function () {
        backoffTimerId = null;
        resolve();
      }, ms);
    });
  };
  const cancelBackoff = function () {
    if (backoffTimerId !== null) {
      clearTimeout(backoffTimerId);
      backoffTimerId = null;
    }
  };
  // 外部 signal が abort されたらバックオフ待機を即座に打ち切る
  const onExternalAbort = function () {
    cancelBackoff();
  };
  if (externalSignal) {
    externalSignal.addEventListener("abort", onExternalAbort, { once: true });
  }
  try {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      // バックオフ待機中、または直前の試行で外部 abort されていたら抜ける
      if (externalSignal && externalSignal.aborted) {
        throw new YsAbortError("API呼び出しが中断されました。");
      }
      const { response, abortedByExternal, timedOut, error } = await attemptFetch(
        url,
        options,
        externalSignal
      );

      if (response) {
        if (response.ok) return response;
        lastResponse = response;
        if (isRetryableHttpStatus(response.status) && attempt < maxRetries) {
          await sleep(backoffMs(attempt, API_RETRY_BASE_WAIT_MS));
          if (externalSignal && externalSignal.aborted) {
            throw new YsAbortError("API呼び出しが中断されました。");
          }
          continue;
        }
        return response;
      }

      if (abortedByExternal) {
        throw new YsAbortError("API呼び出しが中断されました。");
      }
      if (timedOut) {
        throw new YsTimeoutError("API応答が30秒でタイムアウトしました。");
      }
      lastError = error;
      lastResponse = null;
      if (isRetryableNetworkError(error) && attempt < maxRetries) {
        await sleep(backoffMs(attempt, API_RETRY_NET_BASE_WAIT_MS));
        if (externalSignal && externalSignal.aborted) {
          throw new YsAbortError("API呼び出しが中断されました。");
        }
        continue;
      }
      throw error;
    }
    // ループ終了後のフォールスルー対策（理論上到達しない）
    if (lastResponse) return lastResponse;
    if (lastError) throw lastError;
    throw new Error("fetchWithRetry: retries exhausted unexpectedly");
  } finally {
    cancelBackoff();
    if (externalSignal) {
      externalSignal.removeEventListener("abort", onExternalAbort);
    }
  }
}

/**
 * エラーレスポンスを解析して YsAPIError を投げる
 */
export async function handleErrorResponse(response) {
  let errText = "";
  try {
    errText = await response.text();
  } catch (e) {
    log.error("failed to read error response body:", e);
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
