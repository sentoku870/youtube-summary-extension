// ============================================================
//  state.js — アプリ共有状態の定義（ESM）
//  panel.js にあった初期化ロジックを集約。
//  window.__ysState は当面エイリアスとして維持（後方互換）。
// ============================================================

/**
 * 初期状態オブジェクトを生成する
 * （テストでも個別インスタンス生成に利用）
 * @returns {Object} 初期化された状態オブジェクト
 */
export function createInitialState() {
  return {
    panelEl: null,
    transcriptText: "",
    preloadedTranscript: null,
    transcriptReady: false,
    activeTab: null,
    eventsBound: false,
    tabs: {},
    tabIds: ["summary", "customA", "customB"],
    abortController: null,
    pendingRetry: false,
    videoMeta: null
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

// ===== window.__ysState へのエイリアス（後方互換・過渡期） =====
// UI層がまだIIFEで window.__ysState を参照するため、当面維持。
// Phase 6（UI層ESM化）完了後に削除予定。
if (typeof window !== "undefined") {
  if (!window.__ysState) {
    window.__ysState = state;
  } else {
    // 既存パネルが初期化済みの場合は、その内容を state へマージ
    // （ホットリロードや2度読み込み対策）
    Object.assign(state, window.__ysState);
    window.__ysState = state;
  }
}