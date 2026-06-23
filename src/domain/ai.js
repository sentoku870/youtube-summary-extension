// ============================================================
//  ai.js — AI呼び出し・Map-Reduce要約・エラー表示（ESM版）
//  callAI はオーケストレーションのみ、サブ関数に分割
//  Port/Adapter パターンでUI層への結合を抽象化
// ============================================================
import { YsAPIError, YsAbortError, YsTimeoutError } from "../infrastructure/errors.js";
import { getAvailableTokens, estimateTokens, splitIntoChunks } from "../shared/utils.js";
import { callChatAPIStream, callChatAPINonStream } from "./api.js";
import { MAX_CONCURRENCY, CHUNK_MAX_ATTEMPTS } from "../shared/constants.js";
import { uiState, sessionState } from "../shared/state.js";
import { setMarkdown } from "./markdown.js";
import {
  loadBtnApiConfigId,
  loadApiConfigById,
  loadApiConfigs,
  loadApiConfigLegacy,
  loadCustomPrompt,
  getDefaultPrompt,
  saveToStorage,
  saveSummaryCache
} from "../infrastructure/storage.js";
import { fetchTranscript } from "./transcript.js";

// ai-utils.js から純粋関数をインポート
import {
  formatTranscriptWithTimestamps,
  linkTimestamps,
  buildMetaContext,
  createTimeoutPromise
} from "./ai-utils.js";

// テスト後方互換用の再エクスポート
export { formatTranscriptWithTimestamps, linkTimestamps, buildMetaContext, createTimeoutPromise };

// ===== Port/Adapter パターン: UI表示IF =====
// ドメイン層は ports.js（抽象）にのみ依存し、
// content/ui 層が setUiAdapter() で実装を注入する。
import { getUiAdapter } from "./ports.js";

// 全関数は getUiAdapter() 経由でUI操作を行う
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

// ===== 要約結果のファイナライズ =====
export function finalizeResult(mode, tab, content, config, prompt, userMessage, transcript) {
  const ui = UI();
  tab.generated = true;
  tab.content = content;
  tab.config = config;
  tab.modelLabel = config.apiModel;
  tab.transcriptCount = transcript.all.length;
  tab.chatHistory = [
    { role: "system", content: prompt },
    { role: "user", content: userMessage },
    { role: "assistant", content: content }
  ];

  if (uiState.activeTab === mode) {
    ui.hideProgress();
    ui.setSummaryContent(content);
    ui.updateInfoLabel(
      "使用モデル: " + config.apiModel + " | 字幕 " + transcript.all.length + " 件"
    );
    ui.showChatArea();
    ui.focusChatInput();
    ui.showCopyButton();
    ui.showRegenButton();
  }
  ui.updateTabUI();
  sessionState.abortController = null;

  saveToStorage(content, transcript.all);
  try {
    const videoId =
      new URLSearchParams(window.location.search).get("v") ||
      window.location.pathname.match(/\/shorts\/([^/?]+)/)?.[1];
    if (videoId) {
      saveSummaryCache(videoId, {
        content: content,
        modelLabel: config.apiModel,
        transcriptCount: transcript.all.length
      });
    }
  } catch (e) {
    console.error("[YouTube 要約] Failed to save summary cache:", e);
  }
}

// ===== 字幕取得（プリロード優先、タイムアウト付き） =====
async function fetchTranscriptWithTimeout(timeoutPromise) {
  let transcript = sessionState.preloadedTranscript;
  if (!transcript) {
    const fetcher = fetchTranscript();
    transcript = await Promise.race([fetcher, timeoutPromise]);
  }
  return transcript;
}

// ===== 字幕テキストのフォーマット解決（純粋関数） =====
// 副作用なしで、字幕オブジェクトから LLM 投入用のテキストを返す。
export function resolveTranscriptText(transcript) {
  if (!transcript) return "";
  if (transcript.allTimestamps && transcript.allTimestamps.length > 0) {
    return formatTranscriptWithTimestamps(transcript.allTimestamps);
  }
  return (transcript.all || []).join("\n");
}

// ===== API設定とプロンプトの解決 =====
export async function fetchConfigAndPrompt(mode) {
  let config = await resolveApiConfig(mode);
  if (!config || !config.apiKey) {
    config = await loadApiConfigLegacy();
  }
  if (!config || !config.apiKey) return null;

  let prompt = await loadCustomPrompt(mode);
  if (!prompt) prompt = getDefaultPrompt(mode);
  return { config: config, prompt: prompt };
}

// ===== 単一ストリーム要約（トークン収まる場合） =====
async function processSingleStream(messages, config, signal, summaryTextEl, timeoutPromise) {
  let accumulated = "";
  await Promise.race([
    callChatAPIStream(
      messages,
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

// ===== 1チャンクの処理（リトライ付き） =====
async function processSingleChunk(chunkMessages, config, signal, idx, total, maxAttempts) {
  const ui = UI();
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      ui.showProgress("📄 チャンク " + (idx + 1) + "/" + total + " を要約中...");
      const r = await callChatAPINonStream(chunkMessages, config, signal);
      ui.showProgress("📄 完了");
      return { success: true, result: r };
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") throw e;
      if (attempt < maxAttempts) {
        console.warn(
          "[YouTube 要約] チャンク " + (idx + 1) + " リトライ " + attempt + "/" + maxAttempts + ":",
          e.message
        );
        ui.showProgress("⚠️ チャンク " + (idx + 1) + " リトライ中");
        await new Promise(function (r) {
          setTimeout(r, 500);
        });
      } else {
        console.warn("[YouTube 要約] チャンク " + (idx + 1) + " の処理に最終失敗:", e.message);
        ui.showProgress("⚠️ チャンク " + (idx + 1) + " をスキップ");
        return { success: false, result: null };
      }
    }
  }
  return { success: false, result: null };
}

// ===== Map-Reduce: 並列チャンク処理＋統合（中断対応） =====
async function processMapReduce(chunks, config, signal, prompt, timeoutPromise, summaryTextEl) {
  const ui = UI();
  const results = new Array(chunks.length).fill(null);
  let successCount = 0;
  const maxAttempts = CHUNK_MAX_ATTEMPTS;

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
        { role: "system", content: prompt + "\n\nこれは動画の一部分です。" },
        { role: "user", content: chunkMessage }
      ];
      const outcome = await processSingleChunk(
        chunkMessages,
        config,
        signal,
        idx,
        chunks.length,
        maxAttempts
      );
      if (outcome.success) {
        results[idx] = outcome.result;
        successCount++;
      }
    }
  }

  const workers = [];
  const numWorkers = Math.min(MAX_CONCURRENCY, chunks.length); // MAX_CONCURRENCY は import した定数
  for (let i = 0; i < numWorkers; i++) {
    workers.push(worker());
  }
  await Promise.race([Promise.allSettled(workers), timeoutPromise]);

  if (signal.aborted) {
    throw new DOMException("AbortError", "AbortError");
  }

  // 結果を抽出
  const chunkSummaries = results.filter(function (r) {
    return r !== null;
  });
  if (chunkSummaries.length === 0) {
    showError("すべてのチャンクの処理に失敗しました。");
    return null;
  }

  const combinedSummaries = chunkSummaries
    .map(function (s, idx) {
      return "=== チャンク " + (idx + 1) + " ===\n" + s;
    })
    .join("\n\n");

  ui.showProgress("🔄 " + successCount + "/" + chunks.length + "チャンクの要約を統合中...");

  // 統合プロンプト
  const finalMessage =
    "以下はYouTube動画の各チャンクの要約結果です。これらを統合して、動画全体の一貫した要約を作成してください。情報の重複を避け、論理的な流れで整理してください:\n\n" +
    combinedSummaries;
  const finalMergePrompt =
    "あなたはYouTube動画の複数のチャンク要約を統合するアシスタントです。各チャンクの内容を踏まえ、動画全体として一貫性のある要約を日本語で箇条書きで作成してください。";
  const finalMessages = [
    { role: "system", content: finalMergePrompt },
    { role: "user", content: finalMessage }
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

// ===== AI呼び出し（オーケストレーション） =====
// 戻り値: true=成功, false=失敗または中断
//
// 構造:
//   callAI(mode, useAbort)
//     ├─ prepareContext(mode)  // 字幕取得・config/prompt 解決
//     ├─ runSummary(ctx, signal)  // 単一 / Map-Reduce 振り分け
//     └─ handleErrors(e, ctx)  // エラー分類（既存 catch ブロック）
export async function callAI(mode, useAbort) {
  const tab = uiState.tabs[mode];
  if (!tab) return false;

  if (useAbort) abortCurrentStream();

  const ui = UI();
  ui.hideError();
  ui.clearSummaryContent();
  ui.hideProgress();
  const summaryTextEl = ui.getSummaryTextEl();

  try {
    // 1. コンテキスト準備（字幕取得・config/prompt 解決）
    const ctx = await prepareContext(mode);
    if (!ctx) return false; // 準備段階でユーザー向けエラー表示済み

    // 2. AbortController 設定
    sessionState.abortController = new AbortController();
    const signal = sessionState.abortController.signal;

    // 3. 単一 or Map-Reduce を振り分け
    const { accumulated, userMessage } = await runSummary(ctx, signal, summaryTextEl);
    if (accumulated === null) return false; // Map-Reduce 全チャンク失敗

    // 4. 結果確定
    finalizeResult(mode, tab, accumulated, ctx.config, ctx.prompt, userMessage, ctx.transcript);
    return true;
  } catch (e) {
    return handleErrors(e);
  }
}

// ===== コンテキスト準備（純粋: session 状態への書き込みあり） =====
// 戻り値: { transcript, transcriptText, config, prompt, metaContext } または null
async function prepareContext(mode) {
  const ui = UI();
  const timeoutPromise = createTimeoutPromise();

  // 字幕取得
  const transcript = await fetchTranscriptWithTimeout(timeoutPromise);
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
async function runSummary(ctx, signal, summaryTextEl) {
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
    const timeoutPromise = createTimeoutPromise();
    const accumulated = await processSingleStream(
      messages,
      config,
      signal,
      summaryTextEl,
      timeoutPromise
    );
    return { accumulated: accumulated, userMessage: baseUser };
  }

  // --- Map-Reduce処理 ---
  ui.showProgress("チャンク処理を開始...");
  const chunks = splitIntoChunks(transcriptText, availableTokens);
  const timeoutPromise = createTimeoutPromise();
  const accumulated = await processMapReduce(
    chunks,
    config,
    signal,
    prompt,
    timeoutPromise,
    summaryTextEl
  );
  ui.hideProgress();
  return { accumulated: accumulated === undefined ? null : accumulated, userMessage: baseUser };
}

// ===== エラーハンドリング（純粋: 副作用は UI 表示のみ） =====
function handleErrors(e) {
  const ui = UI();
  if (e instanceof DOMException && e.name === "AbortError") {
    ui.hideProgress();
    return false;
  }
  if (e instanceof YsAbortError || e instanceof YsTimeoutError) {
    ui.hideProgress();
    return false;
  }
  if (e instanceof YsAPIError) {
    ui.clearSummaryContent();
    showError("エラー: " + e.message);
    ui.hideProgress();
    return false;
  }
  // 中断系は signal.aborted でも検知（メッセージ文字列依存の安全網を廃止）
  if (sessionState.abortController && sessionState.abortController.signal.aborted) {
    ui.hideProgress();
    return false;
  }
  ui.clearSummaryContent();
  showError("エラー: " + e.message);
  ui.hideProgress();
  return false;
}
