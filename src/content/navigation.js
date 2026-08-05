// ============================================================
//  navigation.js — 後方互換のためのファサード
//  Phase 3-1: 実体は src/content/nav/ ディレクトリ配下に分割。
//    - nav/detector.js: SPA ナビゲーション検出（5 ソース + ポーリング +
//                      visibilitychange）
//    - nav/resetter.js: 動画切替時の state リセット
//  既存 import（../content/navigation）を壊さないため、
//  公開 API を nav/detector.js / nav/resetter.js から再エクスポートする。
// ============================================================

export { startNavigationDetection, __resetNavigationForTest } from "./nav/detector.js";

export { resetTranscript, handleNavigation, setSafeInit } from "./nav/resetter.js";
