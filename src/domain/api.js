// ============================================================
//  api.js — LLM API 呼び出しの公開ファサード（ESM版）
//  認証 (api-auth) / リトライ (api-retry) / SSE (api-stream) /
//  リクエスト構築 (api-internals) を束ねて公開する。
// ============================================================
import {
  API_MAX_RETRIES_STREAM,
  API_MAX_RETRIES_NONSTREAM
} from "../shared/constants.js";
import {
  fetchWithRetry,
  handleErrorResponse
} from "./api-retry.js";
import { readStream } from "./api-stream.js";
import { buildRequestConfig } from "./api-internals.js";

// ===== 公開 API =====

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
