// ============================================================
//  ai/index.js — AI 呼び出し公開ファサード
//  Phase 2-D: ai.js（294 行モノリス）を機能別に分割。
//  既存 import（../domain/ai）への後方互換のため、
//  公開 API をここで再エクスポートする。
//
//  分割内訳:
//    - ai/orchestrator.js: 公開 API（callAI, resolveApiConfig,
//                         abortCurrentStream, showError, prepareContext）
//    - ai/context.js: 純粋関数（resolveTranscriptText, fetchConfigAndPrompt）
//    - ai/runner.js: ストリーミング実行（processSingleStream,
//                  runSingleStream, runSummary, STREAM_THROTTLE_MS）
// ============================================================

export { resolveApiConfig, resolveTranscriptText, fetchConfigAndPrompt } from "./context.js";

export { abortCurrentStream, showError, prepareContext, callAI } from "./orchestrator.js";

export { processSingleStream, runSingleStream, runSummary, STREAM_THROTTLE_MS } from "./runner.js";

// ai-finalize.js からの再エクスポート（テスト互換用）
export { finalizeResult } from "../ai-finalize.js";
