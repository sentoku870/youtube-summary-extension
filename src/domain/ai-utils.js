// ============================================================
//  ai-utils.js — AI関連の純粋関数（テスト可能・副作用なし）
//  Phase D-1: ai.js から純粋関数を分離
// ============================================================
import { YsTimeoutError } from "../infrastructure/errors.js";
import {
  GLOBAL_TIMEOUT_MS,
  TIMESTAMP_DELEGATION_FLAG,
  TS_LINK_CLASS
} from "../shared/constants.js";

// ===== 字幕テキストをタイムスタンプ付きフォーマットに変換 =====
export function formatTranscriptWithTimestamps(transcriptItems) {
  if (!transcriptItems || transcriptItems.length === 0) return "";
  return transcriptItems
    .map(function (item) {
      var text = item.text || item || "";
      if (item.offset != null) {
        var ms = item.offset;
        var totalSec = Math.floor(ms / 1000);
        var min = Math.floor(totalSec / 60);
        var sec = totalSec % 60;
        var ts =
          "[" + min.toString().padStart(2, "0") + ":" + sec.toString().padStart(2, "0") + "] ";
        return ts + text;
      }
      return text;
    })
    .join("\n");
}

// ===== テキストノード内の[MM:SS]をYouTubeシークリンクに変換（DOMベース） =====
// イベント委譲パターン: 各アンカーに個別リスナーを付けず、
// 親要素(el)で1つのリスナーを共有する（リスナー数削減・重複登録防止）。
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
      var tsMatch = part.match(/\[(\d{2}):(\d{2})\]/);
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

// ===== メタ情報からコンテキスト文字列を生成 =====
export function buildMetaContext(meta) {
  if (!meta) return "";
  var parts = [];
  parts.push("📋 動画情報");
  parts.push("━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  if (meta.title) parts.push("タイトル: " + meta.title);
  if (meta.author) parts.push("チャンネル: " + meta.author);
  if (meta.shortDescription) {
    var desc =
      meta.shortDescription.length > 200
        ? meta.shortDescription.substring(0, 200) + "..."
        : meta.shortDescription;
    parts.push("説明: " + desc);
  }
  if (meta.viewCount) parts.push("視聴回数: " + Number(meta.viewCount).toLocaleString());
  if (meta.lengthSeconds) {
    var totalSec = parseInt(meta.lengthSeconds, 10);
    var min = Math.floor(totalSec / 60);
    var sec = totalSec % 60;
    parts.push("再生時間: " + min + "分" + (sec > 0 ? sec + "秒" : ""));
  }
  if (meta.keywords) parts.push("タグ: " + meta.keywords);
  parts.push("━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
  return parts.join("\n");
}

// ===== 全体タイムアウトPromise =====
export function createTimeoutPromise() {
  return new Promise(function (_, reject) {
    setTimeout(function () {
      reject(
        new YsTimeoutError("処理がタイムアウトしました（" + GLOBAL_TIMEOUT_MS / 1000 + "秒）。")
      );
    }, GLOBAL_TIMEOUT_MS);
  });
}
