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

// ステータスメッセージを表示（成功: 2秒で自動消去 / 失敗: 表示継続）
export function showStatus(id, msg, isError) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = msg;
  el.style.color = isError ? "#d32f2f" : "#2d8c3c";
  if (!isError)
    setTimeout(function () {
      el.textContent = "";
    }, 2000);
}
