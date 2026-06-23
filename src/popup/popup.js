// ============================================================
//  popup.js — 字幕DL / 設定（ESM版）
//  DOMContentLoaded を待たずとも <script type="module"> は defer 扱いのため
//  DOM 構築後に実行される。共通のエラー表示ヘルパで重複コードを削減。
// ============================================================
import { createLogger } from "../shared/logger.js";

const log = createLogger("popup");

const dlBtn = document.getElementById("dlBtn");
const statusText = document.getElementById("statusText");

const RELOAD_HINT = "❌ ページを再読み込みしてからお試しください";

// T2-D5: latestSummary の取得結果をメモ化。
// popup 起動中は何度も storage.get を呼ぶとオーバーヘッドが大きいため、
// 最初の 1 回だけ storage を見て、その後はキャッシュを使う。
// chrome.storage.onChanged で invalidation する。
let latestSummaryCache = null;
let latestSummaryLoaded = false;
async function loadLatestSummary() {
  if (latestSummaryLoaded) return latestSummaryCache;
  const r = await chrome.storage.local.get(["latestSummary"]);
  latestSummaryCache = r.latestSummary || null;
  latestSummaryLoaded = true;
  return latestSummaryCache;
}

function showError(msg) {
  statusText.textContent = msg || RELOAD_HINT;
}

async function getActiveYouTubeTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const tab = tabs[0];
  if (!tab || !tab.url || !tab.url.includes("youtube.com/watch")) {
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

    // content script へ ysGetTranscript メッセージを送信
    const resp = await chrome.tabs.sendMessage(tab.id, { action: "ysGetTranscript" });
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

    // ファイル名に動画IDを含める（上書き防止）
    const videoIdMatch = tab.url.match(/[?&]v=([^&]+)/);
    const videoId = videoIdMatch ? videoIdMatch[1] : "video";
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
  if (changes.latestSummary) {
    // T2-D5: 変更通知が来たらメモ化キャッシュを invalidate
    latestSummaryCache = changes.latestSummary.newValue || null;
    latestSummaryLoaded = true;
    updateUI();
  }
});

document.getElementById("settingsBtn").addEventListener("click", function () {
  chrome.runtime.openOptionsPage();
});

updateUI();
