// ============================================================
//  state.js — アプリ共有状態の定義（ESM）
//  パネル状態・セッション状態・初期化フラグを集約。
//  ESM 単一の真実の源（Single Source of Truth）。
// ============================================================

/**
 * 初期状態オブジェクトを生成する
 * （テストでも個別インスタンス生成に利用）
 * @returns {Object} 初期化された状態オブジェクト
 */
export function createInitialState() {
  return {
    // パネル・UI 状態
    panelEl: null,
    activeTab: null,
    eventsBound: false,
    tabs: {},
    tabIds: ["summary", "customA", "customB"],
    // 動画セッション状態（動画切り替えでリセット）
    transcriptText: "",
    preloadedTranscript: null,
    transcriptReady: false,
    videoMeta: null,
    abortController: null,
    pendingRetry: false,
    // 初期化制御（動画切替・BFCache 復元で false に戻す）
    initialized: false,
    lastInitTime: 0
  };
}

/**
 * タブの初期状態を生成する
 * @returns {Object}
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

/**
 * アプリ全体の単一状態インスタンス
 * 他モジュールはこれを import して参照する。
 */
export const state = createInitialState();
