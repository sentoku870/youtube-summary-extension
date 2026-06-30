// ============================================================
//  storage-config.js — 設定値のロード専用ヘルパ（ESM版）
//  Phase A-2: storage.js から分割。
//  K 定数と汎用 get() を使い、各設定値の読み出しを提供する。
// ============================================================
import { get, K } from "./storage-core.js";

// ===== API 設定 =====
export async function loadApiConfigs() {
  return (await get(K.API_CONFIGS)) || [];
}

export async function loadApiConfigById(id) {
  const configs = await loadApiConfigs();
  return (
    configs.find(function (c) {
      return c.id === id;
    }) || null
  );
}

// ===== プロンプト / ボタン紐付け =====
export async function loadCustomPrompt(type) {
  return (await get(K.PROMPT_PREFIX + type)) || "";
}

export function getDefaultPrompt(type) {
  switch (type) {
    case "summary":
      return "あなたはYouTube動画の字幕を日本語で簡潔に要約するアシスタントです。箇条書きで要点をまとめてください。";
    case "customA":
      return "あなたはYouTube動画の字幕を日本語で分析するアシスタントです。内容を深く分析し、洞察を提供してください。";
    case "customB":
      return "あなたはYouTube動画の字幕について日本語で考察するアシスタントです。内容に対する批評や意見を述べてください。";
    default:
      return "";
  }
}

export async function loadButtonTitle(btn) {
  return (await get(K.BTN_TITLE_PREFIX + btn)) || null;
}

export async function loadBtnApiConfigId(btn) {
  return (await get(K.BTN_API_PREFIX + btn)) || null;
}

// ===== 表示設定 =====
export async function loadSubtitleLang() {
  return (await get(K.SUBTITLE_LANG)) || "auto";
}

export async function loadFontSize() {
  return (await get(K.FONT_SIZE)) || "13";
}

export async function loadPanelHeight() {
  return (await get(K.PANEL_HEIGHT)) || "1100";
}

export async function loadThemeSetting() {
  return (await get(K.THEME)) || "auto";
}
