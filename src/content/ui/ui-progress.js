// ============================================================
//  ui-progress.js — プログレス表示とエラー表示（ESM版）
//  Phase B-1: ui.js から分割。#ys-progress と #ys-error の表示制御を集約。
//  showError はオフライン判定と SUMMARY_RETRY_CLICKED イベント発行を担当。
// ============================================================
import { uiState as S } from "../../shared/state.js";
import { getEl } from "./panel.js";
import { emit, EVENTS } from "../../shared/event-bus.js";
import { createLogger } from "../../shared/logger.js";

const log = createLogger("ui-progress");

// ===== プログレス表示 =====
export function showProgress(text) {
  const el = getEl("#ys-progress");
  if (el) {
    el.style.display = "block";
    el.textContent = text;
  }
  log.log(text);
}

export function hideProgress() {
  const el = getEl("#ys-progress");
  if (el) el.style.display = "none";
}

// ===== エラー表示（ネットワーク状態検出付き） =====
// XSS 対策: msg は API からの外部入力（LLM / ネットワークエラー文言）を含むため、
// innerHTML への直接連結を行わず、textContent + createElement のみで DOM を構築する。
export function showError(msg) {
  const el = getEl("#ys-error");
  if (!el) return;
  el.replaceChildren();
  el.style.display = "block";

  if (!navigator.onLine) {
    const span = document.createElement("span");
    span.textContent = "🌐 オフラインです。インターネット接続を確認してください。";
    el.appendChild(span);
    return;
  }

  const span = document.createElement("span");
  span.textContent = String(msg || "");
  el.appendChild(span);

  const retryBtn = document.createElement("button");
  retryBtn.id = "ys-errorRetryBtn";
  retryBtn.className = "ys-action-btn";
  retryBtn.type = "button";
  retryBtn.style.marginLeft = "8px";
  retryBtn.textContent = "🔄 再試行";
  retryBtn.addEventListener("click", function () {
    el.style.display = "none";
    // A-3: ui.js → tabs.js の直接依存を event-bus 経由で代替し循環依存を解消。
    // event-bridge.js / tabs.js が SUMMARY_RETRY_CLICKED を購読して switchTab を起動する。
    emit(EVENTS.SUMMARY_RETRY_CLICKED, { activeTab: S.activeTab });
  });
  el.appendChild(retryBtn);
}

export function hideError() {
  const el = getEl("#ys-error");
  if (el) el.style.display = "none";
}
