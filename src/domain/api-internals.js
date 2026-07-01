// ============================================================
//  api-internals.js — api.js の内部実装 (buildRequestConfig) を
//  テストから直接テスト可能にするために分離。
//  本番コードからは api.js 経由でのみ呼ばれる。
// ============================================================
import { DEFAULT_MAX_TOKENS, DEFAULT_TEMPERATURE } from "../shared/constants.js";
import { buildAuthHeaders } from "./api-auth.js";
import { createLogger } from "../shared/logger.js";

const log = createLogger("api-internals");

/**
 * LLM API へのリクエストを構築する (内部関数)
 * @param {Object} config - API 設定
 * @param {Array} messages - チャット messages
 * @param {boolean} stream - ストリーミングモードか
 * @returns {Object} { headers, body } 形式
 */
export function buildRequestConfig(config, messages, stream) {
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
