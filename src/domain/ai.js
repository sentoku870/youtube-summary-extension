// ============================================================
//  ai.js — AI呼び出しオーケストレーター（ESM版）
//  Phase C-2: 役割を分割。
//    ai-finalize.js … 結果確定と永続化
//    ai-errors.js   … 例外分類とUI通知
//  本モジュールは callAI（オーケストレーション）と
//  API 設定解決 / ストリーム中断 / 単一チャンク処理を担当する。
//  Port/Adapter パターンでUI層への結合を抽象化。
// ============================================================
import { getAvailableTokens, estimateTokens, splitIntoChunks } from "../shared/utils.js";
import { callChatAPIStream } from "./api.js";
import { uiState, sessionState } from "../shared/state.js";
import { setMarkdown } from "./markdown.js";
import { processMapReduce } from "./ai-map-reduce.js";
import {
  loadBtnApiConfigId,
  loadApiConfigById,
  loadApiConfigs,
  loadCustomPrompt,
  getDefaultPrompt
} from "../infrastructure/storage-config.js";
import { fetchTranscript } from "./transcript.js";
import {
  formatTranscriptWithTimestamps,
  buildMetaContext,
  createTimeoutPromise,
  linkTimestamps
} from "./ai-utils.js";
import { getUiAdapter } from "./ports.js";
import { finalizeResult } from "./ai-finalize.js";
import { handleAiErrors } from "./ai-errors.js";
import { createRafThrottle } from "../shared/raf-throttle.js";

// ストリーミング描画のスロットル間隔。
// チャット (chat.js) と同じ 60ms。連続チャンクを 1 フレームにまとめ、
// marked + DOMPurify + linkTimestamps の O(n²) 再描画による
// 残像/ちらつきを抑える。
const STREAM_THROTTLE_MS = 60;

function UI() {
  return getUiAdapter();
}

// ===== API設定解決 =====
export async function resolveApiConfig(mode) {
  const configId = await loadBtnApiConfigId(mode);
  if (configId) {
    const config = await loadApiConfigById(configId);
    if (config && config.apiKey) return config;
  }
  const allConfigs = await loadApiConfigs();
  for (let i = 0; i < allConfigs.length; i++) {
    if (allConfigs[i].apiKey) return allConfigs[i];
  }
  return null;
}

// ===== 実行中のストリームを中断 =====
export function abortCurrentStream() {
  if (sessionState.abortController) {
    sessionState.abortController.abort();
    sessionState.abortController = null;
  }
}

// ===== エラー表示（DI経由でUIにエラー表示） =====
export function showError(msg) {
  UI().showError(msg);
}

// ===== 字幕テキストのフォーマット解決（純粋関数） =====
export function resolveTranscriptText(transcript) {
  if (!transcript) return "";
  if (transcript.allTimestamps && transcript.allTimestamps.length > 0) {
    return formatTranscriptWithTimestamps(transcript.allTimestamps);
  }
  return (transcript.all || []).join("\n");
}

// ===== API設定とプロンプトの解決 =====
export async function fetchConfigAndPrompt(mode) {
  const [config, customPrompt] = await Promise.all([
    resolveApiConfig(mode),
    loadCustomPrompt(mode)
  ]);
  if (!config || !config.apiKey) return null;
  const prompt = customPrompt || getDefaultPrompt(mode);
  return { config: config, prompt: prompt };
}

// ===== 単一ストリーム要約（トークン収まる場合） =====
// チャンク到着ごと setMarkdown を呼ぶと、長文で marked + DOMPurify + innerHTML
// 再構築が O(n²) 化するため、createRafThrottle で 1 フレームに 1 回まで間引く。
// 完了時 flush() を呼んで保留中の最終描画を必ず反映する。
async function processSingleStream(messages, config, signal, summaryTextEl, timeoutPromise) {
  let accumulated = "";
  const renderThrottled = createRafThrottle(function (text) {
    if (summaryTextEl) setMarkdown(summaryTextEl, text || "");
  }, STREAM_THROTTLE_MS);
  try {
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
          // アンカーへ置換する。旧 finalizeResult での setSummaryContent
          // 二度描きを廃止したため、ここで linkTimestamps を直接呼ぶ。
          if (summaryTextEl) linkTimestamps(summaryTextEl);
        },
        signal
      ),
      timeoutPromise.promise
    ]);
  } catch (e) {
    // エラー/中断時も保留中の描画を破棄して空フラッシュする
    renderThrottled.flush("");
    throw e;
  }
  return accumulated;
}

// ===== AI呼び出し（オーケストレーション） =====
// 戻り値: true=成功, false=失敗または中断
//
// 構造:
//   callAI(mode, useAbort)
//     ├─ prepareContext(mode)  // 字幕取得・config/prompt 解決
//     ├─ runSummary(ctx, signal)  // 単一 / Map-Reduce 振り分け
//     ├─ finalizeResult(...)  // 結果確定と永続化（ai-finalize.js）
//     └─ handleAiErrors(e)    // 例外分類（ai-errors.js）
export async function callAI(mode, useAbort) {
  const tab = uiState.tabs[mode];
  if (!tab) return false;

  if (useAbort) abortCurrentStream();

  const ui = UI();
  ui.hideError();
  ui.clearSummaryContent();
  ui.hideProgress();
  const summaryTextEl = ui.getSummaryTextEl();

  let controller = null;
  try {
    // 1. コンテキスト準備（字幕取得・config/prompt 解決）
    const ctx = await prepareContext(mode);
    if (!ctx) return false; // 準備段階でユーザー向けエラー表示済み

    // 2. AbortController 設定
    sessionState.abortController = new AbortController();
    controller = sessionState.abortController;
    const signal = controller.signal;

    // 3. 単一 or Map-Reduce を振り分け
    const { accumulated, userMessage } = await runSummary(ctx, controller, signal, summaryTextEl);
    if (accumulated === null) return false; // Map-Reduce 全チャンク失敗

    // 4. 結果確定
    finalizeResult(mode, tab, accumulated, ctx.config, ctx.prompt, userMessage, ctx.transcript);
    return true;
  } catch (e) {
    return handleAiErrors(e, controller);
  } finally {
    // C-1: 成功/失敗/中断/早期 return いずれの場合も必ず release。
    // sessionState.abortController に「今回作った controller」が入っている時のみ
    // クリア（他経路で既に置き換えられている可能性に備える）。
    if (controller && sessionState.abortController === controller) {
      sessionState.abortController = null;
    }
  }
}

// ===== コンテキスト準備 =====
// 戻り値: { transcript, transcriptText, config, prompt, metaContext } または null
async function prepareContext(mode) {
  const ui = UI();
  const timeout = createTimeoutPromise();

  // 字幕取得（プリロード優先、なければ取得）
  let transcript = sessionState.preloadedTranscript;
  if (!transcript) {
    const fetcher = fetchTranscript();
    transcript = await Promise.race([fetcher, timeout.promise]);
  }
  // 取得経路のタイムアウト promise は不要になったので解放
  timeout.cancel();
  if (!transcript || !transcript.all || transcript.all.length === 0) {
    showError("字幕が見つかりませんでした。");
    ui.hideProgress();
    return null;
  }

  // メタ情報・字幕テキストを session 状態に保存
  sessionState.videoMeta = transcript.meta || null;
  const transcriptText = resolveTranscriptText(transcript);
  sessionState.transcriptText = transcriptText;

  // API 設定＋プロンプト解決
  const resolved = await fetchConfigAndPrompt(mode);
  if (!resolved) {
    showError("API設定がされていません。オプション画面で設定してください。");
    ui.hideProgress();
    return null;
  }
  const { config, prompt } = resolved;

  return {
    transcript: transcript,
    transcriptText: transcriptText,
    config: config,
    prompt: prompt,
    metaContext: buildMetaContext(sessionState.videoMeta)
  };
}

// ===== 要約実行（単一 or Map-Reduce 振り分け） =====
// 戻り値: { accumulated, userMessage }
//   accumulated === null は Map-Reduce 全チャンク失敗（呼び元でハンドリング）
//   controller: 外部から渡される AbortController。タイムアウト時に abort() を呼んで
//               worker 内の API コールを停止させるために必要。
async function runSummary(ctx, controller, signal, summaryTextEl) {
  const ui = UI();
  const { transcriptText, config, prompt, metaContext } = ctx;
  // 出力予約分（max_tokens）も考慮して入力に使える上限を計算
  const availableTokens = getAvailableTokens(transcriptText, config.apiModel, config.maxTokens);
  const estimatedTokens = estimateTokens(transcriptText);

  const baseUser = metaContext + "以下のYouTube動画の字幕を処理してください:\n\n" + transcriptText;

  if (estimatedTokens <= availableTokens) {
    // --- 単一ストリーム処理 ---
    const messages = [
      { role: "system", content: prompt },
      { role: "user", content: baseUser }
    ];
    // processSingleStream は signal を見て中断を内部処理する
    const timeout = createTimeoutPromise();
    let accumulated;
    try {
      accumulated = await processSingleStream(messages, config, signal, summaryTextEl, timeout);
    } finally {
      timeout.cancel();
    }
    return { accumulated: accumulated, userMessage: baseUser };
  }

  // T2-A3: チャンク分割結果が 1 個なら Map-Reduce を起動せず単一ストリームで処理。
  // Map-Reduce は「分割→並列→統合」の 3 段で API コール数が チャンク+1 になるため、
  // チャンク 1 個なら単一ストリームのほうが API コール・待ち時間ともに有利。
  const chunks = splitIntoChunks(transcriptText, availableTokens);
  if (chunks.length <= 1) {
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
  return { accumulated: accumulated === undefined ? null : accumulated, userMessage: baseUser };
}

// ai-finalize.js からの再エクスポート（テスト互換用）
export { finalizeResult };
