// ============================================================
//  markdown-render.js — UI 層の Markdown 描画ヘルパ
//  domain/markdown.js の renderMarkdown() を使い、DOM 要素に
//  安全な HTML フラグメントを挿入する。
//
//  AGENTS.md: domain 層は DOM を直接触らない（Port/Adapter）。
//  setMarkdown / linkTimestamps のような DOM 依存 API は
//  content/ui/ 配下に置く。
// ============================================================

import { renderMarkdown } from "../../domain/markdown.js";

/**
 * 要素に Markdown テキストを描画する。
 * 既存の whiteSpace を保存 → 通常に切り替え → クリア → 描画 → 復元。
 * 例外発生時も finally で必ず復元する。
 *
 * @param {Element} el - 描画対象要素（null/undefined なら no-op）
 * @param {string} text - Markdown テキスト
 */
export function setMarkdown(el, text) {
  if (!el) return;
  const origWhiteSpace = el.style.whiteSpace;
  el.style.whiteSpace = "normal";
  try {
    el.innerHTML = "";
    el.appendChild(renderMarkdown(text));
  } finally {
    el.style.whiteSpace = origWhiteSpace;
  }
}
