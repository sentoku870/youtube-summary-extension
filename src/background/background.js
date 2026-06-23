// ============================================================
//  background.js — Service Worker
//  YouTube SPA の URL 変更を tabs.onUpdated で検知し、
//  content script へ sendMessage で即時通知する。
//  index.js のポーリング負荷を削減しつつ、即応性を維持。
//
//  設計:
//  - 直前の URL/タイトルをタブ毎に保持し、変化があった場合のみ通知
//  - content script 未ロード時は .catch() で握りつぶし（マニフェストで自動注入）
//  - タブが閉じられたら state を削除してメモリリーク防止
// ============================================================

// 直前の URL を保持（タブごとに）
// 構造: { [tabId]: { url, title, lastNotifiedAt } }
const tabStates = {};

// YouTube watch ページか判定
function isYouTubeWatchUrl(url) {
  if (!url) return false;
  return url.indexOf("youtube.com/watch") !== -1 || url.indexOf("youtube.com/shorts/") !== -1;
}

// URL/タイトル変更を検知して content script へ通知
chrome.tabs.onUpdated.addListener(function (tabId, changeInfo, tab) {
  if (!tab || !tab.url) return;
  if (!isYouTubeWatchUrl(tab.url)) return;

  const prev = tabStates[tabId];
  const currentTitle = tab.title || "";
  // URL とタイトル両方が同じなら通知しない
  if (prev && prev.url === tab.url && prev.title === currentTitle) return;

  tabStates[tabId] = {
    url: tab.url,
    title: tab.title || "",
    lastNotifiedAt: Date.now()
  };

  // content script へ通知
  chrome.tabs
    .sendMessage(tabId, {
      action: "ysTabUpdated",
      url: tab.url,
      title: tab.title || ""
    })
    .catch(function () {
      // content script 未ロード時は無視（マニフェストで自動注入されるため通常は成功する）
    });
});

// タブが閉じられたら state 削除
chrome.tabs.onRemoved.addListener(function (tabId) {
  delete tabStates[tabId];
});

// タブ移動（ウィンドウ間）でも state を保持するため、onMoved では何もしない

// Service Worker 起動時（インストール/更新）のログ
chrome.runtime.onInstalled.addListener(function (details) {
  console.log("[YouTube 要約][background] installed:", details.reason);
});

// ===== コンテンツスクリプトへのバッファ提供 =====
// Service Worker 起動が content script より早いため、
// content script 起動時の初回ナビを取りこぼさないように、
// 直近のタブ状態を問い合わせたら返す。
chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
  if (msg && msg.action === "ysGetTabState") {
    const tabId = sender.tab && sender.tab.id;
    if (tabId && tabStates[tabId]) {
      sendResponse({
        url: tabStates[tabId].url,
        title: tabStates[tabId].title
      });
    } else {
      sendResponse({ url: null, title: null });
    }
    return true;
  }
  return false;
});
