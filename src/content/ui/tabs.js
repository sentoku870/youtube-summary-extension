// ============================================================
//  tabs.js — タブ切替・チャット・UI更新・イベントバインド（ESM版）
//  UI操作は ui.js、タブ描画は tabs-ui.js へ分離済み。
// ============================================================
import { state as S } from "../../shared/state.js";
import { getEl, enableAllButtons } from "./panel.js";
import {
  setSummaryRaw, disableRegenButton, enableRegenButton, appendChatMessage
} from "./ui.js";
import { updateTabUI, updateTabActive, renderTabContent } from "./tabs-ui.js";
import { callAI, abortCurrentStream, resolveApiConfig } from "../../domain/ai.js";
import { callChatAPIStream } from "../../domain/api.js";
import { YsAbortError, YsTimeoutError } from "../../infrastructure/errors.js";
import { loadButtonTitle } from "../../infrastructure/storage.js";

// tabs-ui.js からの再エクスポート（呼び出し側の互換用）
export { updateTabUI, updateTabActive, renderTabContent };

// チャット送信用のAbortController（連続送信やタブ切り替えで前の応答を中断）
let chatAbortController = null;

/**
 * 進行中のチャット応答を中断する。
 * 動画切り替え時などに呼び出すことを想定。
 */
export function abortChatStream() {
  if (chatAbortController) {
    chatAbortController.abort();
    chatAbortController = null;
  }
}

// ===== クリップボードコピー =====
function copyContent() {
  const tab = S.tabs[S.activeTab];
  if (!tab || !tab.content) return;
  try {
    navigator.clipboard.writeText(tab.content);
  } catch (_) {
    console.error("[ys] clipboard write failed");
  }
}

// ===== タブ切り替え =====
export async function switchTab(mode) {
  const tab = S.tabs[mode];
  if (!tab) return;
  const panel = getEl("#ys-panel");
  if (!panel) return;
  if (S.activeTab === mode) {
    panel.style.display = "none";
    S.activeTab = null;
    updateTabActive();
    return;
  }
  S.activeTab = mode;
  panel.style.display = "block";
  updateTabActive();
  if (tab.generated) {
    renderTabContent(mode);
    requestAnimationFrame(function() { if (panel) panel.scrollTop = 0; });
  } else {
    const btn = getEl("#ys-btn-" + mode);
    if (btn) {
      btn.textContent = "⏳ 処理中...";
      btn.disabled = true;
    }
    try {
      // callAI は内部でエラー/中断を処理し、UIも更新するため
      // ここでは戻り値を使わず、finally でボタン状態を復元する。
      await callAI(mode, true);
    } finally {
      if (btn) {
        btn.disabled = false;
        applyButtonTitles();
      }
    }
    requestAnimationFrame(function() { if (panel) panel.scrollTop = 0; });
  }
}

// ===== 再生成 =====
async function regenerate() {
  const mode = S.activeTab;
  if (!mode) return;
  const tab = S.tabs[mode];
  if (!tab) return;

  abortCurrentStream();
  abortChatStream();

  tab.generated = false;
  tab.content = "";
  tab.chatHistory = [];

  setSummaryRaw("⏳ 再生成中...");
  disableRegenButton();

  try {
    await callAI(mode, false);
  } finally {
    enableRegenButton();
    updateTabUI();
  }
}

// ===== チャット送信 =====
async function onChatSend() {
  const input = getEl("#ys-chatInput");
  const text = input ? input.value.trim() : "";
  if (!text) return;
  if (input) input.value = "";

  const sendBtn = getEl("#ys-chatSendBtn");
  if (sendBtn) sendBtn.disabled = true;

  const tab = S.tabs[S.activeTab];
  if (!tab || !tab.generated) {
    appendChatMessage("assistant", "[エラー] 先に要約・分析を生成してください。");
    return;
  }

  appendChatMessage("user", text);
  tab.chatHistory.push({ role: "user", content: text });

  // 進行中のチャットがあれば中断して新しいリクエストを開始
  abortChatStream();
  const controller = new AbortController();
  chatAbortController = controller;

  try {
    let config = tab.config;
    if (!config || !config.apiKey) {
      config = await resolveApiConfig(S.activeTab);
    }
    if (!config || !config.apiKey) {
      appendChatMessage("assistant", "[エラー] API設定がされていません。");
      return;
    }

    let accumulated = "";
    await callChatAPIStream(
      [{ role: "system", content: S.tabs[S.activeTab].chatHistory[0].content }].concat(tab.chatHistory),
      config,
      function(chunk) {
        accumulated = chunk;
      },
      function(fullText) {
        accumulated = fullText || accumulated;
        tab.chatHistory.push({ role: "assistant", content: accumulated });
        appendChatMessage("assistant", accumulated);
      },
      controller.signal
    );
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") return;
    if (e instanceof YsAbortError || e instanceof YsTimeoutError) return;
    if (e.message && e.message.indexOf("中断") !== -1) return;
    appendChatMessage("assistant", "[エラー] " + e.message);
  } finally {
    // コントローラがまだ自分を指している場合のみクリア
    if (chatAbortController === controller) {
      chatAbortController = null;
    }
    if (sendBtn) sendBtn.disabled = false;
    if (input) input.focus();
  }
}

// ===== ボタンタイトル適用 =====
export async function applyButtonTitles() {
  const btnSummary = getEl("#ys-btn-summary");
  const btnA = getEl("#ys-btn-customA");
  const btnB = getEl("#ys-btn-customB");
  if (btnSummary) btnSummary.textContent = "📝 要約";
  const titleA = await loadButtonTitle("customA");
  if (btnA) btnA.textContent = titleA ? "📊 " + titleA : "📊 分析";
  const titleB = await loadButtonTitle("customB");
  if (btnB) btnB.textContent = titleB ? "💡 " + titleB : "💡 考察";
  enableAllButtons();
  updateTabUI();
}

// ===== イベントバインド =====
export function bindEvents() {
  if (S.eventsBound) return;
  S.eventsBound = true;

  (S.tabIds || ["summary", "customA", "customB"]).forEach(function(id) {
    const btn = getEl("#ys-btn-" + id);
    if (btn) btn.addEventListener("click", function() { switchTab(id); });
  });

  const sendBtn = getEl("#ys-chatSendBtn");
  if (sendBtn) sendBtn.addEventListener("click", onChatSend);

  const chatInput = getEl("#ys-chatInput");
  if (chatInput) {
    chatInput.addEventListener("keydown", function(e) {
      if (e.key === "Enter") {
        const btn = getEl("#ys-chatSendBtn");
        if (btn && !btn.disabled) btn.click();
      }
    });
  }

  const regenBtn = getEl("#ys-regenBtn");
  if (regenBtn) regenBtn.addEventListener("click", regenerate);

  const copyBtn = getEl("#ys-copyBtn");
  if (copyBtn) copyBtn.addEventListener("click", copyContent);

  // 設定変更を150msデバウンス（saveAllBtnの一括保存時に複数回発火するのを防止）
  let debounceTimer = null;
  try {
    chrome.storage.onChanged.addListener(function(changes) {
      let shouldUpdate = false;
      for (const key in changes) {
        if (key.indexOf("btnTitle_") === 0 || key.indexOf("prompt_") === 0) {
          shouldUpdate = true;
          break;
        }
      }
      if (!shouldUpdate) return;
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(function() {
        applyButtonTitles();
      }, 150);
    });
  } catch (e) {
    console.warn("[ys] storage.onChanged listener could not be registered (extension context may be invalid).");
  }
}