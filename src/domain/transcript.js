// ============================================================
//  transcript.js — 字幕取得・プリロード・リトライ（ESM版）
//  Phase A-1/A-2: content/ui への依存を排除 → event-bus に切り替え
//  これにより domain 層は純粋に content/ui に依存しなくなる。
//  Phase 2-B: 世代管理（_transcriptGen, _transcriptPromise）の書き込みは
//  race condition 防止のため直接代入を維持。複数キー同時更新のみ
//  setSessionState で原子的書き換えを行う。
// ============================================================
import { sessionState as S, setSessionState } from "../shared/state.js";
import { loadSubtitleLang } from "../infrastructure/storage-config.js";
import { emit, INTERNAL_EVENTS } from "../shared/event-bus.js";
import { fetchYtTranscript } from "./transcript-fetcher.js";
import { createLogger } from "../shared/logger.js";

const log = createLogger("transcript");

// ===== 字幕取得 =====
// 戻り値: 字幕オブジェクト { all, player, meta, allTimestamps } または null
// 世代 mismatch で破棄した場合 / 取得失敗時は null を返す。
export async function fetchTranscript() {
  if (S.preloadedTranscript) return S.preloadedTranscript;
  // 既にロード中のPromiseがあればそれに乗る（競合防止）
  if (S._transcriptPromise) return S._transcriptPromise;
  // T2-E9: 現在の動画世代を capture。完了時に世代が違えば結果を破棄する。
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
      return null;
    }
    // ★ 取得成功時はキャッシュ + TRANSCRIPT_READY を発火して UI を更新する。
    // popup の DL ボタン経路 (ysGetTranscript ハンドラ) など、
    // preloadTranscript() 以外から呼ばれた経路でも UI が「字幕取得中」の
    // ままになる問題をこれで防ぐ。preloadTranscript 側で二重発火した場合も
    // event-bridge の applyButtonTitles は冪等なので問題なし。
    if (r && r.all && r.all.length > 0 && !S.transcriptReady) {
      setSessionState({
        preloadedTranscript: r,
        transcriptReady: true
      });
      emit(INTERNAL_EVENTS.TRANSCRIPT_READY, { transcript: r });
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
        setSessionState({
          preloadedTranscript: transcript,
          transcriptReady: true
        });
        // UI層はこのイベントを購読してボタン文言を更新
        emit(INTERNAL_EVENTS.TRANSCRIPT_READY, { transcript: transcript });
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
  emit(INTERNAL_EVENTS.TRANSCRIPT_FAILED, { reason: "all-retries-exhausted" });
}

// 字幕の再試行（リトライボタン用）
export async function retryTranscript() {
  if (S.pendingRetry) return;
  setSessionState({
    pendingRetry: true,
    preloadedTranscript: null,
    transcriptReady: false
  });

  // UI層はこのイベントを購読して「取得中...」表示
  emit(INTERNAL_EVENTS.TRANSCRIPT_RETRY, {});

  await preloadTranscript();
  S.pendingRetry = false;
}
