// ============================================================
//  errors.js — カスタムエラークラス（文字列比較に依存しないエラー判定）
//  ESMモジュール
// ============================================================

/**
 * API呼び出しが中断されたときのエラー
 */
export class YsAbortError extends Error {
  constructor(message) {
    super(message || 'API呼び出しが中断されました。');
    this.name = 'YsAbortError';
  }
}

/**
 * API呼び出しがタイムアウトしたときのエラー
 */
export class YsTimeoutError extends Error {
  constructor(message) {
    super(message || 'API応答がタイムアウトしました。');
    this.name = 'YsTimeoutError';
  }
}

/**
 * APIレスポンスがエラーのときのエラー（HTTPステータスコード保持）
 */
export class YsAPIError extends Error {
  constructor(message, status, statusText) {
    super(message);
    this.name = 'YsAPIError';
    this.status = status;
    this.statusText = statusText;
  }
}