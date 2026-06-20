// ============================================================
//  errors.js — カスタムエラークラス（文字列比較に依存しないエラー判定）
//  IIFEモジュールパターン
// ============================================================
(function() {
  'use strict';

  /**
   * API呼び出しが中断されたときのエラー
   */
  class YsAbortError extends Error {
    constructor(message) {
      super(message || 'API呼び出しが中断されました。');
      this.name = 'YsAbortError';
    }
  }

  /**
   * API呼び出しがタイムアウトしたときのエラー
   */
  class YsTimeoutError extends Error {
    constructor(message) {
      super(message || 'API応答がタイムアウトしました。');
      this.name = 'YsTimeoutError';
    }
  }

  /**
   * APIレスポンスがエラーのときのエラー（HTTPステータスコード保持）
   */
  class YsAPIError extends Error {
    constructor(message, status, statusText) {
      super(message);
      this.name = 'YsAPIError';
      this.status = status;
      this.statusText = statusText;
    }
  }

  // Chrome拡張用: window経由で公開
  if (typeof window !== 'undefined') {
    window.YsAbortError = YsAbortError;
    window.YsTimeoutError = YsTimeoutError;
    window.YsAPIError = YsAPIError;
  }

  // Jest用: module.exportsで公開
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      YsAbortError,
      YsTimeoutError,
      YsAPIError
    };
  }

})();