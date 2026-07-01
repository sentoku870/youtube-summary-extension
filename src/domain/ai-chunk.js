// ============================================================
//  ai-chunk.js — 単一チャンクの処理（リトライ対応）
//  Map-Reduce 処理で各チャンクを要約する際の最小単位。
//  AbortError は上位に伝播し、それ以外はリトライ（CHUNK_MAX_ATTEMPTS 回）。
// ============================================================
import { callChatAPINonStream } from "./api.js";
import { createLogger } from "../shared/logger.js";
import { YsAbortError, YsTimeoutError } from "../infrastructure/errors.js";
import { getUiAdapter } from "./ports.js";

const log = createLogger("ai-chunk");

/**
 * 1 チャンクをリトライ付きで要約する
 * @param {Array} chunkMessages - チャンク用の messages 配列
 * @param {Object} config - API 設定
 * @param {AbortSignal} signal
 * @param {number} idx - チャンクインデックス (0-based)
 * @param {number} total - チャンク総数
 * @param {number} maxAttempts - 最大試行回数
 * @returns {Promise<{success: boolean, result: string|null}>}
 */
export async function processSingleChunk(chunkMessages, config, signal, idx, total, maxAttempts) {
  const ui = getUiAdapter();
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      ui.showProgress("📄 チャンク " + (idx + 1) + "/" + total + " を要約中...");
      const r = await callChatAPINonStream(chunkMessages, config, signal);
      ui.showProgress("📄 完了");
      return { success: true, result: r };
    } catch (e) {
      // 外部 abort / fetch タイムアウト / 全体タイムアウトはリトライせず上位に伝播
      if (e instanceof DOMException && e.name === "AbortError") throw e;
      if (e instanceof YsAbortError || e instanceof YsTimeoutError) throw e;
      if (attempt < maxAttempts) {
        log.warn(
          "チャンク " + (idx + 1) + " リトライ " + attempt + "/" + maxAttempts + ":",
          e.message
        );
        ui.showProgress("⚠️ チャンク " + (idx + 1) + " リトライ中");
        await new Promise(function (r) {
          setTimeout(r, 500);
        });
      } else {
        log.warn("チャンク " + (idx + 1) + " の処理に最終失敗:", e.message);
        ui.showProgress("⚠️ チャンク " + (idx + 1) + " をスキップ");
        return { success: false, result: null };
      }
    }
  }
  return { success: false, result: null };
}
