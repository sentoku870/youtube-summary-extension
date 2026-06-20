// popup.js — 字幕DL / AI処理 / 設定

const dlBtn = document.getElementById("dlBtn");
const statusText = document.getElementById("statusText");
const summaryBtn = document.getElementById("summaryBtn");
const customABtn = document.getElementById("customABtn");
const customBBtn = document.getElementById("customBBtn");

async function updateUI() {
  const r = await chrome.storage.local.get(["latestSummary", "latestCaptions"]);
  const hasCaptions = r.latestCaptions && r.latestCaptions.length > 0;
  statusText.textContent = r.latestSummary
    ? "✅ 要約済み"
    : "YouTube動画のページを開いて字幕を取得してください";
  // 字幕DLは保存済みの字幕が必要
  dlBtn.disabled = !hasCaptions;
  // AIボタンは常に有効（クリック時にその場で字幕を取得するため）
  summaryBtn.disabled = false;
  customABtn.disabled = false;
  customBBtn.disabled = false;
}

// 字幕ダウンロード
dlBtn.addEventListener("click", async function() {
  const data = await chrome.storage.local.get("latestCaptions");
  if (data.latestCaptions && data.latestCaptions.length > 0) {
    const text = data.latestCaptions.join("\n");
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "youtube_captions.txt";
    a.click();
    URL.revokeObjectURL(url);
  }
});

chrome.storage.onChanged.addListener(function(changes) {
  if (changes.latestSummary || changes.latestCaptions) {
    updateUI();
  }
});

document.getElementById("settingsBtn").addEventListener("click", function() {
  chrome.runtime.openOptionsPage();
});

// ===== AIボタン共通処理 =====
async function triggerAI(mode) {
  console.log("[popup] triggerAI mode=" + mode);
  // アクティブなYouTubeタブを探す
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const tab = tabs[0];
  if (!tab || !tab.url || !tab.url.includes("youtube.com/watch")) {
    statusText.textContent = "❌ YouTube動画のページで実行してください";
    return;
  }

  statusText.textContent = "⏳ AI処理を開始します...";

  try {
    // まず content script が生きているか確認
    await chrome.tabs.sendMessage(tab.id, { action: "ysPing" });
    console.log("[popup] ysPing success");
  } catch (e) {
    console.log("[popup] ysPing failed, injecting scripts...");
    // content script が未注入 → scripting.executeScript で強制注入
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: [
          "lib/transcript-fetcher.js",
          "lib/marked.min.js",
          "lib/purify.min.js",
          "content/errors.js",
          "content/utils.js",
          "content/markdown.js",
          "content/storage.js",
          "content/api.js",
          "content/panel.js",
          "content/transcript.js",
          "content/ai.js",
          "content/ui.js",
          "content/tabs.js",
          "content/sidebar.js",
          "content/main.js"
        ]
      });
      console.log("[popup] scripts injected");
      // 注入後に少し待つ
      await new Promise(r => setTimeout(r, 500));
    } catch (injErr) {
      console.error("[popup] inject failed:", injErr);
      statusText.textContent = "❌ スクリプト注入に失敗しました";
      return;
    }
  }

  // パネルを強制表示
  try {
    await chrome.tabs.sendMessage(tab.id, { action: "ysForcePanel" });
    console.log("[popup] ysForcePanel done");
  } catch (e) {
    console.error("[popup] ysForcePanel failed:", e);
    statusText.textContent = "❌ パネル表示に失敗しました: " + e.message;
    return;
  }

  // ysTriggerAi は fire-and-forget（awaitしない）
  // ポップアップは即座に閉じて、処理はバックグラウンドで継続
  try {
    chrome.tabs.sendMessage(tab.id, { action: "ysTriggerAi", mode: mode });
    console.log("[popup] ysTriggerAi sent, closing popup");
  } catch (e) {
    console.error("[popup] ysTriggerAi send failed:", e);
    // sendMessageが失敗してもポップアップは閉じて良い
  }
  statusText.textContent = "✅ AI処理を開始しました（サイドバーを確認）";
  // 0.5秒後にポップアップを閉じる
  setTimeout(function() { window.close(); }, 500);
}

summaryBtn.addEventListener("click", function() { triggerAI("summary"); });
customABtn.addEventListener("click", function() { triggerAI("customA"); });
customBBtn.addEventListener("click", function() { triggerAI("customB"); });

updateUI();
