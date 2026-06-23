// ============================================================
//  transcript.js — 字幕取得・プリロード・リトライ（ESM版）
//  Phase A-1/A-2: content/ui への依存を排除 → event-bus に切り替え
//  これにより domain 層は純粋に content/ui に依存しなくなる。
// ============================================================
import { sessionState as S } from "../shared/state.js";
import { loadSubtitleLang } from "../infrastructure/storage.js";
import { emit, EVENTS } from "../shared/event-bus.js";
import { fetchYtTranscript } from "./transcript-fetcher.js";
import { createLogger } from "../shared/logger.js";

const log = createLogger("transcript");

// ===== 字幕取得 =====
export async function fetchTranscript() {
  if (S.preloadedTranscript) return S.preloadedTranscript;
  // 既にロード中のPromiseがあればそれに乗る（競合防止）
  if (S._transcriptPromise) return S._transcriptPromise;
  // T2-E9: 現在の動画世代を capture。完了時に世代が違えば結果を捨てる。
  const myGen = S._transcriptGen;
  const promise = (async function () {
    const lang = await loadSubtitleLang();
    const config = lang && lang !== "auto" ? { lang: lang } : undefined;
    const r = await fetchYtTranscript(config);
    return r;
  })();
  S._transcriptPromise = promise;
  try {
    const r = await promise;
    // ナビ完了で世代が更新されていたら結果は古い動画のもの → 破棄
    if (myGen !== S._transcriptGen) {
      log.log("古い字幕取得結果を破棄（世代 mismatch）");
      return r;
    }
    return r;
  } finally {
    if (S._transcriptPromise === promise) S._transcriptPromise = null;
  }
}

// ===== 字幕プリロード（リトライ機構付き＋再試行ボタン対応） =====
export async function preloadTranscript() {
  if (S.transcriptReady) return;
  // T2-E9: プリロード開始時の世代を capture。
  // リトライ中の世代変化も検出する。
  const myGen = S._transcriptGen;
  const retries = 3;
  for (let attempt = 1; attempt <= retries; attempt++) {
    if (myGen !== S._transcriptGen) {
      log.log("プリロード中断（世代 mismatch, attempt=" + attempt + ")");
      return;
    }
    try {
      const transcript = await fetchTranscript();
      if (transcript && transcript.all && transcript.all.length > 0) {
        // 世代チェック後にだけ state に反映
        if (myGen !== S._transcriptGen) {
          log.log("古い字幕取得結果を破棄（世代 mismatch at store）");
          return;
        }
        S.preloadedTranscript = transcript;
        S.transcriptReady = true;
        // UI層はこのイベントを購読してボタン文言を更新
        emit(EVENTS.TRANSCRIPT_READY, { transcript: transcript });
        return;
      }
    } catch (e) {
      log.log("字幕プリロード失敗 (" + attempt + "/" + retries + "):", e.message);
      if (attempt < retries) {
        await new Promise(function (r) {
          setTimeout(r, 1500 * attempt);
        });
      }
    }
  }
  if (myGen !== S._transcriptGen) return;
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
