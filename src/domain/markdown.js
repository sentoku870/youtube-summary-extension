// ============================================================
//  markdown.js — Markdown→HTML 変換（ESM版・marked + DOMPurify）
//  Phase 7-1: ESM化
// ============================================================

import { marked } from "marked";
import DOMPurify from "dompurify";
import { createLogger } from "../shared/logger.js";

const log = createLogger("markdown");

// ===== 許可タグのホワイトリスト（DOMPurifyフォールバック用） =====
export const ALLOWED_TAGS = [
  "b",
  "i",
  "s",
  "u",
  "br",
  "hr",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "pre",
  "code",
  "ul",
  "ol",
  "li",
  "table",
  "tr",
  "td",
  "th",
  "thead",
  "tbody",
  "strong",
  "em",
  "p",
  "div",
  "span",
  "a",
  "blockquote",
  "dl",
  "dt",
  "dd",
  "img",
  "caption",
  "col",
  "colgroup",
  "figure",
  "figcaption"
];
export const ALLOWED_ATTR = [
  "href",
  "target",
  "class",
  "id",
  "style",
  "colspan",
  "rowspan",
  "scope",
  "align",
  "src",
  "alt",
  "title"
];

// ===== marked のデフォルト設定 =====
marked.setOptions({
  gfm: true,
  breaks: false
});

// 文字列HTMLをDocumentFragmentに変換するヘルパー
function htmlToFragment(html) {
  const frag = document.createDocumentFragment();
  const temp = document.createElement("div");
  temp.innerHTML = html;
  while (temp.firstChild) {
    frag.appendChild(temp.firstChild);
  }
  return frag;
}

// DOMPurifyが利用可能なら使用、なければ独自サニタイズ
// 常に DocumentFragment を返す（テスト・renderMarkdown 両方の整合性のため）
export function sanitizeHTML(html) {
  if (typeof DOMPurify !== "undefined" && DOMPurify.sanitize) {
    const sanitizedHtml = DOMPurify.sanitize(html, {
      ALLOWED_TAGS: ALLOWED_TAGS,
      ALLOWED_ATTR: ALLOWED_ATTR,
      RETURN_DOM: false,
      RETURN_DOM_FRAGMENT: false
    });
    // DOMPurify は文字列を返すので DocumentFragment に変換
    return htmlToFragment(sanitizedHtml);
  }
  const doc = new DOMParser().parseFromString(html, "text/html");
  function walk(node) {
    if (node.nodeType === 3) return node.cloneNode(true);
    if (node.nodeType !== 1) return null;
    const tag = node.tagName.toLowerCase();
    if (ALLOWED_TAGS.indexOf(tag) === -1) {
      return document.createTextNode(node.textContent);
    }
    const clone = document.createElement(tag);
    for (const attr of node.attributes) {
      if (ALLOWED_ATTR.indexOf(attr.name) !== -1 && attr.name.indexOf("on") !== 0) {
        try {
          clone.setAttribute(attr.name, attr.value);
        } catch {
          // setAttribute が失敗する属性（例: 不正な name）は無視
        }
      }
    }
    for (let child = node.firstChild; child; child = child.nextSibling) {
      const cleaned = walk(child);
      if (cleaned) clone.appendChild(cleaned);
    }
    return clone;
  }
  const frag = document.createDocumentFragment();
  for (let child = doc.body.firstChild; child; child = child.nextSibling) {
    const c = walk(child);
    if (c) frag.appendChild(c);
  }
  return frag;
}

export function renderMarkdown(text) {
  if (!text) return document.createDocumentFragment();
  try {
    const rawHtml = marked.parse(text);
    const result = sanitizeHTML(rawHtml);
    // sanitizeHTML は常に DocumentFragment を返すよう統一されたため、そのまま返す
    return result;
  } catch (e) {
    log.error("Markdown parse error:", e);
    const frag = document.createDocumentFragment();
    frag.appendChild(document.createTextNode(text));
    return frag;
  }
}

export function setMarkdown(el, text) {
  if (!el) return;
  const origWhiteSpace = el.style.whiteSpace;
  el.style.whiteSpace = "normal";
  try {
    el.innerHTML = "";
    el.appendChild(renderMarkdown(text));
  } finally {
    // 例外発生時でも確実に元の whiteSpace へ復元
    el.style.whiteSpace = origWhiteSpace;
  }
}
