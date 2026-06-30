// ============================================================
//  storage.js — 後方互換のための re-export ハブ
//  Phase A-2: 役割を分割。
//    storage-core.js  … 汎用 I/O + K 定数
//    storage-config.js … 設定値のロード (loadApiConfigs 等)
//    storage-cache.js  … 要約キャッシュ (saveSummaryCache 等)
//  新規コードは storage-core / storage-config / storage-cache を直接 import すること。
// ============================================================

export * from "./storage-core.js";
export * from "./storage-config.js";
export * from "./storage-cache.js";