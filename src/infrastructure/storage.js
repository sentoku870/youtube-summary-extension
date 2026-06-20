// ============================================================
//  storage.js — chrome.storage 操作（キー定数化 + 名前空間化）
//  後方互換のため window.loadApiConfigs 等の従来APIも維持
//  YsStorage 名前空間経由の使用を推奨
// ============================================================
(function () {
  "use strict";

  // ===== ストレージキー定数 =====
  const K = {
    API_CONFIGS: "apiConfigs",
    API_CONFIG_LEGACY: "apiConfig",
    PROMPT_PREFIX: "prompt_",
    BTN_TITLE_PREFIX: "btnTitle_",
    BTN_API_PREFIX: "btnApiConfig_",
    SUBTITLE_LANG: "subtitleLang",
    FONT_SIZE: "fontSize",
    THEME: "theme",
    SYSTEM_PROMPT_LEGACY: "systemPrompt",
    LATEST_SUMMARY: "latestSummary",
    LATEST_CAPTIONS: "latestCaptions",
  };

  // ===== コンテキスト有効性チェック =====
  function isExtensionContextValid() {
    try {
      return !!(chrome && chrome.runtime && chrome.runtime.id);
    } catch (e) {
      return false;
    }
  }

  // ===== 汎用ストレージアクセス =====
  async function get(key) {
    try {
      if (!isExtensionContextValid()) return null;
      const r = await chrome.storage.local.get(key);
      return r[key];
    } catch (e) {
      if (e.message && e.message.indexOf("context invalidated") !== -1) {
        console.warn("[ys] storage.get skipped (extension context invalidated)");
        return null;
      }
      throw e;
    }
  }
  async function set(obj) {
    try {
      if (!isExtensionContextValid()) return;
      await chrome.storage.local.set(obj);
    } catch (e) {
      if (e.message && e.message.indexOf("context invalidated") !== -1) {
        console.warn("[ys] storage.set skipped (extension context invalidated)");
        return;
      }
      throw e;
    }
  }
  async function remove(key) {
    try {
      if (!isExtensionContextValid()) return;
      await chrome.storage.local.remove(key);
    } catch (e) {
      if (e.message && e.message.indexOf("context invalidated") !== -1) {
        console.warn("[ys] storage.remove skipped (extension context invalidated)");
        return;
      }
      throw e;
    }
  }

  // ===== 関数定義 =====
  async function loadApiConfigs() {
    return (await get(K.API_CONFIGS)) || [];
  }

  async function loadApiConfigById(id) {
    const configs = await loadApiConfigs();
    return configs.find(function (c) { return c.id === id; }) || null;
  }

  async function loadApiConfigLegacy() {
    return (await get(K.API_CONFIG_LEGACY)) || null;
  }

  async function loadCustomPrompt(type) {
    return (await get(K.PROMPT_PREFIX + type)) || "";
  }

  function getDefaultPrompt(type) {
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

  async function loadButtonTitle(btn) {
    return (await get(K.BTN_TITLE_PREFIX + btn)) || null;
  }

  async function loadBtnApiConfigId(btn) {
    return (await get(K.BTN_API_PREFIX + btn)) || null;
  }

  async function loadSubtitleLang() {
    return (await get(K.SUBTITLE_LANG)) || "auto";
  }

  async function loadFontSize() {
    return (await get(K.FONT_SIZE)) || "13";
  }

  async function applyFontSize() {
    const size = await loadFontSize();
    const s = document.querySelector("#yt-summary-root");
    if (s) s.style.setProperty("--fs-base", size + "px");
  }

  async function saveToStorage(summary, captions) {
    await set({ latestSummary: summary, latestCaptions: captions });
  }

  async function saveSummaryCache(videoId, data) {
    const key = "summary_cache_" + videoId;
    await set({ [key]: { content: data.content, modelLabel: data.modelLabel, transcriptCount: data.transcriptCount, timestamp: Date.now() } });
  }

  async function loadSummaryCache(videoId) {
    const key = "summary_cache_" + videoId;
    const data = await get(key);
    if (!data) return null;
    if (Date.now() - data.timestamp > 7 * 24 * 60 * 60 * 1000) {
      await remove(key);
      return null;
    }
    return data;
  }

  async function clearSummaryCache(videoId) {
    const key = "summary_cache_" + videoId;
    await remove(key);
  }

  async function loadThemeSetting() {
    return (await get(K.THEME)) || "auto";
  }

  async function applyTheme() {
    const theme = await loadThemeSetting();
    const isDark = theme === "dark" || (theme === "auto" && window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches);
    const root = document.querySelector("#yt-summary-root");
    if (root) root.setAttribute("data-theme", isDark ? "dark" : "light");
  }

  // ===== 名前空間として公開（推奨） =====
  window.YsStorage = {
    loadApiConfigs: loadApiConfigs,
    loadApiConfigById: loadApiConfigById,
    loadApiConfigLegacy: loadApiConfigLegacy,
    loadCustomPrompt: loadCustomPrompt,
    getDefaultPrompt: getDefaultPrompt,
    loadButtonTitle: loadButtonTitle,
    loadBtnApiConfigId: loadBtnApiConfigId,
    loadSubtitleLang: loadSubtitleLang,
    loadFontSize: loadFontSize,
    applyFontSize: applyFontSize,
    saveToStorage: saveToStorage,
    saveSummaryCache: saveSummaryCache,
    loadSummaryCache: loadSummaryCache,
    clearSummaryCache: clearSummaryCache,
    isExtensionContextValid: isExtensionContextValid,
    loadThemeSetting: loadThemeSetting,
    applyTheme: applyTheme
  };

  // ===== 後方互換用 従来のwindow直下関数（非推奨） =====
  window.loadApiConfigs = loadApiConfigs;
  window.loadApiConfigById = loadApiConfigById;
  window.loadApiConfigLegacy = loadApiConfigLegacy;
  window.loadCustomPrompt = loadCustomPrompt;
  window.getDefaultPrompt = getDefaultPrompt;
  window.loadButtonTitle = loadButtonTitle;
  window.loadBtnApiConfigId = loadBtnApiConfigId;
  window.loadSubtitleLang = loadSubtitleLang;
  window.loadFontSize = loadFontSize;
  window.applyFontSize = applyFontSize;
  window.saveToStorage = saveToStorage;
  window.saveSummaryCache = saveSummaryCache;
  window.loadSummaryCache = loadSummaryCache;
  window.clearSummaryCache = clearSummaryCache;
  window.loadThemeSetting = loadThemeSetting;
  window.applyTheme = applyTheme;
})();
