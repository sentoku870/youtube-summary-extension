// ============================================================
//  message-handler.js — chrome.runtime.onMessage リスナー
//  Phase B-2: sidebar.js からメッセージ通信ロジックを分離
//  popup.js からのメッセージを受信して処理
// ============================================================
import { uiState as S } from "../../shared/state.js";
import { createPanel } from "./panel.js";
import { bindEvents, switchTab } from "./tabs.js";
import { applyFontSize, applyTheme } from "./appearance.js";
import { preloadTranscript, fetchTranscript } from "../../domain/transcript.js";
import { createLogger } from "../../shared/logger.js";

const log = createLogger("message-handler");

// ===== パネル初期化ヘルパー（3メッセージで共通化） =====
// パネル未生成なら生成し、表示してスタイルを適用する。
function ensurePanel() {
  if (!S.panelEl) {
    createPanel();
    bindEvents();
    applyFontSize();
    applyTheme();
  }
  if (S.panelEl) {
    S.panelEl.style.display = "";
  }
}

// ===== メッセージリスナー登録 =====
try {
  chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
    if (msg.action === "ysPing") {
      sendResponse({ alive: true });
    }
    if (msg.action === "ysGetTranscript") {
      (async function () {
        try {
          // パネルが未生成なら生成
          ensurePanel();
          // プリロード済み字幕があればそれを使い、なければ取得
          const r = await fetchTranscript();
          if (!r || !r.all || r.all.length === 0) {
            sendResponse({ error: "字幕が見つかりませんでした", transcript: [], player: [] });
            return;
          }
          sendResponse({ transcript: r.all, player: r.player || [], meta: r.meta || null });
        } catch (e) {
          log.error("ysGetTranscript error:", e);
          sendResponse({ error: e.message, transcript: [], player: [] });
        }
      })();
      return true;
    }
    if (msg.action === "ysForcePanel") {
      ensurePanel();
      if (S.panelEl) {
        preloadTranscript();
      }
      sendResponse({ done: true });
      return true; // 非同期応答フラグ（popup.js が応答を待てるように）
    }
    if (msg.action === "ysTriggerAi") {
      log.log("ysTriggerAi mode=" + msg.mode);
      (async function () {
        try {
          // パネルが未生成なら生成
          ensurePanel();
          // 字幕をプリロード
          await preloadTranscript();
          log.log("ysTriggerAi preload done, starting switchTab");
          // 対象タブを切り替え（AI処理開始）— awaitせず非同期実行
          switchTab(msg.mode).catch(function (err) {
            log.error("ysTriggerAi switchTab error:", err);
          });
          sendResponse({ success: true });
        } catch (e) {
          log.error("ysTriggerAi error:", e);
          sendResponse({ success: false, error: e.message });
        }
      })();
      return true;
    }
  });
} catch {
  log.warn(
    "runtime.onMessage listener could not be registered (extension context may be invalid)."
  );
}
