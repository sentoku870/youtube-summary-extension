// ============================================================
//  transcript.js — 字幕取得・プリロード・リトライ（ESM版）
//  Phase A-1/A-2: content/ui への依存を排除 → event-bus に切り替え
//  これにより domain 層は純粋に content/ui に依存しなくなる。
// ============================================================
import { state as S } from "../shared/state.js";
import { loadSubtitleLang } from "../infrastructure/storage.js";
import { emit, EVENTS } from "../shared/event-bus.js";
import { fetchYtTranscript } from "./transcript-fetcher.js";

// ===== 字幕取得 =====
export async function fetchTranscript() {
  if (S.preloadedTranscript) return S.preloadedTranscript;
  // 既にロード中のPromiseがあればそれに乗る（競合防止）
  if (S._transcriptPromise) return S._transcriptPromise;
  const promise = (async function() {
    const lang = await loadSubtitleLang();
    const config = lang && lang !== "auto" ? { lang: lang } : undefined;
    const r = await fetchYtTranscript(config);
    return r;
  })();
  S._transcriptPromise = promise;
  try {
    const r = await promise;
    return r;
  } finally {
    S._transcriptPromise = null;
  }
}

// ===== 字幕プリロード（リトライ機構付き＋再試行ボタン対応） =====
export async function preloadTranscript() {
  if (S.transcriptReady) return;
  const retries = 3;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const transcript = await fetchTranscript();
      if (transcript && transcript.all && transcript.all.length > 0) {
        S.preloadedTranscript = transcript;
        S.transcriptReady = true;
        // UI層はこのイベントを購読してボタン文言を更新
        emit(EVENTS.TRANSCRIPT_READY, { transcript: transcript });
        return;
      }
    } catch (e) {
      console.log("[YouTube 要約] 字幕プリロード失敗 (" + attempt + "/" + retries + "):", e.message);
      if (attempt < retries) {
        await new Promise(function(r) { setTimeout(r, 1500 * attempt); });
      }
    }
  }
  // 全リトライ失敗：UI層はこのイベントを購読して再試行ボタンを表示
  emit(EVENTS.TRANSCRIPT_FAILED, { reason: "all-retries-exhausted" });
}

// 字幕の再試行（リトライボタン用）
export async function retryTranscript() {
  if (S.pendingRetry) return;
  S.pendingRetry = true;
  S.preloadedTranscript = null;
  S.transcriptReady = false;

  // UI層はこのイベントを購読して「取得中...」表示
  emit(EVENTS.TRANSCRIPT_RETRY, {});

  await preloadTranscript();
  S.pendingRetry = false;
}

// ===== グローバル公開（過渡期：後方互換） =====
if (typeof window !== "undefined") {
  window.YsTranscript = {
    fetchTranscript: fetchTranscript,
    preloadTranscript: preloadTranscript,
    retryTranscript: retryTranscript
  };
}