// ============================================================
//  panel-template.js — パネル骨格の静的 HTML テンプレート
//  AGENTS.md: すべてコンパイル時リテラル（変数補間なし）で XSS 安全。
//  Phase 3-3: panel.js の createPanel から innerHTML 文字列を分離し、
//  レビューの対象範囲を 25 行 → 5 行に縮める。
// ============================================================

/**
 * パネル骨格の HTML 文字列。
 * `#ys-btn-summary` / `#ys-btn-customA` / `#ys-btn-customB` /
 * `#ys-panel` / `#ys-content-area` / `#ys-summaryText` /
 * `#ys-progress` / `#ys-infoRow` / `#ys-infoLabel` / `#ys-copyBtn` /
 * `#ys-regenBtn` / `#ys-chatHistory` / `#ys-chatArea` /
 * `#ys-chatInput` / `#ys-chatClearBtn` などの id を含む。
 * AGENTS.md の innerHTML ルール: 静的・手書き UI のみ可、ユーザー入力は
 * textContent / createElement 経由で挿入する。
 */
export const PANEL_HTML =
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
