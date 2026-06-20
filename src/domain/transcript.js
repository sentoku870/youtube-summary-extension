// ============================================================
//  transcript.js — 字幕取得・プリロード・リトライ
//  IIFEモジュールパターン
// ============================================================
(function() {
  'use strict';

  const S = window.__ysState;

  // ===== 字幕取得 =====
  async function fetchTranscript() {
    if (S.preloadedTranscript) return S.preloadedTranscript;
    // 既にロード中のPromiseがあればそれに乗る（競合防止）
    if (S._transcriptPromise) return S._transcriptPromise;
    const promise = (async function() {
      const lang = await loadSubtitleLang();
      const config = lang && lang !== "auto" ? { lang: lang } : undefined;
      const r = await window.__fetchYtTranscript(config);
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
  async function preloadTranscript() {
    if (S.transcriptReady) return;
    const retries = 3;
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const transcript = await fetchTranscript();
        if (transcript && transcript.all && transcript.all.length > 0) {
          S.preloadedTranscript = transcript;
          S.transcriptReady = true;
          if (typeof YsTabs !== "undefined" && YsTabs.applyButtonTitles) {
            YsTabs.applyButtonTitles();
          }
          return;
        }
      } catch (e) {
        console.log("[YouTube 要約] 字幕プリロード失敗 (" + attempt + "/" + retries + "):", e.message);
        if (attempt < retries) {
          await new Promise(function(r) { setTimeout(r, 1500 * attempt); });
        }
      }
    }
    const btnSummary = YsPanel.getEl("#ys-btn-summary");
    if (btnSummary) {
      btnSummary.textContent = "⏳ 字幕取得失敗（再試行）";
      btnSummary.disabled = false;
      btnSummary.onclick = function() { retryTranscript(); };
    }
  }

  // 字幕の再試行（リトライボタン用）
  async function retryTranscript() {
    if (S.pendingRetry) return;
    S.pendingRetry = true;
    S.preloadedTranscript = null;
    S.transcriptReady = false;

    const btnSummary = YsPanel.getEl("#ys-btn-summary");
    if (btnSummary) {
      btnSummary.textContent = "⏳ 字幕取得中...";
      btnSummary.disabled = true;
    }
    if (btnSummary) btnSummary.onclick = null;

    await preloadTranscript();
    S.pendingRetry = false;
  }

  // ===== 公開API =====
  window.YsTranscript = {
    fetchTranscript: fetchTranscript,
    preloadTranscript: preloadTranscript,
    retryTranscript: retryTranscript
  };

})();