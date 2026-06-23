// ============================================================
//  constants.js — 全体で共有される定数・マジックナンバー集約
//  Phase: 設計改善（可読性・保守性向上）
// ============================================================

// ===== API関連 =====
export const API_TIMEOUT_MS = 30000; // 1リクエストのタイムアウト
export const API_MAX_RETRIES_STREAM = 3; // ストリーミングAPIの最大リトライ
export const API_MAX_RETRIES_NONSTREAM = 2; // 非ストリーミングAPI（チャンク用）
export const API_RETRY_BASE_WAIT_MS = 1500; // HTTPエラー時リトライ待機（attempt×値）
export const API_RETRY_NET_BASE_WAIT_MS = 1000; // ネットワークエラー時リトライ待機

// ===== 全体処理タイムアウト =====
export const GLOBAL_TIMEOUT_MS = 180000; // 字幕取得〜要約完了の全体タイムアウト

// ===== Map-Reduce 並列処理 =====
export const MAX_CONCURRENCY = 5; // チャンク並列ワーカー上限
export const CHUNK_MAX_ATTEMPTS = 2; // チャンクごとの最大試行回数

// ===== トークン計算 =====
export const CONTEXT_WINDOW_USABLE_RATIO = 0.8; // 入力に使えるコンテキスト比
export const DEFAULT_MAX_TOKENS = 4096; // 出力最大トークンのデフォルト
export const DEFAULT_TEMPERATURE = 0.3; // 温度パラメータのデフォルト
export const MIN_USABLE_TOKENS = 1; // 計算結果の下限クランプ

// ===== DOM / UI =====
export const TIMESTAMP_DELEGATION_FLAG = "ysTimestampBound"; // linkTimestamps委譲済みフラグ
export const TS_LINK_CLASS = "ys-timestamp-link"; // タイムスタンプリンクのクラス名

// ===== タブID =====
export const TAB_IDS = Object.freeze(["summary", "customA", "customB"]);

// ===== Chat history =====
export const CHAT_HISTORY_SEED_LENGTH = 3; // 初期要約で生成される system + user + assistant の3件
