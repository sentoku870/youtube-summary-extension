// ============================================================
//  options.js — オプション画面のエントリポイント（ESM版）
//  DOMContentLoaded フック + タブ切替 + 初期表示設定値の読み込み。
//  各タブのロジックは options-models / options-buttons / options-display へ。
// ============================================================
import { getAll, K } from "../infrastructure/storage.js";
import { promptKey, btnTitleKey, btnApiConfigKey } from "./options-logic.js";
import { initModelsTab, renderModelList } from "./options-models.js";
import { initButtonsTab, updateButtonModelSelects } from "./options-buttons.js";
import { initDisplayTab } from "./options-display.js";
import { migrateIfNeeded } from "./options-migration.js";
import { setVal } from "./options-shared.js";

// ===== アコーディオン初期化（タブ内の折り畳み UI） =====
function initAccordion() {
  document.querySelectorAll(".accordion-header").forEach(function (header) {
    header.addEventListener("click", function () {
      const body = this.nextElementSibling;
      if (!body) return;
      const isOpen = body.classList.contains("open");
      if (isOpen) {
        body.classList.remove("open");
        this.classList.remove("open");
      } else {
        body.classList.add("open");
        this.classList.add("open");
      }
    });
  });
}

// ===== タブ切替 =====
function switchTab(tabId) {
  document.querySelectorAll(".tab-btn").forEach(function (b) {
    b.classList.remove("active");
  });
  document.querySelector('[data-tab="' + tabId + '"]').classList.add("active");
  document.querySelectorAll(".tab-content").forEach(function (c) {
    c.classList.remove("active");
  });
  document.getElementById(tabId).classList.add("active");
  // タブ切替時に最新データを反映
  if (tabId === "tab-models") renderModelList();
  if (tabId === "tab-buttons") updateButtonModelSelects();
}

// ===== 初期表示（保存済み設定値を各フォームへ） =====
async function loadInitialSettings() {
  const result = await getAll();

  // プロンプト（レガシー systemPrompt から summary への移行も含む）
  if (result[promptKey("summary")]) setVal("prompt_summary", result[promptKey("summary")]);
  else if (result[K.SYSTEM_PROMPT_LEGACY]) setVal("prompt_summary", result[K.SYSTEM_PROMPT_LEGACY]);
  if (result[promptKey("customA")]) setVal("prompt_customA", result[promptKey("customA")]);
  if (result[promptKey("customB")]) setVal("prompt_customB", result[promptKey("customB")]);
  // ボタンタイトル
  if (result[btnTitleKey("customA")]) setVal("btnTitle_customA", result[btnTitleKey("customA")]);
  if (result[btnTitleKey("customB")]) setVal("btnTitle_customB", result[btnTitleKey("customB")]);

  // ボタンのモデル選択肢（登録済みモデルから）
  await updateButtonModelSelects();

  // ボタンごとの選択モデル
  ["summary", "customA", "customB"].forEach(function (key) {
    const storageKey = btnApiConfigKey(key);
    if (result[storageKey]) {
      const sel = document.getElementById("btnApiConfig_" + key);
      if (sel) sel.value = result[storageKey];
    }
  });

  // 表示設定
  if (result[K.FONT_SIZE]) setVal("fontSize", result[K.FONT_SIZE]);
  if (result[K.PANEL_HEIGHT]) setVal("panelHeight", result[K.PANEL_HEIGHT]);
  if (result[K.THEME]) setVal("theme", result[K.THEME]);
  if (result[K.SUBTITLE_LANG]) setVal("subtitleLang", result[K.SUBTITLE_LANG]);
}

// ===== タブボタン click ハンドラ（DOMContentLoaded 前に登録しても安全） =====
document.querySelectorAll(".tab-btn").forEach(function (btn) {
  btn.addEventListener("click", function () {
    const tabId = btn.getAttribute("data-tab");
    switchTab(tabId);
  });
});

// ===== 初期化エントリ =====
window.addEventListener("DOMContentLoaded", async function () {
  await migrateIfNeeded();
  initAccordion();
  initModelsTab();
  initButtonsTab();
  initDisplayTab();
  await loadInitialSettings();
});
