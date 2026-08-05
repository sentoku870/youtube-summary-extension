// ============================================================
//  timestamp-link.js — UI 層のタイムスタンプリンク化ヘルパ
//  domain/ai-utils.js の linkTimestamps() を移設。
//
//  AGENTS.md: domain 層は DOM を直接触らない（Port/Adapter）。
//  DOM 操作とイベント委譲登録は content/ui/ 配下に置く。
// ============================================================

import { TIMESTAMP_DELEGATION_FLAG, TS_LINK_CLASS } from "../../shared/constants.js";

const TS_PATTERN = /\[(\d{2}):(\d{2})\]/;

/**
 * 要素内のテキストノードに含まれる [MM:SS] 形式のタイムスタンプを
 * YouTube シークリンク（data-seek 属性を持つ <a>）に置換する。
 * イベント委譲パターン: 各アンカーに個別リスナーを付けず、
 * 親要素 (el) で 1 つの click リスナーを共有する。
 *
 * @param {Element} el - 走査対象要素（null/undefined なら no-op）
 */
export function linkTimestamps(el) {
  if (!el) return;

  // 委譲リスナーが未登録なら登録（重複防止フラグで管理）
  if (!el.dataset || !el.dataset[TIMESTAMP_DELEGATION_FLAG]) {
    el.addEventListener("click", function (e) {
      // クリック対象が（または祖先が）タイムスタンプリンクか判定
      var target = e.target;
      var anchor = target && target.closest ? target.closest("." + TS_LINK_CLASS) : null;
      if (!anchor) return;
      e.preventDefault();
      var sec = parseInt(anchor.getAttribute("data-seek"), 10);
      if (Number.isFinite(sec)) {
        var v = document.querySelector("video");
        if (v) v.currentTime = sec;
      }
    });
    if (el.dataset) el.dataset[TIMESTAMP_DELEGATION_FLAG] = "1";
  }

  var treeWalker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null, false);
  var nodesToReplace = [];
  while (treeWalker.nextNode()) {
    var node = treeWalker.currentNode;
    // 既にアンカー内にあるテキストはスキップ（二重処理防止）
    if (node.parentElement && node.parentElement.closest("." + TS_LINK_CLASS)) continue;
    if (node.textContent && /\[\d{2}:\d{2}\]/.test(node.textContent)) {
      nodesToReplace.push(node);
    }
  }
  for (var i = 0; i < nodesToReplace.length; i++) {
    var textNode = nodesToReplace[i];
    var parent = textNode.parentNode;
    if (!parent) continue;
    var text = textNode.textContent;
    var parts = text.split(/(\[\d{2}:\d{2}\])/);
    var fragment = document.createDocumentFragment();
    for (var j = 0; j < parts.length; j++) {
      var part = parts[j];
      var tsMatch = part.match(TS_PATTERN);
      if (tsMatch) {
        var seconds = parseInt(tsMatch[1], 10) * 60 + parseInt(tsMatch[2], 10);
        var anchor = document.createElement("a");
        anchor.className = TS_LINK_CLASS;
        anchor.setAttribute("data-seek", seconds);
        anchor.href = "#";
        anchor.textContent = tsMatch[0];
        // 個別リスナーは付けない（親の委譲リスナーで処理）
        fragment.appendChild(anchor);
      } else if (part) {
        fragment.appendChild(document.createTextNode(part));
      }
    }
    parent.replaceChild(fragment, textNode);
  }
}
