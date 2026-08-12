// ============================================================
//  nav/resetter.js — 動画切替時の状態リセット
//  nav/detector.js で SPA ナビゲーションが検出されたときに呼ばれ、
//  UI / session 状態を破棄して新しい動画の準備をする。
// ============================================================
import {
  uiState,
  sessionState,
  resetSession,
  setUiState,
  setSessionState
} from "../../shared/state.js";
import { isYouTubeWatchPage, getCurrentVideoId } from "../../shared/utils.js";
import { abortCurrentStream } from "../../domain/ai/orchestrator.js";
import { updateTabActive } from "../ui/tabs.js";
import { clearSummaryContent } from "../ui/ui-summary.js";
import { hideProgress } from "../ui/ui-progress.js";
import { abortChatStream, resetChatHistoryDom } from "../ui/chat.js";
import { TAB_IDS } from "../../shared/constants.js";
import { createLogger } from "../../shared/logger.js";

const log = createLogger("nav/resetter");

let safeInitFn = null;

// detector.js から呼ばれる初期化関数（safeInit）を保持する。
// handleNavigation() 内で動画切替時の再初期化に使う。
export function setSafeInit(fn) {
  safeInitFn = fn;
}

// ===== 字幕プリロード状態のリセット（index.js 起動フック用） =====
export function resetTranscript() {
  setSessionState({
    preloadedTranscript: null,
    transcriptReady: false,
    _transcriptGen: (sessionState._transcriptGen || 0) + 1
  });
}

// ===== 動画切替時のフルリセット =====
function resetState() {
  // N-1: 動画ID変化時のみリセットする。
  // 同一 URL の重複 emit / BFCache 復元 / ポーリング・yt-page-data-updated で
  // 再発火しても、activeVideoId が同じならユーザーの作業状態 (要約・タブ・
  // アクティブ表示・チャット履歴) を一切消さない。
  // activeVideoId 未設定時の初回のみリセットを許可 (古い動作互換)。
  const currentVideoId = getCurrentVideoId();
  const videoIdChanged = currentVideoId && uiState.activeVideoId !== currentVideoId;
  if (!videoIdChanged && uiState.activeVideoId !== null) {
    log.log("resetState: skip (same videoId re-emit, preserving user state)");
    return;
  }

  abortCurrentStream();
  // B-3: 進行中のチャット応答も中断してから session を破棄する。
  // resetSession() で chatAbortController が null になると、
  // その後の参照喪失で裏のチャットが完了するまで動き続ける。
  abortChatStream();
  resetSession();
  if (uiState.panelEl) {
    const panel = uiState.panelEl.querySelector("#ys-panel");
    // 動画IDが変化した場合のみ閉じる。同一動画の再 emit では触らない。
    if (panel && videoIdChanged) {
      panel.style.display = "none";
    }
    (uiState.tabIds || TAB_IDS).forEach(function (id) {
      const t = uiState.tabs[id];
      if (t) {
        t.generated = false;
        t.content = "";
        t.chatHistory = [];
      }
    });
    setUiState({ activeTab: null, activeVideoId: currentVideoId || null });
    updateTabActive();
    clearSummaryContent();
    // state の tab.chatHistory = [] と並べて DOM 側のチャット履歴表示もクリア。
    // 旧実装は state だけ消して DOM に古い Q&A が残っていたため、動画切替後に
    // 前の動画の質問/回答が見えてしまうリークがあった。
    resetChatHistoryDom();
    hideProgress();
  }
}

// ===== 動画切り替え時のリセット＋再初期化（共通処理） =====
export function handleNavigation() {
  if (!isYouTubeWatchPage(location.href)) return;
  resetState();
  resetTranscript();
  setUiState({ initialized: false });
  if (safeInitFn) safeInitFn();
}
