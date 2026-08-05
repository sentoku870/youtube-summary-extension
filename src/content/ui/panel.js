// ============================================================
//  panel.js — DOM生成・要素検索・ボタン制御（ESM版）
//  Phase C-1: 配置戦略を panel-placement.js に分離。
//  Phase 3-3: 静的 HTML テンプレートを panel-template.js に分離。
//  本モジュールは
//    - DOM 検索キャッシュ付き getEl
//    - 全ボタン制御 (enableAllButtons)
//    - パネルの生成 (createPanel: スケルトン HTML + 状態初期化)
//  を担当。配置は panel-placement.js に委譲する。
//  Phase 2-B: uiState の直接書き換えを setUiState() 経由に統一。
// ============================================================
import { uiState as S, setUiState } from "../../shared/state.js";
import { createInitialTabState } from "../../shared/state.js";
import { applyTheme, applyFontSize, applyPanelHeight } from "./appearance.js";
import { TAB_IDS } from "../../shared/constants.js";
import { placePanel } from "./panel-placement.js";
import { PANEL_HTML } from "./panel-template.js";
import "./sidebar.css";

// ===== DOM 検索キャッシュ =====
// querySelector を毎フレーム呼ぶと CPU 負荷になる。
// 同一セレクタの結果をパネルインスタンス毎にキャッシュする。
// パネル破棄時はキャッシュも自動的に無効化（WeakMap）。
// null 結果はキャッシュしない（動的に追加される要素を考慮）。
const elCache = new WeakMap();

// ===== 内部ヘルパー =====
export function getEl(id) {
  const panel = S.panelEl;
  if (!panel) return null;
  let cache = elCache.get(panel);
  if (!cache) {
    cache = new Map();
    elCache.set(panel, cache);
  }
  if (cache.has(id)) {
    const cached = cache.get(id);
    // ノードが DOM から切り離されていたら再検索
    if (cached && cached.isConnected) return cached;
  }
  const el = panel.querySelector(id);
  if (el) cache.set(id, el);
  return el || null;
}

// ===== ボタン制御 =====
export function enableAllButtons() {
  const btns = S.panelEl ? S.panelEl.querySelectorAll(".ys-tab-row button") : [];
  btns.forEach(function (b) {
    b.disabled = false;
  });
}

// ===== サイドバーDOM生成 =====
export function createPanel() {
  if (S.panelEl) return S.panelEl;

  const tabs = {};
  const tabIds = [...TAB_IDS];
  tabIds.forEach(function (id) {
    tabs[id] = createInitialTabState();
  });
  const panelEl = document.createElement("div");
  panelEl.id = "yt-summary-root";
  // 静的マークアップ（すべてコンパイル時リテラル）のため innerHTML を使用。
  // XSS 安全性は panel-template.js 側に集約。AGENTS.md の innerHTML ルール
  // に基づき、ユーザー入力は textContent / createElement 経由で挿入する。
  panelEl.innerHTML = PANEL_HTML;

  // panelEl 構築後に uiState へ一括反映（setUiState で 1 箇所に集約）
  setUiState({
    tabIds: tabIds,
    tabs: tabs,
    panelEl: panelEl
  });

  // ★ 字幕プリロード完了を待たず、ボタンは押せる状態にする。
  // 旧実装では全ボタンを disabled にしていたが、preloadTranscript() の
  // TRANSCRIPT_READY/FAILED が何らかの理由で発火しないとボタンが永久に
  // 押せず、A→B の切替も効かない状態になっていた。
  // AI 実行 (callAI) 内で transcript を改めて取得するため、ボタン無効化は不要。
  const btnSummary = getEl("#ys-btn-summary");
  if (btnSummary) btnSummary.textContent = "⏳ 字幕取得中...";

  // T3-S1: スタイル（テーマ/フォントサイズ/パネル高さ）は配置 (placePanel) の
  // 完了を待たず即座に適用を開始する。appearance.js は uiState.panelEl を
  // 直接参照するため、DOM 挿入前でも安全に CSS 変数をセットできる。
  // 旧実装では placePanel の解決を待つため、ユーザーが高速でボタンを押した
  // ときに「未スタイル → スタイル適用」の 2 段レイアウトで応答がちらついて
  // いた（残像/かぶりの原因）。
  applyTheme();
  applyFontSize();
  applyPanelHeight();

  // 配置（非同期：#secondary が現れるまで待ってから配置）
  placePanel(S.panelEl);

  return S.panelEl;
}
