// ============================================================
//  tab-cache.js — saveSummaryCache からの復元ヘルパ
//  tabs.js から分離。テスト時は __resetSummaryCacheMemory で
//  メモリキャッシュをクリアして再評価できる。
//  Phase 3-2: tabs.js を switchTab の薄層に専念させるため分離。
// ============================================================
import { loadSummaryCache } from "../../infrastructure/storage-cache.js";
import { getCurrentVideoId } from "../../shared/utils.js";
import { createLogger } from "../../shared/logger.js";
import { CHAT_HISTORY_SEED_LENGTH } from "../../shared/constants.js";

const log = createLogger("tab-cache");

/**
 * 現在の videoId + mode に対する saveSummaryCache を取得する。
 * chatHistory は保存していないため、UI 復元は content / modelLabel /
 * transcriptCount のみ。
 *
 * @param {string} mode - タブ ID (summary / customA / customB)
 * @returns {Promise<object|null>}
 */
export async function loadCachedSummary(mode) {
  try {
    const videoId = getCurrentVideoId();
    if (!videoId) return null;
    const cached = await loadSummaryCache(videoId, mode);
    if (!cached) return null;
    return cached;
  } catch (e) {
    log.warn("loadCachedSummary failed:", e && e.message);
    return null;
  }
}

/**
 * キャッシュデータでタブ state を更新する（再水和）。
 * 副作用として tab.config を null にし、チャット開始時に再解決される
 * ようにする。chatHistory は保存していないため、長さが不足していれば
 * 空配列にリセット（system seed はチャット開始時に chat.js が再注入）。
 *
 * @param {object} tab - uiState.tabs[mode]
 * @param {object} cached - loadCachedSummary の戻り値
 */
export function applyCachedSummary(tab, cached) {
  tab.generated = true;
  tab.content = cached.content || "";
  tab.modelLabel = cached.modelLabel || "";
  tab.transcriptCount = cached.transcriptCount || 0;
  // config は保存していないため null。チャット開始時に再解決される。
  tab.config = null;
  // chatHistory は保存していない。system ロールのみのシードを入れてチャット可能に。
  if (!Array.isArray(tab.chatHistory) || tab.chatHistory.length < CHAT_HISTORY_SEED_LENGTH) {
    tab.chatHistory = [];
  }
}
