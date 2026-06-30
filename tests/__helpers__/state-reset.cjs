// tests/__helpers__/state-reset.js — uiState / sessionState のリセットヘルパ
// テスト間で sessionState / uiState が漏れないように初期化する。

const { resetSession, uiState, sessionState } = require("../../src/shared/state");

/**
 * uiState を再構築し、sessionState を初期化する。
 * 各テストの beforeEach で呼び出す想定。
 *
 * なぜ手動再構築が必要か:
 *   - uiState.tabs は createPanel() で再構築されるため、テストで明示的に作る
 *   - uiState.panelEl は createPanel() が再構築するため null にしておく
 *   - sessionState は resetSession() で完全初期化（abortController, transcript等）
 */
function resetStates() {
  resetSession();
  uiState.tabs = {};
  uiState.activeTab = null;
  uiState.panelEl = null;
  uiState.eventsBound = false;
  uiState.initialized = false;
  uiState.lastInitTime = 0;
  uiState.storageOnChangedListener = null;
  uiState.storageOnChangedCleanupBound = false;
}

/**
 * テスト用に sessionState を完全に初期化する（uiState は触らない）。
 * tab.generated などの状態は uiState.tabs[id] に残っている。
 */
function resetSessionState() {
  resetSession();
}

module.exports = {
  resetStates,
  resetSessionState,
  uiState,
  sessionState
};