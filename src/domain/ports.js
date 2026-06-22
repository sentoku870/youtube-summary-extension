// ============================================================
//  ports.js — ドメイン層が要求するUI表示IFの定義（Port）
//  Phase A-3: ai.js の setUiBridge/UI() をここへ集約。
//  ドメイン層はこのポート（抽象）にのみ依存し、
//  content/ui 層がアダプター（実装）を注入する。
// ============================================================

// デフォルトは no-op アダプター（テスト環境や未初期化時の安全弁）
let adapter = createNoopAdapter();

/**
 * UI表示アダプターを注入する（content層の index.js が起動時に呼ぶ）
 * @param {Object} impl - UI表示実装
 */
export function setUiAdapter(impl) {
  adapter = Object.assign({}, createNoopAdapter(), impl);
}

/**
 * 現在のアダプターを取得（ドメイン層の各関数が使用）
 * @returns {Object} UI表示アダプター
 */
export function getUiAdapter() {
  return adapter;
}

/**
 * no-op アダプター（デフォルト実装：何もしない + console のみ）
 * テスト環境や未初期化時に安全に動作するための fallback。
 */
function createNoopAdapter() {
  return {
    showError: function(m) { console.error(m); },
    hideError: function() {},
    hideProgress: function() {},
    showProgress: function() {},
    setSummaryContent: function() {},
    clearSummaryContent: function() {},
    updateInfoLabel: function() {},
    showChatArea: function() {},
    focusChatInput: function() {},
    showCopyButton: function() {},
    showRegenButton: function() {},
    getSummaryTextEl: function() { return null; },
    updateTabUI: function() {}
  };
}