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
 * @param {Promise} timeoutPromise
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
  await Promise.race([Promise.allSettled(workers), timeoutPromise]);

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
  await Promise.race([
    callChatAPIStream(
      finalMessages,
      config,
      function (chunk) {
        accumulated = chunk;
        if (summaryTextEl) setMarkdown(summaryTextEl, accumulated);
      },
      function (fullText) {
        accumulated = fullText || accumulated;
      },
      signal
    ),
    timeoutPromise
  ]);
  return accumulated;
}
