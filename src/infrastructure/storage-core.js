// ============================================================
//  storage-core.js — chrome.storage の汎用 I/O（ESM版）
//  Phase A-2: storage.js から分割。汎用キーアクセスと定数定義のみ。
//  設定値のロード（storage-config）とキャッシュ（storage-cache）は別ファイルへ。
// ============================================================
import { createLogger } from "../shared/logger.js";

const log = createLogger("storage-core");

// ===== ストレージキー定数 =====
export const K = {
  API_CONFIGS: "apiConfigs",
  PROMPT_PREFIX: "prompt_",
  BTN_TITLE_PREFIX: "btnTitle_",
  BTN_API_PREFIX: "btnApiConfig_",
  SUBTITLE_LANG: "subtitleLang",
  FONT_SIZE: "fontSize",
  PANEL_HEIGHT: "panelHeight",
  THEME: "theme",
  LATEST_SUMMARY: "latestSummary",
  LATEST_CAPTIONS: "latestCaptions"
};

// ===== コンテキスト有効性チェック =====
export function isExtensionContextValid() {
  try {
    return !!(chrome && chrome.runtime && chrome.runtime.id);
  } catch {
    return false;
  }
}

// ===== 汎用ストレージアクセス =====
export async function get(key) {
  try {
    if (!isExtensionContextValid()) return null;
    const r = await chrome.storage.local.get(key);
    return r[key];
  } catch (e) {
    if (e.message && e.message.indexOf("context invalidated") !== -1) {
      log.warn("storage.get skipped (extension context invalidated)");
      return null;
    }
    throw e;
  }
}

export async function set(obj) {
  try {
    if (!isExtensionContextValid()) return;
    await chrome.storage.local.set(obj);
  } catch (e) {
    if (e.message && e.message.indexOf("context invalidated") !== -1) {
      log.warn("storage.set skipped (extension context invalidated)");
      return;
    }
    throw e;
  }
}

export async function remove(key) {
  try {
    if (!isExtensionContextValid()) return;
    await chrome.storage.local.remove(key);
  } catch (e) {
    if (e.message && e.message.indexOf("context invalidated") !== -1) {
      log.warn("storage.remove skipped (extension context invalidated)");
      return;
    }
    throw e;
  }
}

// ===== 全キー取得（移行処理等で使用） =====
export async function getAll() {
  try {
    if (!isExtensionContextValid()) return {};
    return await chrome.storage.local.get(null);
  } catch (e) {
    if (e.message && e.message.indexOf("context invalidated") !== -1) {
      log.warn("storage.getAll skipped (extension context invalidated)");
      return {};
    }
    throw e;
  }
}
