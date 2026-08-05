// ============================================================
//  ai.js — 後方互換のための再エクスポート
//  Phase 2-D: 実体は src/domain/ai/ ディレクトリ配下に分割。
//  既存コードの import（../domain/ai）を維持するため、
//  公開 API を ai/index.js から再エクスポートする薄いラッパとして残す。
// ============================================================

export {
  resolveApiConfig,
  resolveTranscriptText,
  fetchConfigAndPrompt,
  abortCurrentStream,
  showError,
  prepareContext,
  callAI,
  processSingleStream,
  runSingleStream,
  runSummary,
  STREAM_THROTTLE_MS,
  finalizeResult
} from "./ai/index.js";
