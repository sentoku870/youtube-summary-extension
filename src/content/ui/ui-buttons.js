// ============================================================
//  ui-buttons.js — ヘッダ・アクションボタンの表示制御（ESM版）
//  Phase B-1: ui.js から分割。再生成・コピー・チャット入力欄の制御を集約。
// ============================================================
import { getEl } from "./panel.js";

// ===== 再生成ボタン =====
export function disableRegenButton() {
  const btn = getEl("#ys-regenBtn");
  if (btn) btn.disabled = true;
}

export function enableRegenButton() {
  const btn = getEl("#ys-regenBtn");
  if (btn) btn.disabled = false;
}

export function showRegenButton() {
  const btn = getEl("#ys-regenBtn");
  if (btn) btn.style.display = "inline-block";
}

export function hideRegenButton() {
  const btn = getEl("#ys-regenBtn");
  if (btn) btn.style.display = "none";
}

// ===== コピーボタン =====
export function showCopyButton() {
  const btn = getEl("#ys-copyBtn");
  if (btn) btn.style.display = "inline-block";
}

export function hideCopyButton() {
  const btn = getEl("#ys-copyBtn");
  if (btn) btn.style.display = "none";
}

// ===== チャット入力欄 =====
export function focusChatInput() {
  const el = getEl("#ys-chatInput");
  if (el) {
    el.value = "";
    el.style.height = "auto";
    el.focus();
  }
}