// ============================================================
//  options.js — オプション画面のエントリポイント（ESM版）
//  タブ切替（ARIA対応）+ 各タブの初期化 + 保存値の読み込み。
//  旧「すべて保存」ボタンは廃止（自動保存に移行）。
//  B-3: options-buttons.js を廃止し button-card.js から直接 import。
// ============================================================
import { getAll, K } from "../infrastructure/storage-core.js";
import { initModelsTab, renderModelList } from "./options-models.js";
import { initButtonCards, refreshButtonModelSelects, flushAllSaves } from "./button-card.js";
import { initDisplayTab, setThemeActiveFromValue, syncPresets } from "./options-display.js";
import { initForm } from "./model-form.js";
import { getAppVersion, getAppBuildDate } from "../shared/version.js";

// ボタンタブ初期化ガード（旧 options-buttons.js の責務を吸収）
let isButtonsTabInitialized = false;
function initButtonsTab() {
  if (isButtonsTabInitialized) return;
  isButtonsTabInitialized = true;
  initButtonCards();
}

// ===== タブ切替 =====
function switchTab(tabId) {
  // 切替前にデバウンス済み保存をフラッシュ
  flushPendingSaves();
  // 現在の active を解除
  document.querySelectorAll(".tab-btn").forEach(function (b) {
    const active = b.getAttribute("data-tab") === tabId;
    b.classList.toggle("active", active);
    b.setAttribute("aria-selected", active ? "true" : "false");
  });
  document.querySelectorAll(".tab-content").forEach(function (c) {
    const active = c.id === tabId;
    c.classList.toggle("active", active);
    if (active) {
      c.removeAttribute("hidden");
    } else {
      c.setAttribute("hidden", "");
    }
  });
  // タブ切替時に他タブの最新データを反映
  if (tabId === "tab-models") renderModelList();
  if (tabId === "tab-buttons") refreshButtonModelSelects();
}

function flushPendingSaves() {
  // ボタンタブと表示設定のデバウンス保存を即時コミット
  Promise.all([
    Promise.resolve(flushAllSaves()),
    import("./options-display.js").then(function (m) {
      return m.flushDisplaySaves();
    })
  ]).catch(function () {
    /* エラーは各モジュール内で表示済み */
  });
}

// ===== 矢印キーでタブ間移動 =====
function initTabKeyboardNav() {
  const tabBtns = Array.from(document.querySelectorAll(".tab-btn"));
  tabBtns.forEach(function (btn, idx) {
    btn.addEventListener("keydown", function (e) {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight" && e.key !== "Home" && e.key !== "End") {
        return;
      }
      e.preventDefault();
      let nextIdx = idx;
      if (e.key === "ArrowLeft") nextIdx = (idx - 1 + tabBtns.length) % tabBtns.length;
      else if (e.key === "ArrowRight") nextIdx = (idx + 1) % tabBtns.length;
      else if (e.key === "Home") nextIdx = 0;
      else if (e.key === "End") nextIdx = tabBtns.length - 1;
      const target = tabBtns[nextIdx];
      if (target) {
        target.focus();
        switchTab(target.getAttribute("data-tab"));
      }
    });
  });
}

// ===== 初期表示（保存済み設定値を各フォームへ） =====
async function loadInitialSettings() {
  const result = await getAll();

  // 表示設定
  if (result[K.THEME]) {
    const themeSel = document.getElementById("theme");
    if (themeSel) themeSel.value = result[K.THEME];
    setThemeActiveFromValue(result[K.THEME]);
  } else {
    setThemeActiveFromValue("auto");
  }
  if (result[K.FONT_SIZE]) {
    const fontSize = document.getElementById("fontSize");
    if (fontSize) fontSize.value = result[K.FONT_SIZE];
    syncPresets(result[K.FONT_SIZE], result[K.PANEL_HEIGHT]);
  }
  if (result[K.PANEL_HEIGHT]) {
    const panelHeight = document.getElementById("panelHeight");
    if (panelHeight) panelHeight.value = result[K.PANEL_HEIGHT];
    syncPresets(result[K.FONT_SIZE], result[K.PANEL_HEIGHT]);
  }
  if (result[K.SUBTITLE_LANG]) {
    const subtitleLang = document.getElementById("subtitleLang");
    if (subtitleLang) subtitleLang.value = result[K.SUBTITLE_LANG];
  }

  // バージョン情報（フッター）
  const verEl = document.getElementById("appVersion");
  if (verEl) verEl.textContent = getAppVersion();
  const dateEl = document.getElementById("appBuildDate");
  if (dateEl) dateEl.textContent = await getAppBuildDate();
}

// ===== タブボタン click ハンドラ =====
document.querySelectorAll(".tab-btn").forEach(function (btn) {
  btn.addEventListener("click", function () {
    const tabId = btn.getAttribute("data-tab");
    if (tabId) switchTab(tabId);
  });
});

// ===== 初期化エントリ =====
window.addEventListener("DOMContentLoaded", async function () {
  initTabKeyboardNav();
  // モデル管理タブ（フォーム DOM を含む）を最初に初期化
  initModelsTab();
  initForm();
  initButtonsTab();
  initDisplayTab();
  await loadInitialSettings();
  await refreshButtonModelSelects();
});
