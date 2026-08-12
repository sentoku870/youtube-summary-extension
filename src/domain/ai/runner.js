// ============================================================
//  ai/runner.js — 単一ストリーム要約（既定）+ Map-Reduce フォールバック
//  既定: 単一ストリームで要約を試み、コンテキスト上限超過時は showError で停止。
//  詳細設定の enableChunking=true のときだけ従来 Map-Reduce 経路を使う。
//  Phase 2-D: STREAM_THROTTLE_MS と createRafThrottle はここに集約。
// ============================================================
import { callChatAPIStream } from "../api.js";
import { getAvailableTokens, estimateTokens, splitIntoChunks } from "../../shared/utils.js";
import { createRafThrottle } from "../../shared/raf-throttle.js";
import { getUiAdapter } from "../ports.js";
import { createTimeoutPromise } from "../ai-utils.js";
import { processMapReduce } from "../ai-map-reduce.js";
import { loadEnableChunking } from "../../infrastructure/storage-config.js";

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
 * 単一チャンクで収まる場合、または enableChunking=false 時の標準経路として使用。
 * processSingleStream は signal を見て中断を内部処理する。
 * controller を渡された場合、タイムアウト発火時に abort() を呼び
 * HTTP 接続リークを防ぐ。
 */
export async function runSingleStream(config, prompt, baseUser, signal, summaryTextEl, controller) {
  const messages = [
    { role: "system", content: prompt },
    { role: "user", content: baseUser }
  ];
  const timeout = createTimeoutPromise();
  // タイムアウト発火時に controller を abort() して裏の fetch を停止する。
  // Map-Reduce 経路と同じ安全策を単一ストリームにも適用。
  const timeoutP = timeout.promise.catch(function (e) {
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
    accumulated = await processSingleStream(messages, config, signal, summaryTextEl, {
      promise: timeoutP,
      cancel: timeout.cancel.bind(timeout)
    });
  } finally {
    timeout.cancel();
  }
  return accumulated;
}

/**
 * コンテキスト上限超過時のユーザー向けメッセージを組み立てる。
 */
function buildOverflowMessage(config, estimatedTokens, availableTokens) {
  const model = (config && config.apiModel) || "(unknown)";
  return (
    "字幕が長すぎるため要約できません。" +
    "モデル: " +
    model +
    "（推定 " +
    estimatedTokens +
    " トークン / 上限 " +
    availableTokens +
    " トークン）" +
    "オプション画面で maxTokens を減らすか、contextWindow の大きなモデルをご利用ください。"
  );
}

/**
 * 要約実行（単一経路 / Map-Reduce フォールバック振り分け）
 * 既定 (enableChunking=false): 単一ストリームで要約を試みる。
 *   字幕が availableTokens を超える場合は showError + { accumulated: null }。
 *   呼び元で accumulated===null を判定して false を返す。
 * フォールバック (enableChunking=true): 字幕を splitIntoChunks で分割し、
 *   processMapReduce で並列→統合する。
 *
 * @param {object} ctx - { transcriptText, config, prompt, metaContext }
 * @param {object} controller
 * @param {AbortSignal} signal
 * @param {Element} summaryTextEl
 * @returns {Promise<{accumulated: string|null, userMessage: string}>}
 *   accumulated === null は「上限超過で中断」または「Map-Reduce 全チャンク失敗」
 */
export async function runSummary(ctx, controller, signal, summaryTextEl) {
  const ui = UI();
  const { transcriptText, config, prompt, metaContext } = ctx;
  const baseUser = metaContext + "以下のYouTube動画の字幕を処理してください:\n\n" + transcriptText;

  // 出力予約分（max_tokens）も考慮して入力に使える上限を計算
  const availableTokens = getAvailableTokens(transcriptText, config.apiModel, config.maxTokens);
  const estimatedTokens = estimateTokens(transcriptText);

  // ----- 詳細設定: enableChunking の値を解決 -----
  const enableChunking = await loadEnableChunking();

  // ===== 単一経路（既定）=====
  if (!enableChunking) {
    if (estimatedTokens > availableTokens) {
      // モデル性能向上に伴い分割は廃止。上限超過は明示エラーで停止。
      ui.hideProgress();
      ui.showError(buildOverflowMessage(config, estimatedTokens, availableTokens));
      return { accumulated: null, userMessage: baseUser };
    }
    const accumulated = await runSingleStream(
      config,
      prompt,
      baseUser,
      signal,
      summaryTextEl,
      controller
    );
    return { accumulated: accumulated, userMessage: baseUser };
  }

  // ===== Map-Reduce 経路（フォールバック）=====
  // 単一チャンクで収まる、または分割後に 1 チャンクのみになる場合は単一ストリームで処理。
  // T2-A3: Map-Reduce は「分割→並列→統合」の 3 段で API コール数が チャンク+1 になるため、
  // チャンク 1 個なら単一ストリームのほうが API コール・待ち時間ともに有利。
  const chunks =
    estimatedTokens <= availableTokens
      ? [transcriptText]
      : splitIntoChunks(transcriptText, availableTokens);
  if (chunks.length <= 1) {
    const accumulated = await runSingleStream(
      config,
      prompt,
      baseUser,
      signal,
      summaryTextEl,
      controller
    );
    return { accumulated: accumulated, userMessage: baseUser };
  }

  ui.showProgress("チャンク処理を開始...");
  const workerTimeout = createTimeoutPromise();
  // タイムアウト発火時に controller を abort() して worker / merge を停止する。
  // worker 内の processSingleChunk → callChatAPINonStream は同じ signal を
  // 受け取っているため、abort された瞬間に次の API コールは即座に中断される。
  const workerTimeoutAbort = workerTimeout.promise.catch(function (e) {
    if (controller && !controller.signal.aborted) {
      try {
        controller.abort("timeout");
      } catch {
        /* ignore */
      }
    }
    throw e;
  });
  // merge 段階では独立したタイムアウトを使う。workerTimeout は worker 終了時点で
  // 既に settle 済みのため、merge に流用すると制限時間内に merge を停止できない。
  const mergeTimeout = createTimeoutPromise();
  const mergeTimeoutAbort = mergeTimeout.promise.catch(function (e) {
    if (controller && !controller.signal.aborted) {
      try {
        controller.abort("merge-timeout");
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
      { promise: workerTimeoutAbort, cancel: workerTimeout.cancel.bind(workerTimeout) },
      summaryTextEl,
      { promise: mergeTimeoutAbort, cancel: mergeTimeout.cancel.bind(mergeTimeout) }
    );
  } finally {
    workerTimeout.cancel();
    mergeTimeout.cancel();
  }
  ui.hideProgress();
  return {
    accumulated: accumulated === undefined ? null : accumulated,
    userMessage: baseUser
  };
}
