// ============================================================
//  ai-map-reduce.js — Map-Reduce によるチャンク並列処理＋統合
//  processMapReduce: チャンクを並列に要約し、最後に1つに統合する。
//  MAX_CONCURRENCY 個のワーカーで並列実行、AbortSignal で中断可能。
// ============================================================
import { callChatAPIStream } from "./api.js";
import { setMarkdown } from "./markdown.js";
import { MAX_CONCURRENCY, CHUNK_MAX_ATTEMPTS } from "../shared/constants.js";
import { getUiAdapter } from "./ports.js";
import { processSingleChunk } from "./ai-chunk.js";
import { createRafThrottle } from "../shared/raf-throttle.js";
import { linkTimestamps } from "./ai-utils.js";

// ストリーミング描画のスロットル間隔。ai.js と揃える。
const STREAM_THROTTLE_MS = 60;

const CHUNK_WORKER_PROMPT_SUFFIX = "\n\nこれは動画の一部分です。";

const FINAL_MERGE_PROMPT =
  "あなたはYouTube動画の複数のチャンク要約を統合するアシスタントです。" +
  "各チャンクの内容を踏まえ、動画全体として一貫性のある要約を日本語で箇条書きで作成してください。";

const FINAL_MERGE_INSTRUCTION =
  "以下はYouTube動画の各チャンクの要約結果です。" +
  "これらを統合して、動画全体の一貫した要約を作成してください。" +
  "情報の重複を避け、論理的な流れで整理してください:\n\n";

/**
 * 並列にチャンクを要約し、最後にマージして1つの要約を返す
 * @param {string[]} chunks
 * @param {Object} config
 * @param {AbortSignal} signal
 * @param {string} prompt
 * @param {{promise: Promise, cancel: Function}} timeoutPromise - createTimeoutPromise() の戻り値
 * @param {Element} [summaryTextEl]
 * @returns {Promise<string|null>} 統合された要約 or 全チャンク失敗時 null
 */
export async function processMapReduce(
  chunks,
  config,
  signal,
  prompt,
  timeoutPromise,
  summaryTextEl
) {
  const ui = getUiAdapter();
  const results = new Array(chunks.length).fill(null);
  let successCount = 0;

  let nextIdx = 0;

  // 並列ワーカー
  async function worker() {
    let idx;
    while ((idx = nextIdx++) < chunks.length && !signal.aborted) {
      const chunkMessage =
        "以下の字幕（チャンク " +
        (idx + 1) +
        "/" +
        chunks.length +
        "）を要約してください:\n\n" +
        chunks[idx];
      const chunkMessages = [
        { role: "system", content: prompt + CHUNK_WORKER_PROMPT_SUFFIX },
        { role: "user", content: chunkMessage }
      ];
      const outcome = await processSingleChunk(
        chunkMessages,
        config,
        signal,
        idx,
        chunks.length,
        CHUNK_MAX_ATTEMPTS
      );
      if (outcome.success) {
        results[idx] = outcome.result;
        successCount++;
      }
    }
  }

  const workers = [];
  const numWorkers = Math.min(MAX_CONCURRENCY, chunks.length);
  for (let i = 0; i < numWorkers; i++) {
    workers.push(worker());
  }
  // タイムアウト発火時に processMapReduce の引数で受け取った signal
  // (呼び元 ai.js の sessionState.abortController.signal) は
  // 外部からのみ abort 可能。processSingleChunk → callChatAPINonStream
  // には同じ signal が伝わるため、processSingleChunk 内の YsAbortError/
  // YsTimeoutError 判定 (A4 で追加) で worker が即時停止する。
  // ここではタイムアウト例外を呼び元 (ai.js) に確実に伝播させる役割を担う。
  const timeoutP = timeoutPromise && timeoutPromise.promise;
  if (timeoutP) {
    await Promise.race([Promise.allSettled(workers), timeoutP]).catch(function (e) {
      // signal.aborted を経由して worker 側にも中断が伝播したあとに
      // ここに来る。例外を上位に伝播させる。
      throw e;
    });
  } else {
    await Promise.allSettled(workers);
  }

  if (signal.aborted) {
    throw new DOMException("AbortError", "AbortError");
  }

  // 成功した結果を抽出
  const chunkSummaries = results.filter(function (r) {
    return r !== null;
  });
  if (chunkSummaries.length === 0) {
    ui.showError("すべてのチャンクの処理に失敗しました。");
    return null;
  }

  // チャンク要約は得られているが、タイムアウト/中断で merge には進めない
  if (signal.aborted) {
    throw new DOMException("AbortError", "AbortError");
  }

  // マージ用プロンプト構築
  const combinedSummaries = chunkSummaries
    .map(function (s, idx) {
      return "=== チャンク " + (idx + 1) + " ===\n" + s;
    })
    .join("\n\n");

  ui.showProgress("🔄 " + successCount + "/" + chunks.length + "チャンクの要約を統合中...");

  // 統合リクエスト
  const finalMessages = [
    { role: "system", content: FINAL_MERGE_PROMPT },
    { role: "user", content: FINAL_MERGE_INSTRUCTION + combinedSummaries }
  ];

  let accumulated = "";
  // 単一ストリームと同じくスロットル。長い統合結果で DOM が
  // O(n²) 再構築にならないようにする。
  const renderThrottled = createRafThrottle(function (text) {
    if (summaryTextEl) setMarkdown(summaryTextEl, text || "");
  }, STREAM_THROTTLE_MS);
  try {
    const raceArgs = [
      callChatAPIStream(
        finalMessages,
        config,
        function (chunk) {
          accumulated = chunk;
          renderThrottled(accumulated);
        },
        function (fullText) {
          accumulated = fullText || accumulated;
          renderThrottled.flush(accumulated);
          // T3-S1: 最終確定時にタイムスタンプをアンカー化する。
          // finalizeResult 側の setSummaryContent 二度描きを廃止したため
          // こちらで担当する。
          if (summaryTextEl) linkTimestamps(summaryTextEl);
        },
        signal
      )
    ];
    if (timeoutP) raceArgs.push(timeoutP);
    await Promise.race(raceArgs);
  } catch (e) {
    renderThrottled.flush("");
    throw e;
  }
  if (signal.aborted) {
    throw new DOMException("AbortError", "AbortError");
  }
  return accumulated;
}
