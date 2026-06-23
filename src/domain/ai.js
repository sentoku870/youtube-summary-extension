// ============================================================
//  ai.js — AI呼び出し・Map-Reduce要約・エラー表示（ESM版）
//  callAI はオーケストレーションのみ、サブ関数に分割
//  Port/Adapter パターンでUI層への結合を抽象化
// ============================================================
import { YsAPIError, YsAbortError, YsTimeoutError } from "../infrastructure/errors.js";
import { getAvailableTokens, estimateTokens, splitIntoChunks } from "../shared/utils.js";
import { callChatAPIStream } from "./api.js";
import { uiState, sessionState } from "../shared/state.js";
import { setMarkdown } from "./markdown.js";
import { createLogger } from "../shared/logger.js";
import { processMapReduce } from "./ai-map-reduce.js";

const log = createLogger("ai");
import {
  loadBtnApiConfigId,
  loadApiConfigById,
  loadApiConfigs,
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
import { CHAT_HISTORY_SEED_LENGTH } from "../shared/constants.js";

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
  // 整合性チェック: 上記の初期履歴は CHAT_HISTORY_SEED_LENGTH と同数でなければならない
  if (tab.chatHistory.length !== CHAT_HISTORY_SEED_LENGTH) {
    log.warn("chatHistory seed length mismatch: expected " + CHAT_HISTORY_SEED_LENGTH);
  }

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
    log.error("Failed to save summary cache:", e);
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
  const config = await resolveApiConfig(mode);
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
