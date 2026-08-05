// ============================================================
//  tabs.js — タブ状態管理 + 切替ロジック（ESM版）
//  Phase B-2: bindEvents を tabs-events.js に分離。
//  Phase P1-D: applyButtonTitles を tabs-ui.js に分離。
//  Phase 3-2: saveSummaryCache のロードと applyCachedSummary を
//             tab-cache.js に分離。
//  本モジュールは「タブ状態 + switchTab」の薄層に専念し、
//  DOM イベント登録は tabs-events.js、描画ヘルパは tabs-ui.js、
//  キャッシュ復元は tab-cache.js に委譲する。
//  Phase 2-B: uiState の書き込みを setUiState 経由に統一。
// ============================================================
import { uiState as S, sessionState, setUiState } from "../../shared/state.js";
import { getEl } from "./panel.js";
import { updateTabUI, updateTabActive, renderTabContent, applyButtonTitles } from "./tabs-ui.js";
import { callAI, abortCurrentStream } from "../../domain/ai.js";
import { loadCachedSummary, applyCachedSummary } from "./tab-cache.js";
import { abortChatStream } from "./chat.js";

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
    setUiState({ activeTab: null });
    updateTabActive();
    return;
  }
  setUiState({ activeTab: mode });
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

// #ys-content-area のスクロール位置を先頭へ
// （旧: #ys-panel.scrollTop。スクロール領域を content-area に分離したため）
function scrollContentTop() {
  const area = getEl("#ys-content-area");
  if (area) area.scrollTop = 0;
}
