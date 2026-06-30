// ============================================================
//  panel.js — DOM生成・要素検索・ボタン制御（ESM版）
//  Phase C-1: 配置戦略を panel-placement.js に分離。
//  本モジュールは
//    - DOM 検索キャッシュ付き getEl
//    - 全ボタン制御 (disable/enableAllButtons)
//    - パネルの生成 (createPanel: スケルトン HTML + 状態初期化)
//  を担当。配置は panel-placement.js に委譲する。
// ============================================================
import { uiState as S } from "../../shared/state.js";
import { applyTheme, applyFontSize, applyPanelHeight } from "./appearance.js";
import { TAB_IDS } from "../../shared/constants.js";
import { placePanel } from "./panel-placement.js";
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
export function disableAllButtons() {
  const btns = S.panelEl ? S.panelEl.querySelectorAll(".ys-tab-row button") : [];
  btns.forEach(function (b) {
    b.disabled = true;
  });
}

export function enableAllButtons() {
  const btns = S.panelEl ? S.panelEl.querySelectorAll(".ys-tab-row button") : [];
  btns.forEach(function (b) {
    b.disabled = false;
  });
}

// ===== サイドバーDOM生成 =====
export function createPanel() {
  if (S.panelEl) return S.panelEl;

  S.tabIds = [...TAB_IDS];
  S.tabs = {};
  S.tabIds.forEach(function (id) {
    S.tabs[id] = {
      generated: false,
      content: "",
      config: null,
      modelLabel: "",
      transcriptCount: 0,
      chatHistory: []
    };
  });

  S.panelEl = document.createElement("div");
  S.panelEl.id = "yt-summary-root";
  // 静的マークアップのため innerHTML を使用（XSS 対策: すべてコンパイル時リテラル）
  S.panelEl.innerHTML =
    '<div class="ys-tab-row">' +
    '<button id="ys-btn-summary" class="ys-tab-btn">📝 A</button>' +
    '<button id="ys-btn-customA" class="ys-tab-btn">📊 B</button>' +
    '<button id="ys-btn-customB" class="ys-tab-btn">💡 C</button>' +
    "</div>" +
    '<div id="ys-panel" style="display:none">' +
    '<div id="ys-error"></div>' +
    '<div id="ys-content-area">' +
    '<div id="ys-summaryText" class="ys-md"></div>' +
    '<div id="ys-progress" style="display:none;padding:8px;background:#444;color:#fff;border-radius:4px;font-size:12px;margin:4px 0;"></div>' +
    '<div id="ys-infoRow">' +
    '<span id="ys-infoLabel"></span>' +
    '<button id="ys-copyBtn" class="ys-action-btn" style="display:none;margin-left:8px;">📋 コピー</button>' +
    '<button id="ys-regenBtn" class="ys-action-btn" style="display:none;margin-left:4px;">🔄 再生成</button>' +
    "</div>" +
    '<div id="ys-chatHistory"></div>' +
    "</div>" +
    '<div id="ys-chatArea" style="display:none;">' +
    '<div class="chat-row">' +
    '<textarea id="ys-chatInput" rows="1" placeholder="質問を入力... (Enter=送信 / Shift+Enter=改行)"></textarea>' +
    '<button id="ys-chatClearBtn">クリア</button>' +
    "</div>" +
    "</div>" +
    "</div>";

  // ★ 字幕プリロード完了を待たず、ボタンは押せる状態にする。
  // 旧実装では disableAllButtons() で全ボタンを disabled にしていたが、
  // preloadTranscript() の TRANSCRIPT_READY/FAILED が何らかの理由で
  // 発火しないとボタンが永久に押せず、A→B の切替も効かない状態になっていた。
  // AI 実行 (callAI) 内で transcript を改めて取得するため、ボタン無効化は不要。
  const btnSummary = getEl("#ys-btn-summary");
  if (btnSummary) btnSummary.textContent = "⏳ 字幕取得中...";

  // 配置（非同期：#secondary が現れるまで待ってから配置）
  // テーマ・フォントサイズは「配置完了後」に適用する
  // （applyTheme/applyFontSize が document.querySelector で要素を探すため、
  //   挿入前に呼ぶと null になり適用されないバグを修正）
  placePanel(S.panelEl).then(function () {
    applyTheme();
    applyFontSize();
    applyPanelHeight();
  });

  return S.panelEl;
}