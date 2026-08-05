// ============================================================
//  ai/orchestrator.js — AI 呼び出しの公開エントリ
//  callAI / abortCurrentStream / showError / prepareContext を提供。
//  resolveApiConfig は ai/context.js に移動（infra storage 依存のため
//  純粋関数・内部ヘルパと同じ層に置く）。
// ============================================================
import { uiState, sessionState, setSessionState } from "../../shared/state.js";
import { getUiAdapter } from "../ports.js";
import { finalizeResult } from "../ai-finalize.js";
import { handleAiErrors } from "../ai-errors.js";
import { fetchTranscript } from "../transcript.js";
import { buildMetaContext, createTimeoutPromise } from "../ai-utils.js";
import { fetchConfigAndPrompt, resolveTranscriptText } from "./context.js";
import { runSummary } from "./runner.js";

function UI() {
  return getUiAdapter();
}

/**
 * 実行中のストリームを中断する。
 */
export function abortCurrentStream() {
  if (sessionState.abortController) {
    sessionState.abortController.abort();
  }
  setSessionState({ abortController: null });
}

/**
 * エラー表示（DI 経由で UI にエラー表示）。
 */
export function showError(msg) {
  UI().showError(msg);
}

/**
 * コンテキスト準備（字幕取得・config/prompt 解決）
 * @returns {Promise<{transcript, transcriptText, config, prompt, metaContext}|null>}
 */
export async function prepareContext(mode) {
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
  const transcriptText = resolveTranscriptText(transcript);
  setSessionState({
    videoMeta: transcript.meta || null,
    transcriptText: transcriptText
  });

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

/**
 * AI 呼び出し（オーケストレーション）。
 * 1. コンテキスト準備
 * 2. AbortController 設定
 * 3. 単一 or Map-Reduce 振り分け
 * 4. 結果確定（finalizeResult）
 * いずれの経路でも controller の解放を finally で保証する。
 */
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
    setSessionState({ abortController: new AbortController() });
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
      setSessionState({ abortController: null });
    }
  }
}
