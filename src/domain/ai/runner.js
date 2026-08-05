// ============================================================
//  ai/runner.js — 単一ストリーム / Map-Reduce 実行ラッパー
//  ai.js からストリーミング実行ロジックを分離。
//  Phase 2-D: STREAM_THROTTLE_MS と createRafThrottle はここに集約。
// ============================================================
import { callChatAPIStream } from "../api.js";
import { getAvailableTokens, estimateTokens, splitIntoChunks } from "../../shared/utils.js";
import { createRafThrottle } from "../../shared/raf-throttle.js";
import { getUiAdapter } from "../ports.js";
import { createTimeoutPromise } from "../ai-utils.js";
import { processMapReduce } from "../ai-map-reduce.js";

// ストリーミング描画のスロットル間隔。
// チャット (chat.js) と同じ 60ms。連続チャンクを 1 フレームにまとめ、
// marked + DOMPurify + linkTimestamps の O(n²) 再描画による
// 残像/ちらつきを抑える。
export const STREAM_THROTTLE_MS = 60;

function UI() {
  return getUiAdapter();
}

/**
 * 単一ストリーム要約（トークン収まる場合）
 * チャンク到着ごと renderSummaryChunk を呼ぶと、長文で marked + DOMPurify + innerHTML
 * 再構築が O(n²) 化するため、createRafThrottle で 1 フレームに 1 回まで間引く。
 * 完了時 flush() を呼んで保留中の最終描画を必ず反映する。
 */
export async function processSingleStream(messages, config, signal, summaryTextEl, timeoutPromise) {
  let accumulated = "";
  const ui = UI();
  const renderThrottled = createRafThrottle(function (text) {
    if (summaryTextEl) ui.renderSummaryChunk(text || "");
  }, STREAM_THROTTLE_MS);
  // N-2: abort 時も DOM を空フラッシュしない（旧実装では catch 内で
  // renderThrottled.flush("") を呼んでいた）。新 stream の初チャンクで
  // 上書きされるまで旧内容を保持し、ユーザーの「回答が消えた」感覚を解消。
  // API エラー時のクリアは handleAiErrors() 側の責務。
  await Promise.race([
    callChatAPIStream(
      messages,
      config,
      function (chunk) {
        accumulated = chunk;
        renderThrottled(accumulated);
      },
      function (fullText) {
        accumulated = fullText || accumulated;
        // 完了時はスロットルを待たず即時1回確定描画する
        renderThrottled.flush(accumulated);
        // T3-S1: タイムスタンプリンクは最終確定時にだけ走らせる。
        // ストリーミング中は raw [MM:SS] のまま表示し、完了時に
        // アンカーへ置換する。
        if (summaryTextEl) ui.linkTimestampsIn();
      },
      signal
    ),
    timeoutPromise.promise
  ]);
  return accumulated;
}

/**
 * 単一ストリーム要約ヘルパー。
 * 単一チャンクで収まる場合と Map-Reduce 分割後にチャンクが 1 個になった場合の両方で使用。
 * processSingleStream は signal を見て中断を内部処理する。
 */
export async function runSingleStream(config, prompt, baseUser, signal, summaryTextEl) {
  const messages = [
    { role: "system", content: prompt },
    { role: "user", content: baseUser }
  ];
  const timeout = createTimeoutPromise();
  let accumulated;
  try {
    accumulated = await processSingleStream(messages, config, signal, summaryTextEl, timeout);
  } finally {
    timeout.cancel();
  }
  return accumulated;
}

/**
 * 要約実行（単一 or Map-Reduce 振り分け）
 * @param {object} ctx - { transcriptText, config, prompt, metaContext }
 * @param {object} controller
 * @param {AbortSignal} signal
 * @param {Element} summaryTextEl
 * @returns {Promise<{accumulated: string|null, userMessage: string}>}
 *   accumulated === null は Map-Reduce 全チャンク失敗（呼び元でハンドリング）
 */
export async function runSummary(ctx, controller, signal, summaryTextEl) {
  const ui = UI();
  const { transcriptText, config, prompt, metaContext } = ctx;
  // 出力予約分（max_tokens）も考慮して入力に使える上限を計算
  const availableTokens = getAvailableTokens(transcriptText, config.apiModel, config.maxTokens);
  const estimatedTokens = estimateTokens(transcriptText);

  const baseUser = metaContext + "以下のYouTube動画の字幕を処理してください:\n\n" + transcriptText;

  // 単一チャンクで収まる、または分割後に 1 チャンクのみになる場合は単一ストリームで処理。
  // T2-A3: Map-Reduce は「分割→並列→統合」の 3 段で API コール数が チャンク+1 になるため、
  // チャンク 1 個なら単一ストリームのほうが API コール・待ち時間ともに有利。
  const chunks =
    estimatedTokens <= availableTokens
      ? [transcriptText]
      : splitIntoChunks(transcriptText, availableTokens);
  if (chunks.length <= 1) {
    const accumulated = await runSingleStream(config, prompt, baseUser, signal, summaryTextEl);
    return { accumulated: accumulated, userMessage: baseUser };
  }

  // --- Map-Reduce処理 ---
  ui.showProgress("チャンク処理を開始...");
  const timeout = createTimeoutPromise();
  // タイムアウト発火時に controller を abort() して worker / merge を停止する。
  // worker 内の processSingleChunk → callChatAPINonStream は同じ signal を
  // 受け取っているため、abort された瞬間に次の API コールは即座に中断される。
  const timeoutAbort = timeout.promise.catch(function (e) {
    if (controller && !controller.signal.aborted) {
      try {
        controller.abort("timeout");
      } catch {
        /* ignore */
      }
    }
    throw e;
  });
  let accumulated;
  try {
    accumulated = await processMapReduce(
      chunks,
      config,
      signal,
      prompt,
      { promise: timeoutAbort, cancel: timeout.cancel.bind(timeout) },
      summaryTextEl
    );
  } finally {
    timeout.cancel();
  }
  ui.hideProgress();
  return {
    accumulated: accumulated === undefined ? null : accumulated,
    userMessage: baseUser
  };
}
