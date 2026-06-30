// ============================================================
//  tabs.js — タブ状態管理 + 切替ロジック（ESM版）
//  Phase B-2: bindEvents を tabs-events.js に分離。
//  本モジュールは「タブ状態 + switchTab / applyButtonTitles」の薄層に専念し、
//  DOM イベント登録は tabs-events.js、描画ヘルパは tabs-ui.js / ui.js に委譲する。
// ============================================================
import { uiState as S, sessionState } from "../../shared/state.js";
import { getEl, enableAllButtons } from "./panel.js";
import { updateTabUI, updateTabActive, renderTabContent } from "./tabs-ui.js";
import { callAI, abortCurrentStream } from "../../domain/ai.js";
import { loadButtonTitle } from "../../infrastructure/storage-config.js";
import { loadSummaryCache } from "../../infrastructure/storage-cache.js";
import { CHAT_HISTORY_SEED_LENGTH } from "../../shared/constants.js";
import { createLogger } from "../../shared/logger.js";
import { getCurrentVideoId } from "../../shared/utils.js";
import { abortChatStream } from "./chat.js";

const log = createLogger("tabs");

// tabs-ui.js / chat.js からの再エクスポート（呼び出し側の互換用）
// B-2: bindEvents は tabs-events.js から直接 import する（循環依存回避）。
export { updateTabUI, updateTabActive, renderTabContent };
export { abortChatStream };

// ===== タブ切り替え =====
export async function switchTab(mode) {
  const tab = S.tabs[mode];
  if (!tab) return;
  const panel = getEl("#ys-panel");
  if (!panel) return;

  // ★ 重要: 進行中の AI ストリームとチャットを必ず中断する。
  //   これを怠ると、古い呼び出しの finally が
  //   enableAllButtons() / applyButtonTitles() を呼んで
  //   新しいタブで処理中のボタンの見た目（"処理中..." / disabled）を
  //   巻き戻し、「切り替えが効かない」「残像が出る」症状を引き起こす。
  abortCurrentStream();
  abortChatStream();

  // 呼び出しに固有の世代番号。後の finally で
  //   「自分が最新世代である場合のみ」ボタン状態を復元するために使う。
  const myGen = ++sessionState._switchGen;

  if (S.activeTab === mode) {
    panel.style.display = "none";
    S.activeTab = null;
    updateTabActive();
    return;
  }
  S.activeTab = mode;
  panel.style.display = "flex";
  updateTabActive();
  if (tab.generated) {
    renderTabContent(mode);
    requestAnimationFrame(function () {
      scrollContentTop();
    });
  } else {
    const btn = getEl("#ys-btn-" + mode);
    if (btn) {
      btn.textContent = "⏳ 処理中...";
      btn.disabled = true;
    }
    // T2-A5: 未生成タブでも saveSummaryCache ヒット時は即時表示。
    // 同じ動画を再訪したときに API 0 回で要約を復元できる。
    // ボタンは「処理中...」のまま見えるため、ヒット時は明示的に復元する。
    // ★ T3-C1: mode を渡して (videoId, mode) 別キャッシュを取得。
    const cached = await loadCachedSummary(mode);
    if (cached) {
      // await を経ている間に別タブが押された場合、古い呼び出しは破棄
      if (myGen !== sessionState._switchGen) return;
      applyCachedSummary(tab, cached);
      renderTabContent(mode);
      updateTabUI();
      if (btn) {
        btn.disabled = false;
        applyButtonTitles();
      }
      requestAnimationFrame(function () {
        scrollContentTop();
      });
      return;
    }
    try {
      // callAI は内部でエラー/中断を処理し、UIも更新するため
      // ここでは戻り値を使わず、finally でボタン状態を復元する。
      await callAI(mode, true);
    } finally {
      // 別タブへの切替で世代が変わっていれば、
      // applyButtonTitles → enableAllButtons が他タブの処理中ボタンを
      // 巻き込まないように何もしない。ボタン状態の復元は
      // 最新世代の switchTab が最終的に行う。
      if (myGen === sessionState._switchGen) {
        if (btn) {
          btn.disabled = false;
          applyButtonTitles();
        }
      }
    }
    requestAnimationFrame(function () {
      scrollContentTop();
    });
  }
}

// T2-A5: 現在の videoId + mode に対する saveSummaryCache を取得。
// chatHistory は保存していないため、UI 復元は content / modelLabel / transcriptCount のみ。
async function loadCachedSummary(mode) {
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

function applyCachedSummary(tab, cached) {
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

// #ys-content-area のスクロール位置を先頭へ
// （旧: #ys-panel.scrollTop。スクロール領域を content-area に分離したため）
function scrollContentTop() {
  const area = getEl("#ys-content-area");
  if (area) area.scrollTop = 0;
}

// ===== ボタンタイトル適用 =====
// 全 3 ボタンを storage の btnTitle_* から取得し、未設定なら A/B/C にフォールバック。
export async function applyButtonTitles() {
  const btnSummary = getEl("#ys-btn-summary");
  const btnA = getEl("#ys-btn-customA");
  const btnB = getEl("#ys-btn-customB");
  const [titleS, titleA, titleB] = await Promise.all([
    loadButtonTitle("summary"),
    loadButtonTitle("customA"),
    loadButtonTitle("customB")
  ]);
  if (btnSummary) btnSummary.textContent = titleS ? "📝 " + titleS : "📝 A";
  if (btnA) btnA.textContent = titleA ? "📊 " + titleA : "📊 B";
  if (btnB) btnB.textContent = titleB ? "💡 " + titleB : "💡 C";
  enableAllButtons();
  updateTabUI();
}
