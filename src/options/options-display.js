// ============================================================
//  options-display.js — 表示設定タブ UI（自動保存 + テーマカード）
//  テーマ: 大きなカード3つ（Auto/Light/Dark）を選択
//  フォントサイズ / パネル高さ: 数値入力 + プリセットチップ
//  字幕言語: 既存 select を維持
//  バージョン情報: 字幕設定直下に「バージョン」「ビルド日」「コミット」を表示
//  全項目 change/input 時にデバウンス（300ms）で chrome.storage に保存。
//  B-4: 自動保存ロジックを ui/auto-save.js の createAutoSave ヘルパに委譲。
// ============================================================
import { set, K } from "../infrastructure/storage-core.js";
import { saveToast } from "./ui/toast.js";
import { getAppVersion, getAppBuildDate, getAppGitCommit } from "../shared/version.js";
import { createAutoSave } from "./ui/auto-save.js";
import { el } from "./options-shared.js";

const FONT_SIZE_PRESETS = [13, 14, 15, 16, 17, 18, 19, 20];
const PANEL_HEIGHT_PRESETS = [
  { value: 1050, label: "小" },
  { value: 1100, label: "標準" },
  { value: 1150, label: "大" }
];

const THEMES = [
  { value: "auto", icon: "🌗", name: "自動", desc: "ブラウザに合わせる" },
  { value: "light", icon: "☀️", name: "ライト", desc: "明るい背景" },
  { value: "dark", icon: "🌙", name: "ダーク", desc: "暗い背景" }
];

let isInitialized = false;

// ===== テーマカード生成 =====
function buildThemeCards() {
  const container = document.getElementById("themeCards");
  if (!container) return;
  container.replaceChildren();
  THEMES.forEach(function (t) {
    const card = el("div", "theme-card");
    card.setAttribute("data-theme", t.value);
    card.setAttribute("role", "radio");
    card.setAttribute("tabindex", "0");
    card.setAttribute("aria-checked", "false");
    card.setAttribute("aria-label", t.name + " - " + t.desc);
    const icon = el("span", "theme-icon", t.icon);
    const name = el("div", "theme-name", t.name);
    const preview = el("div", "theme-preview theme-preview-" + t.value);
    preview.textContent = "A";
    card.appendChild(icon);
    card.appendChild(name);
    card.appendChild(preview);
    card.addEventListener("click", function () {
      selectTheme(t.value);
    });
    card.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        selectTheme(t.value);
      }
    });
    container.appendChild(card);
  });
}

function selectTheme(value) {
  const sel = document.getElementById("theme");
  if (sel) sel.value = value;
  document.querySelectorAll(".theme-card").forEach(function (c) {
    const active = c.getAttribute("data-theme") === value;
    c.classList.toggle("active", active);
    c.setAttribute("aria-checked", active ? "true" : "false");
  });
  scheduleSave();
}

function setThemeFromValue(value) {
  document.querySelectorAll(".theme-card").forEach(function (c) {
    const active = c.getAttribute("data-theme") === value;
    c.classList.toggle("active", active);
    c.setAttribute("aria-checked", active ? "true" : "false");
  });
}

// ===== プリセットチップ生成 =====
function buildPresetChips(containerId, presets, inputId, formatLabel) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.replaceChildren();
  presets.forEach(function (p) {
    const value = typeof p === "object" ? p.value : p;
    const label = typeof p === "object" ? p.label : String(p);
    const chip = el(
      "button",
      "preset-chip",
      formatLabel ? formatLabel(value, label) : String(value)
    );
    chip.type = "button";
    chip.setAttribute("data-value", String(value));
    chip.addEventListener("click", function () {
      const input = document.getElementById(inputId);
      if (input) {
        input.value = String(value);
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
      }
    });
    container.appendChild(chip);
  });
}

function syncPresetActiveState(containerId, currentValue) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.querySelectorAll(".preset-chip").forEach(function (chip) {
    const isActive = chip.getAttribute("data-value") === String(currentValue);
    chip.classList.toggle("active", isActive);
  });
}

// ===== 自動保存 (B-4: createAutoSave に委譲) =====
let saver = null;

function collectDisplayPayload() {
  const theme = document.getElementById("theme");
  const fontSize = document.getElementById("fontSize");
  const panelHeight = document.getElementById("panelHeight");
  const subtitleLang = document.getElementById("subtitleLang");
  const payload = {};
  if (theme) payload[K.THEME] = theme.value;
  if (fontSize) payload[K.FONT_SIZE] = fontSize.value;
  if (panelHeight) payload[K.PANEL_HEIGHT] = panelHeight.value;
  if (subtitleLang) payload[K.SUBTITLE_LANG] = subtitleLang.value;
  return payload;
}

function scheduleSave() {
  if (!saver) return;
  saver.schedule();
}

// ===== バージョン情報の表示 =====
async function renderVersionInfo() {
  const verEl = document.getElementById("versionInfoVersion");
  const dateEl = document.getElementById("versionInfoBuildDate");
  const commitEl = document.getElementById("versionInfoCommit");
  const commitRowEl = document.getElementById("versionInfoCommitRow");
  if (verEl) verEl.textContent = "v" + getAppVersion();
  if (dateEl) dateEl.textContent = await getAppBuildDate();
  if (commitEl && commitRowEl) {
    const commit = await getAppGitCommit();
    if (commit) {
      commitEl.textContent = commit;
      commitRowEl.hidden = false;
    } else {
      commitRowEl.hidden = true;
    }
  }
}

// ===== 公開 =====
export function initDisplayTab() {
  if (isInitialized) return;
  isInitialized = true;
  buildThemeCards();
  buildPresetChips("fontSizePresets", FONT_SIZE_PRESETS, "fontSize", function (v) {
    return v + "px";
  });
  buildPresetChips("panelHeightPresets", PANEL_HEIGHT_PRESETS, "panelHeight", function (v, l) {
    return v + "px (" + l + ")";
  });
  // バージョン情報を非同期で取得・表示
  renderVersionInfo();

  // B-4: 自動保存ヘルパを初期化
  saver = createAutoSave({
    indicatorId: "displayAutoSaveStatus",
    save: async function () {
      await set(collectDisplayPayload());
    },
    onError: function (msg) {
      saveToast("✗ 保存に失敗: " + msg);
    }
  });

  // change/input で自動保存
  const themeSel = document.getElementById("theme");
  if (themeSel) themeSel.addEventListener("change", scheduleSave);
  const fontSize = document.getElementById("fontSize");
  if (fontSize) {
    fontSize.addEventListener("input", function () {
      syncPresetActiveState("fontSizePresets", fontSize.value);
      scheduleSave();
    });
    fontSize.addEventListener("change", function () {
      syncPresetActiveState("fontSizePresets", fontSize.value);
      scheduleSave();
    });
  }
  const panelHeight = document.getElementById("panelHeight");
  if (panelHeight) {
    panelHeight.addEventListener("input", function () {
      syncPresetActiveState("panelHeightPresets", panelHeight.value);
      scheduleSave();
    });
    panelHeight.addEventListener("change", function () {
      syncPresetActiveState("panelHeightPresets", panelHeight.value);
      scheduleSave();
    });
  }
  const subtitleLang = document.getElementById("subtitleLang");
  if (subtitleLang) subtitleLang.addEventListener("change", scheduleSave);
}

export async function flushDisplaySaves() {
  return saver ? saver.flush() : Promise.resolve();
}

export function setThemeActiveFromValue(value) {
  setThemeFromValue(value);
}

export function syncPresets(fontSize, panelHeight) {
  syncPresetActiveState("fontSizePresets", fontSize);
  syncPresetActiveState("panelHeightPresets", panelHeight);
}
