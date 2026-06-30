// ============================================================
//  ai-finalize.js — 要約結果のファイナライズ処理（ESM版）
//  Phase C-2: ai.js から分割。
//  チャット履歴の初期化、UI 状態の更新、storage への保存を担当。
//
//  依存:
//    - shared/state.js: uiState / sessionState
//    - shared/utils.js: getCurrentVideoId
//    - shared/constants.js: CHAT_HISTORY_SEED_LENGTH
//    - infrastructure/storage.js: saveToStorage / saveSummaryCache
//    - domain/ports.js: UI adapter
// ============================================================
import { uiState, sessionState } from "../shared/state.js";
import { saveToStorage, saveSummaryCache } from "../infrastructure/storage.js";
import { getCurrentVideoId } from "../shared/utils.js";
import { CHAT_HISTORY_SEED_LENGTH } from "../shared/constants.js";
import { getUiAdapter } from "./ports.js";
import { createLogger } from "../shared/logger.js";

const log = createLogger("ai-finalize");

function UI() {
  return getUiAdapter();
}

/**
 * 要約結果を確定し、UI 更新と永続化を行う。
 *
 * @param {string} mode - タブ ID (summary / customA / customB)
 * @param {object} tab - uiState.tabs[mode]
 * @param {string} content - 生成された要約テキスト
 * @param {object} config - 使用した API 設定
 * @param {string} prompt - システムプロンプト
 * @param {string} userMessage - 最初のユーザーメッセージ
 * @param {object} transcript - transcript.all / transcript.meta を含む字幕データ
 */
export function finalizeResult(mode, tab, content, config, prompt, userMessage, transcript) {
  const ui = UI();
  tab.generated = true;
  tab.content = content;
  tab.config = config;
  tab.modelLabel = config.apiModel;
  tab.transcriptCount = transcript.all.length;
  tab.chatHistory = [
    { role: "system", content: prompt },
    { role: "user", content: userMessage },
    { role: "assistant", content: content }
  ];
  // 整合性チェック: 上記の初期履歴は CHAT_HISTORY_SEED_LENGTH と同数でなければならない
  if (tab.chatHistory.length !== CHAT_HISTORY_SEED_LENGTH) {
    log.warn("chatHistory seed length mismatch: expected " + CHAT_HISTORY_SEED_LENGTH);
  }

  if (uiState.activeTab === mode) {
    ui.hideProgress();
    ui.setSummaryContent(content);
    ui.updateInfoLabel(
      "使用モデル: " + config.apiModel + " | 字幕 " + transcript.all.length + " 件"
    );
    ui.showChatArea();
    ui.focusChatInput();
    ui.showCopyButton();
    ui.showRegenButton();
  }
  ui.updateTabUI();
  sessionState.abortController = null;

  saveToStorage(content, transcript.all);
  try {
    const videoId = getCurrentVideoId();
    if (videoId) {
      saveSummaryCache(videoId, mode, {
        content: content,
        modelLabel: config.apiModel,
        transcriptCount: transcript.all.length
      });
    }
  } catch (e) {
    log.error("Failed to save summary cache:", e);
  }
}