// ============================================================
//  options-buttons.js — ボタン・プロンプトタブ UI（オーケストレーション）
//  button-card.js に 3 カード描画 + 自動保存を委譲。
//  旧「すべて保存」ボタンは廃止（自動保存に移行）。
// ============================================================
import { initButtonCards, refreshButtonModelSelects, flushAllSaves } from "./button-card.js";

let isInitialized = false;

export function initButtonsTab() {
  if (isInitialized) return;
  isInitialized = true;
  initButtonCards();
}

export async function updateButtonModelSelects() {
  await refreshButtonModelSelects();
}

export async function flushButtonsSaves() {
  await flushAllSaves();
}
