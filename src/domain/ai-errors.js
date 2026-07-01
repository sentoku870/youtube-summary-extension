// ============================================================
//  ai-errors.js — AI呼び出し時のエラーハンドリング（ESM版）
//  Phase C-2: ai.js から分割。
//  callAI の catch ブロックから呼ばれ、エラーを分類してUI通知する。
//
//  依存:
//    - infrastructure/errors.js: YsAPIError / YsAbortError / YsTimeoutError
//    - shared/state.js: sessionState (abortController)
//    - domain/ports.js: UI adapter
// ============================================================
import { YsAPIError, YsAbortError, YsTimeoutError } from "../infrastructure/errors.js";
import { sessionState } from "../shared/state.js";
import { getUiAdapter } from "./ports.js";

function UI() {
  return getUiAdapter();
}

function showError(msg) {
  UI().showError(msg);
}

/**
 * AI呼び出し中の例外を分類し、UI通知 + false を返す。
 * 戻り値: 常に false（callAI の戻り値として伝播する）
 *
 * @param {Error} e - callAI の try/catch で捕捉された例外
 * @param {AbortController} [controller] - callAI で生成した controller（C-1 後に null 化済みな
 *                                       ので、signal.aborted 判定の補助に使う）
 * @returns {false}
 */
export function handleAiErrors(e, controller) {
  const ui = UI();
  // DOMException (AbortError) → 中断として扱う
  if (e instanceof DOMException && e.name === "AbortError") {
    ui.hideProgress();
    return false;
  }
  // 内部エラー型 → 中断として扱う（ユーザーには通知しない）
  if (e instanceof YsAbortError || e instanceof YsTimeoutError) {
    ui.hideProgress();
    return false;
  }
  // API 由来のエラー → メッセージを表示
  if (e instanceof YsAPIError) {
    ui.clearSummaryContent();
    showError("エラー: " + e.message);
    ui.hideProgress();
    return false;
  }
  // C-1 後: controller は既に null 化されている可能性があるため、
  // 渡された controller (callAI で生成したての参照) を優先して aborted を判定する。
  // どちらも無い場合は安全のため中断扱いしない（既存テスト互換）。
  if (controller && controller.signal && controller.signal.aborted) {
    ui.hideProgress();
    return false;
  }
  if (sessionState.abortController && sessionState.abortController.signal.aborted) {
    ui.hideProgress();
    return false;
  }
  // その他 → 一般エラーとして表示
  ui.clearSummaryContent();
  showError("エラー: " + e.message);
  ui.hideProgress();
  return false;
}
