// ============================================================
//  ai-utils.js — AI関連の純粋関数（テスト可能・副作用なし）
//  Phase D-1: ai.js から純粋関数を分離
//  Phase 2-A: linkTimestamps は DOM 依存のため src/content/ui/timestamp-link.js へ移動。
// ============================================================
import { YsTimeoutError } from "../infrastructure/errors.js";
import { GLOBAL_TIMEOUT_MS } from "../shared/constants.js";

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
// 戻り値: { promise, cancel }
//   - promise: 一定時間後に YsTimeoutError で reject する Promise
//   - cancel(): タイマーを解除し、promise を永遠に pending 状態にする。
//     finally ブロックで必ず呼ぶこと（呼ばないと 180 秒後に
//     Unhandled Rejection として記録される）。
export function createTimeoutPromise() {
  let timeoutId = null;
  const promise = new Promise(function (_, reject) {
    timeoutId = setTimeout(function () {
      reject(
        new YsTimeoutError("処理がタイムアウトしました（" + GLOBAL_TIMEOUT_MS / 1000 + "秒）。")
      );
    }, GLOBAL_TIMEOUT_MS);
  });
  return {
    promise: promise,
    cancel: function () {
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
    }
  };
}
