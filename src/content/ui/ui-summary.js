// ============================================================
//  ui-summary.js — 要約テキストと情報ラベル・チャットエリア（ESM版）
//  Phase B-1: ui.js から分割。#ys-summaryText / #ys-infoLabel / #ys-chatArea を担当。
//  要約描画は markdown + タイムスタンプリンク委譲を含む。
// ============================================================
import { getEl } from "./panel.js";
import { setMarkdown } from "../../domain/markdown.js";
import { linkTimestamps } from "../../domain/ai-utils.js";

// ===== 要約テキストエリア =====
export function setSummaryContent(content) {
  const el = getEl("#ys-summaryText");
  if (!el) return;
  setMarkdown(el, content);
  linkTimestamps(el);
}

export function clearSummaryContent() {
  const el = getEl("#ys-summaryText");
  if (el) el.textContent = "";
}

export function setSummaryRaw(text) {
  const el = getEl("#ys-summaryText");
  if (el) el.textContent = text;
}

// ===== 情報ラベル =====
export function updateInfoLabel(text) {
  const el = getEl("#ys-infoLabel");
  if (el) el.textContent = text;
}

// ===== チャットエリア =====
export function showChatArea() {
  const el = getEl("#ys-chatArea");
  if (el) el.style.display = "block";
}

export function hideChatArea() {
  const el = getEl("#ys-chatArea");
  if (el) el.style.display = "none";
}
