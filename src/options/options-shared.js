// ============================================================
//  options-shared.js — オプション画面共通の DOM ユーティリティ
//  タブ固有のファイルから共有利用。chrome.storage 等の永続化は扱わない。
// ============================================================

// 入力要素の値を取得（id で指定、要素が無ければ空文字）
export function getVal(id) {
  const el = document.getElementById(id);
  return el ? el.value : "";
}

// 入力要素に値を設定（null/undefined は空文字に正規化）
export function setVal(id, val) {
  const el = document.getElementById(id);
  if (el) el.value = val || "";
}

// DOM 要素生成ヘルパ。3 引数 (tag, className, text) 形式。
// text は textContent として設定 (XSS 安全)。
export function el(tag, className, text) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text != null) e.textContent = text;
  return e;
}
