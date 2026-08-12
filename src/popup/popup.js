// ============================================================
//  popup.js — 字幕DL / 設定（ESM版）
//  DOMContentLoaded を待たずとも <script type="module"> は defer 扱いのため
//  DOM 構築後に実行される。共通のエラー表示ヘルパで重複コードを削減。
//  Phase 4-7: chrome.tabs.sendMessage に 15 秒タイムアウトを追加。
//  getActiveYouTubeTab を shared/utils.js の isYouTubeWatchPage に統一。
// ============================================================
import { createLogger } from "../shared/logger.js";
import { isYouTubeWatchPage } from "../shared/utils.js";
import { K } from "../infrastructure/storage-core.js";

const log = createLogger("popup");

const dlBtn = document.getElementById("dlBtn");
const statusText = document.getElementById("statusText");

const RELOAD_HINT = "❌ ページを再読み込みしてからお試しください";
// content script が無応答のときに DL ボタンが永遠に「取得中...」のまま
// 残らないように、15 秒タイムアウトを設定。
const DL_REQUEST_TIMEOUT_MS = 15000;

// T2-D5: latestSummary の取得結果をメモ化。
// popup 起動中は何度も storage.get を呼ぶとオーバーヘッドが大きいため、
// 最初の 1 回だけ storage を見て、その後はキャッシュを使う。
// chrome.storage.onChanged で invalidation する。
let latestSummaryCache = null;
let latestSummaryLoaded = false;
async function loadLatestSummary() {
  if (latestSummaryLoaded) return latestSummaryCache;
  const r = await chrome.storage.local.get([K.LATEST_SUMMARY]);
  latestSummaryCache = r[K.LATEST_SUMMARY] || null;
  latestSummaryLoaded = true;
  return latestSummaryCache;
}

function showError(msg) {
  statusText.textContent = msg || RELOAD_HINT;
}

async function getActiveYouTubeTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const tab = tabs[0];
  if (!tab || !isYouTubeWatchPage(tab.url || "")) {
    return null;
  }
  return tab;
}

async function updateUI() {
  const tab = await getActiveYouTubeTab();
  // 字幕DLはYouTube動画ページを開いている時のみ有効
  // （クリック時にその場で字幕を取得するため、事前取得の有無は問わない）
  dlBtn.disabled = !tab;

  if (!tab) {
    statusText.textContent = "YouTube動画のページを開いてください";
  } else {
    const latest = await loadLatestSummary();
    statusText.textContent = latest
      ? "✅ 要約済み（字幕DL可能）"
      : "YouTube動画のページを開いて字幕を取得できます";
  }
}

// Promise にタイムアウトを付与するヘルパ。
function withTimeout(promise, ms, onTimeout) {
  let timer = null;
  const timeout = new Promise(function (_, reject) {
    timer = setTimeout(function () {
      onTimeout && onTimeout();
      reject(new Error("Timeout after " + ms + "ms"));
    }, ms);
  });
  return Promise.race([promise, timeout]).finally(function () {
    if (timer !== null) clearTimeout(timer);
  });
}

// ===== 字幕ダウンロード（アクティブタブから字幕を取得して保存） =====
dlBtn.addEventListener("click", async function () {
  statusText.textContent = "⏳ 字幕を取得中...";
  dlBtn.disabled = true;
  const originalText = dlBtn.textContent;
  dlBtn.textContent = "⏳ 取得中...";

  try {
    const tab = await getActiveYouTubeTab();
    if (!tab) {
      showError("❌ YouTube動画のページで実行してください");
      return;
    }

    // content script へ ysGetTranscript メッセージを送信（タイムアウト付き）
    let resp;
    try {
      resp = await withTimeout(
        chrome.tabs.sendMessage(tab.id, { action: "ysGetTranscript" }),
        DL_REQUEST_TIMEOUT_MS
      );
    } catch (e) {
      // タイムアウト or 「Receiving end does not exist」など
      log.error("字幕DL メッセージ失敗:", e);
      showError(RELOAD_HINT);
      return;
    }
    if (!resp) {
      showError(RELOAD_HINT);
      return;
    }
    if (resp.error) {
      showError("❌ " + resp.error);
      return;
    }
    const transcript = resp.transcript || [];
    if (transcript.length === 0) {
      showError("❌ 字幕が見つかりませんでした");
      return;
    }

    // 字幕をテキストファイルとしてダウンロード
    const text = transcript.join("\n");
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;

    // ファイル名に動画IDを含める（上書き防止）。
    // 防御的にサニタイズして OS 依存の path メタ文字を除去。
    const videoIdMatch = tab.url.match(/[?&]v=([^&]+)/);
    const videoId = videoIdMatch ? videoIdMatch[1].replace(/[^A-Za-z0-9_-]/g, "_") : "video";
    a.download = "youtube_captions_" + videoId + ".txt";
    a.click();
    URL.revokeObjectURL(url);

    statusText.textContent = "✅ 字幕をダウンロードしました (" + transcript.length + " 件)";
  } catch (e) {
    log.error("字幕DL失敗:", e);
    showError(RELOAD_HINT);
  } finally {
    dlBtn.textContent = originalText;
    dlBtn.disabled = false;
  }
});

chrome.storage.onChanged.addListener(function (changes) {
  if (changes[K.LATEST_SUMMARY]) {
    // T2-D5: 変更通知が来たらメモ化キャッシュを invalidate
    latestSummaryCache = changes[K.LATEST_SUMMARY].newValue || null;
    latestSummaryLoaded = true;
    updateUI();
  }
});

document.getElementById("settingsBtn").addEventListener("click", function () {
  chrome.runtime.openOptionsPage();
});

updateUI();
