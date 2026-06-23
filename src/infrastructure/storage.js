// ============================================================
//  storage.js — chrome.storage 操作（ESM版・キー定数化）
//  純粋なストレージI/Oのみを担う。DOM操作は UI層（appearance.js）へ分離済み。
// ============================================================
import { createLogger } from "../shared/logger.js";

const log = createLogger("storage");

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

// ===== 設定読み込み =====
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

export async function loadSubtitleLang() {
  return (await get(K.SUBTITLE_LANG)) || "auto";
}

export async function loadFontSize() {
  return (await get(K.FONT_SIZE)) || "13";
}

// ===== パネル高さ =====
export async function loadPanelHeight() {
  return (await get(K.PANEL_HEIGHT)) || "1100";
}

// ===== 保存・キャッシュ =====
// T2-C1: 同一 videoId のキャッシュをメモリに保持し、storage.get を 2 回目以降スキップ。
// chrome.storage への往復は体感で数ms〜数十ms かかるため、同じ動画を
// タブ切替や再生成で連続参照する場合に大きな短縮になる。
const summaryCacheMemory = new Map();
const SUMMARY_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export async function saveToStorage(summary, captions) {
  await set({ [K.LATEST_SUMMARY]: summary, [K.LATEST_CAPTIONS]: captions });
}

export async function saveSummaryCache(videoId, data) {
  const key = "summary_cache_" + videoId;
  const value = {
    content: data.content,
    modelLabel: data.modelLabel,
    transcriptCount: data.transcriptCount,
    timestamp: Date.now()
  };
  summaryCacheMemory.set(videoId, value);
  await set({ [key]: value });
}

export async function loadSummaryCache(videoId) {
  if (!videoId) return null;
  // 1) メモリキャッシュヒット
  const mem = summaryCacheMemory.get(videoId);
  if (mem) {
    if (Date.now() - mem.timestamp > SUMMARY_CACHE_TTL_MS) {
      summaryCacheMemory.delete(videoId);
      await remove("summary_cache_" + videoId);
      return null;
    }
    return mem;
  }
  // 2) storage 取得
  const key = "summary_cache_" + videoId;
  const data = await get(key);
  if (!data) return null;
  if (Date.now() - data.timestamp > SUMMARY_CACHE_TTL_MS) {
    await remove(key);
    return null;
  }
  summaryCacheMemory.set(videoId, data);
  return data;
}

export async function clearSummaryCache(videoId) {
  summaryCacheMemory.delete(videoId);
  const key = "summary_cache_" + videoId;
  await remove(key);
}

// テスト用: メモリキャッシュを全クリア
export function __resetSummaryCacheMemory() {
  summaryCacheMemory.clear();
}

// ===== テーマ設定読み込み =====
export async function loadThemeSetting() {
  return (await get(K.THEME)) || "auto";
}
