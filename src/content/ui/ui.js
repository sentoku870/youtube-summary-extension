// ============================================================
//  ui.js — 後方互換のための re-export ハブ
//  Phase B-1: 役割を分割。
//    ui-progress.js … プログレス表示 / エラー表示
//    ui-summary.js  … 要約テキスト / 情報ラベル / チャットエリア
//    ui-buttons.js  … 再生成・コピー・チャット入力ボタン制御
//    ui-chat.js     … チャット履歴の描画とスクロール制御
//  新規コードは ui-progress / ui-summary / ui-buttons / ui-chat を直接 import すること。
// ============================================================

export * from "./ui-progress.js";
export * from "./ui-summary.js";
export * from "./ui-buttons.js";
export * from "./ui-chat.js";
