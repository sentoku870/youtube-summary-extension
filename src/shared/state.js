// ============================================================
//  state.js — アプリ共有状態の定義（ESM）
//  UI 状態（パネル・タブ・初期化制御）と
//  セッション状態（動画単位データ）に分割。
//  UI 状態: パネル寿命で保持。動画切替で消えない。
//  セッション状態: 動画切替ごとに resetSession() で初期化。
// ============================================================
import { TAB_IDS } from "./constants.js";

/**
 * UI 状態（パネル・タブ・初期化制御）
 * 動画切替でも維持される
 */
export const uiState = {
  panelEl: null,
  activeTab: null,
  eventsBound: false,
  tabs: {},
  tabIds: [...TAB_IDS],
  initialized: false,
  lastInitTime: 0,
  // T1-U3: storage.onChanged リスナー参照（bindEvents 再呼び出し時・pagehide で removeListener）
  storageOnChangedListener: null,
  storageOnChangedCleanupBound: false
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
    _transcriptPromise: null,
    // T2-E9: 動画世代カウンタ。resetTranscript でインクリメントし、
    // 進行中のプリロードが完了しても世代 mismatch で結果を破棄する。
    _transcriptGen: 0,
    // チャット送信用の状態 (Phase H F-5 でモジュールスコープから移動)
    chatAbortController: null,
    chatAbortChain: null,
    chatBusy: false,
    // タブ切替世代カウンタ。switchTab() 入口でインクリメントし、
    // 古い呼び出しの finally が他タブのボタン状態を巻き込むのを防ぐ。
    _switchGen: 0
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
