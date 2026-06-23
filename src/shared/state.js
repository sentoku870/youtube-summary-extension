// ============================================================
//  state.js — アプリ共有状態の定義（ESM）
//  UI 状態（パネル・タブ・初期化制御）と
//  セッション状態（動画単位データ）に分割。
//  UI 状態: パネル寿命で保持。動画切替で消えない。
//  セッション状態: 動画切替ごとに resetSession() で初期化。
// ============================================================

/**
 * UI 状態（パネル・タブ・初期化制御）
 * 動画切替でも維持される
 */
export const uiState = {
  panelEl: null,
  activeTab: null,
  eventsBound: false,
  tabs: {},
  tabIds: ["summary", "customA", "customB"],
  initialized: false,
  lastInitTime: 0
};

/**
 * セッション状態の初期値を生成
 * 動画切替のたびに resetSession() で再生成する
 */
export function createInitialSessionState() {
  return {
    transcriptText: "",
    preloadedTranscript: null,
    transcriptReady: false,
    videoMeta: null,
    abortController: null,
    pendingRetry: false,
    _transcriptPromise: null
  };
}

/**
 * セッション状態（動画単位でリセット）
 */
export const sessionState = createInitialSessionState();

/**
 * セッション状態を初期値にリセット
 * 動画切替時に呼ぶ
 */
export function resetSession() {
  const fresh = createInitialSessionState();
  for (const key of Object.keys(sessionState)) delete sessionState[key];
  Object.assign(sessionState, fresh);
}

/**
 * タブの初期状態を生成する
 */
export function createInitialTabState() {
  return {
    generated: false,
    content: "",
    config: null,
    modelLabel: "",
    transcriptCount: 0,
    chatHistory: []
  };
}
